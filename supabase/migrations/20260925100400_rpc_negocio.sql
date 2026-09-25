-- =============================================================================
-- CristaSpa v2 · 05 · Funciones RPC de negocio
-- Todo lo que el navegador no puede decidir solo (precios, horarios, estados,
-- pertenencia a una empresa) se valida aquí, en el servidor.
--
-- Convención de errores: mensaje en español para mostrar al usuario y un código
-- estable en HINT para que el frontend decida qué hacer.
--   42501 + hint 'sin_permiso'   · P0001 + hint '<codigo_de_negocio>'
-- Referencia: docs/flujos/04-modelo-de-datos.md#funciones-rpc-de-negocio,
--             docs/flujos/08-flujo-citas.md
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Auxiliares internas (prefijo _ ; no se exponen al navegador)
-- -----------------------------------------------------------------------------

create or replace function public._error(p_codigo text, p_mensaje text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_codigo = 'sin_permiso' then
    raise exception '%', p_mensaje using errcode = '42501', hint = p_codigo;
  end if;
  raise exception '%', p_mensaje using errcode = 'P0001', hint = p_codigo;
end;
$$;

create or replace function public._exigir_sesion()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
begin
  if auth.uid() is null then
    perform public._error('sin_sesion', 'Debes iniciar sesión.');
  end if;
  return auth.uid();
end;
$$;

/** Duración total (min) y total ($) de una lista de servicios activos de la empresa. */
create or replace function public._resumen_servicios(
  p_empresa   uuid,
  p_servicios uuid[],
  out duracion_min integer,
  out total numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_encontrados integer;
begin
  if p_servicios is null or cardinality(p_servicios) = 0 then
    perform public._error('sin_servicios', 'Selecciona al menos un servicio.');
  end if;
  if cardinality(p_servicios) <> (select count(distinct s) from unnest(p_servicios) s) then
    perform public._error('servicios_repetidos', 'Hay servicios repetidos en la selección.');
  end if;

  select count(*), coalesce(sum(s.duracion_min), 0), coalesce(sum(s.precio), 0)
    into v_encontrados, duracion_min, total
  from public.servicios s
  where s.empresa_id = p_empresa and s.id = any (p_servicios) and s.activo;

  if v_encontrados <> cardinality(p_servicios) then
    perform public._error('servicio_no_disponible', 'Uno de los servicios ya no está disponible.');
  end if;
end;
$$;

/** ¿El especialista está activo y atiende todos los servicios? */
create or replace function public._empleado_apto(p_empresa uuid, p_empleado uuid, p_servicios uuid[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.empleados e
    where e.id = p_empleado and e.empresa_id = p_empresa and e.activo
  )
  and (
    select count(distinct es.servicio_id)
    from public.empleado_servicios es
    where es.empleado_id = p_empleado and es.servicio_id = any (p_servicios)
  ) = (select count(distinct s) from unnest(p_servicios) s);
$$;

/**
 * ¿El especialista puede atender en [p_inicio, p_fin)? Revisa horario (propio o de la
 * empresa), bloqueos y citas activas. p_ignorar excluye una cita (al reprogramar).
 */
create or replace function public._slot_libre(
  p_empresa  uuid,
  p_empleado uuid,
  p_inicio   timestamptz,
  p_fin      timestamptz,
  p_ignorar  uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz     text;
  v_ini    timestamp;
  v_fin    timestamp;
  v_propio boolean;
begin
  select e.zona_horaria into v_tz from public.empresas e where e.id = p_empresa;
  v_ini := p_inicio at time zone v_tz;
  v_fin := p_fin at time zone v_tz;

  -- La cita debe caber dentro de una franja del mismo día.
  v_propio := exists (
    select 1 from public.horarios_atencion h
    where h.empresa_id = p_empresa and h.empleado_id = p_empleado
  );
  if not exists (
    select 1 from public.horarios_atencion h
    where h.empresa_id = p_empresa
      and (case when v_propio then h.empleado_id = p_empleado else h.empleado_id is null end)
      and h.dia_semana = extract(dow from v_ini)
      and v_ini::date + h.hora_inicio <= v_ini
      and v_ini::date + h.hora_fin >= v_fin
  ) then
    return false;
  end if;

  if exists (
    select 1 from public.bloqueos_agenda b
    where b.empresa_id = p_empresa
      and (b.empleado_id is null or b.empleado_id = p_empleado)
      and tstzrange(b.inicio, b.fin, '[)') && tstzrange(p_inicio, p_fin, '[)')
  ) then
    return false;
  end if;

  return not exists (
    select 1 from public.citas c
    where c.empleado_id = p_empleado
      and c.estado in ('pendiente', 'confirmada')
      and c.id is distinct from p_ignorar
      and tstzrange(c.inicio, c.fin, '[)') && tstzrange(p_inicio, p_fin, '[)')
  );
end;
$$;

/** Valida la ventana de reserva para un cliente (anticipación y días máximos). */
create or replace function public._validar_ventana_cliente(p_empresa uuid, p_inicio timestamptz)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cfg public.empresa_config;
  v_tz  text;
begin
  select * into v_cfg from public.empresa_config where empresa_id = p_empresa;
  select zona_horaria into v_tz from public.empresas where id = p_empresa;

  if p_inicio < now() + make_interval(hours => v_cfg.anticipacion_min_horas) then
    perform public._error('anticipacion_minima',
      format('Las reservas deben hacerse con al menos %s horas de anticipación.', v_cfg.anticipacion_min_horas));
  end if;
  if (p_inicio at time zone v_tz)::date > (now() at time zone v_tz)::date + v_cfg.dias_reserva_max then
    perform public._error('fuera_de_rango',
      format('Solo se puede reservar hasta %s días adelante.', v_cfg.dias_reserva_max));
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Contexto de sesión
-- -----------------------------------------------------------------------------

/**
 * Contexto del usuario para el frontend: perfil, si es developer, sus membresías
 * (incluidas empresas suspendidas, para poder explicar por qué no entra) y, si se
 * pasa un slug, la empresa y su rol en ella.
 */
create or replace function public.mi_contexto(p_slug text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_dev     boolean;
  v_empresa public.empresas;
  v_rol     text;
begin
  if v_uid is null then
    return jsonb_build_object('autenticado', false);
  end if;

  v_dev := public.es_developer();

  if p_slug is not null then
    select * into v_empresa from public.empresas e where e.slug = lower(btrim(p_slug));
    if found then
      v_rol := public.mi_rol(v_empresa.id);
      if not v_dev and not exists (
        select 1 from public.membresias m where m.usuario_id = v_uid and m.empresa_id = v_empresa.id
      ) then
        v_empresa := null;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'autenticado', true,
    'usuario_id', v_uid,
    'es_developer', v_dev,
    'perfil', (select jsonb_build_object('nombre', p.nombre, 'apellido', p.apellido, 'telefono', p.telefono)
               from public.perfiles p where p.id = v_uid),
    'membresias', coalesce((
      select jsonb_agg(jsonb_build_object(
               'empresa_id', e.id, 'slug', e.slug, 'nombre', e.nombre, 'logo_path', e.logo_path,
               'estado_empresa', e.estado, 'rol', m.rol, 'activo', m.activo
             ) order by e.nombre)
      from public.membresias m
      join public.empresas e on e.id = m.empresa_id
      where m.usuario_id = v_uid and e.estado <> 'eliminada'
    ), '[]'::jsonb),
    'empresa', case when v_empresa.id is null then null else jsonb_build_object(
      'id', v_empresa.id, 'slug', v_empresa.slug, 'nombre', v_empresa.nombre, 'estado', v_empresa.estado,
      'zona_horaria', v_empresa.zona_horaria, 'moneda', v_empresa.moneda, 'logo_path', v_empresa.logo_path,
      'color_primario', v_empresa.color_primario, 'color_secundario', v_empresa.color_secundario,
      'color_acento', v_empresa.color_acento
    ) end,
    'rol', v_rol
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Clientes: registro y datos propios
-- -----------------------------------------------------------------------------

/**
 * Une al usuario autenticado como cliente de la empresa del slug. Si el jefe ya
 * lo había creado con el mismo correo (sin cuenta), se vincula esa ficha.
 * Solo se vincula por correo verificado por Supabase Auth, nunca por teléfono.
 */
create or replace function public.unirse_como_cliente(
  p_slug             text,
  p_nombre           text,
  p_apellido         text,
  p_telefono         text,
  p_fecha_nacimiento date,
  p_acepta_datos     boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := public._exigir_sesion();
  v_empresa uuid;
  v_memb    public.membresias;
  v_correo  text;
  v_cliente uuid;
begin
  if not coalesce(p_acepta_datos, false) then
    perform public._error('debe_aceptar_datos', 'Debes aceptar el tratamiento de datos personales.');
  end if;
  if coalesce(btrim(p_nombre), '') = '' then
    perform public._error('nombre_requerido', 'El nombre es obligatorio.');
  end if;

  select e.id into v_empresa from public.empresas e
  where e.slug = lower(btrim(p_slug)) and e.estado in ('prueba', 'activa');
  if v_empresa is null then
    perform public._error('empresa_no_disponible', 'Esta empresa no está disponible.');
  end if;

  select * into v_memb from public.membresias m where m.usuario_id = v_uid and m.empresa_id = v_empresa;
  if found and v_memb.rol <> 'user' then
    perform public._error('ya_es_miembro', 'Ya perteneces a esta empresa como parte del equipo.');
  end if;
  if found and not v_memb.activo then
    perform public._error('acceso_desactivado', 'Tu acceso a esta empresa fue desactivado.');
  end if;

  select u.email into v_correo from auth.users u where u.id = v_uid;

  insert into public.perfiles (id, nombre, apellido, telefono)
  values (v_uid, btrim(p_nombre), coalesce(btrim(p_apellido), ''), p_telefono)
  on conflict (id) do update
    set nombre   = coalesce(nullif(public.perfiles.nombre, ''), excluded.nombre),
        apellido = coalesce(nullif(public.perfiles.apellido, ''), excluded.apellido),
        telefono = coalesce(public.perfiles.telefono, excluded.telefono);

  select c.id into v_cliente from public.clientes c
  where c.empresa_id = v_empresa and c.usuario_id = v_uid;

  if v_cliente is null then
    select c.id into v_cliente from public.clientes c
    where c.empresa_id = v_empresa
      and c.usuario_id is null
      and c.anonimizado_at is null
      and v_correo is not null
      and lower(c.correo) = lower(v_correo);

    if v_cliente is not null then
      update public.clientes
        set usuario_id = v_uid,
            telefono = coalesce(telefono, p_telefono),
            fecha_nacimiento = coalesce(fecha_nacimiento, p_fecha_nacimiento),
            acepta_datos = true,
            acepta_datos_at = now()
      where id = v_cliente;
    else
      insert into public.clientes (empresa_id, usuario_id, nombre, apellido, telefono, correo,
                                   fecha_nacimiento, acepta_datos, acepta_datos_at)
      values (v_empresa, v_uid, btrim(p_nombre), coalesce(btrim(p_apellido), ''), p_telefono,
              lower(v_correo), p_fecha_nacimiento, true, now())
      returning id into v_cliente;
    end if;
  end if;

  insert into public.membresias (usuario_id, empresa_id, rol)
  values (v_uid, v_empresa, 'user')
  on conflict (usuario_id, empresa_id) do nothing;

  return v_cliente;
end;
$$;

/** El cliente actualiza sus propios datos (no puede tocar notas internas). */
create or replace function public.actualizar_mi_cliente(
  p_empresa          uuid,
  p_nombre           text,
  p_apellido         text,
  p_telefono         text,
  p_fecha_nacimiento date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente uuid;
begin
  perform public._exigir_sesion();
  v_cliente := public.mi_cliente_id(p_empresa);
  if v_cliente is null then
    perform public._error('sin_permiso', 'No eres cliente de esta empresa.');
  end if;
  if coalesce(btrim(p_nombre), '') = '' then
    perform public._error('nombre_requerido', 'El nombre es obligatorio.');
  end if;

  update public.clientes
    set nombre = btrim(p_nombre),
        apellido = coalesce(btrim(p_apellido), ''),
        telefono = p_telefono,
        fecha_nacimiento = p_fecha_nacimiento
  where id = v_cliente;
end;
$$;

/**
 * Derecho de supresión (Ley 1581): anonimiza la ficha del cliente, cancela sus citas
 * futuras y retira su membresía. Las citas pasadas quedan sin datos personales.
 */
create or replace function public.anonimizar_mi_cliente(p_empresa uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := public._exigir_sesion();
  v_cliente uuid := public.mi_cliente_id(p_empresa);
begin
  if v_cliente is null then
    perform public._error('sin_permiso', 'No eres cliente de esta empresa.');
  end if;

  update public.citas
    set estado = 'cancelada', cancelada_por = v_uid, cancelada_at = now(),
        motivo_cancelacion = 'El cliente eliminó su cuenta'
  where cliente_id = v_cliente and estado in ('pendiente', 'confirmada') and inicio > now();

  update public.clientes
    set nombre = 'Cliente eliminado', apellido = '', telefono = null, correo = null,
        fecha_nacimiento = null, notas_internas = null, usuario_id = null, anonimizado_at = now()
  where id = v_cliente;

  delete from public.membresias where usuario_id = v_uid and empresa_id = p_empresa;
end;
$$;

-- -----------------------------------------------------------------------------
-- Agenda
-- -----------------------------------------------------------------------------

/**
 * Horarios libres para un conjunto de servicios entre dos fechas (en la zona horaria
 * de la empresa). Con p_empleado null devuelve todos los especialistas aptos.
 * Clientes: respeta anticipación mínima y días máximos. Jefe/recepción: desde ahora.
 */
create or replace function public.disponibilidad(
  p_empresa   uuid,
  p_servicios uuid[],
  p_desde     date,
  p_hasta     date,
  p_empleado  uuid default null
)
returns table (inicio timestamptz, empleado_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_agenda boolean;
  v_cfg    public.empresa_config;
  v_tz     text;
  v_dur    integer;
  v_hoy    date;
  v_min    timestamptz;
  v_max    date;
  v_desde  date;
  v_hasta  date;
begin
  perform public._exigir_sesion();
  v_agenda := public.es_developer() or public.tiene_rol(p_empresa, array['boss', 'receptionist']);
  if not (v_agenda or public.tiene_rol(p_empresa, array['employee', 'user'])) then
    perform public._error('sin_permiso', 'No tienes acceso a esta empresa.');
  end if;

  select * into v_cfg from public.empresa_config c where c.empresa_id = p_empresa;
  select e.zona_horaria into v_tz from public.empresas e where e.id = p_empresa;
  select r.duracion_min into v_dur from public._resumen_servicios(p_empresa, p_servicios) r;

  v_hoy := (now() at time zone v_tz)::date;
  if v_agenda then
    v_min := now();
    v_max := v_hoy + 365;
  else
    v_min := now() + make_interval(hours => v_cfg.anticipacion_min_horas);
    v_max := v_hoy + v_cfg.dias_reserva_max;
  end if;

  v_desde := greatest(p_desde, v_hoy);
  v_hasta := least(p_hasta, v_max);
  if v_hasta < v_desde then
    return;
  end if;
  if v_hasta - v_desde > 62 then
    perform public._error('rango_muy_largo', 'Consulta como máximo dos meses a la vez.');
  end if;

  return query
  with aptos as (
    select e.id,
           exists (select 1 from public.horarios_atencion hp
                   where hp.empresa_id = p_empresa and hp.empleado_id = e.id) as horario_propio
    from public.empleados e
    where e.empresa_id = p_empresa
      and e.activo
      and (p_empleado is null or e.id = p_empleado)
      and public._empleado_apto(p_empresa, e.id, p_servicios)
  ),
  dias as (
    select d::date as dia
    from generate_series(v_desde::timestamp, v_hasta::timestamp, interval '1 day') d
  ),
  franjas as (
    select a.id as emp, d.dia, h.hora_inicio, h.hora_fin
    from aptos a
    cross join dias d
    join public.horarios_atencion h
      on h.empresa_id = p_empresa
     and h.dia_semana = extract(dow from d.dia)
     and (case when a.horario_propio then h.empleado_id = a.id else h.empleado_id is null end)
  ),
  candidatos as (
    select f.emp, (s at time zone v_tz) as ini
    from franjas f
    cross join lateral generate_series(
      f.dia + f.hora_inicio,
      f.dia + f.hora_fin - make_interval(mins => v_dur),
      make_interval(mins => v_cfg.intervalo_agenda_min)
    ) s
  )
  select c.ini, c.emp
  from candidatos c
  where c.ini >= v_min
    and not exists (
      select 1 from public.bloqueos_agenda b
      where b.empresa_id = p_empresa
        and (b.empleado_id is null or b.empleado_id = c.emp)
        and tstzrange(b.inicio, b.fin, '[)') && tstzrange(c.ini, c.ini + make_interval(mins => v_dur), '[)')
    )
    and not exists (
      select 1 from public.citas ct
      where ct.empleado_id = c.emp
        and ct.estado in ('pendiente', 'confirmada')
        and tstzrange(ct.inicio, ct.fin, '[)') && tstzrange(c.ini, c.ini + make_interval(mins => v_dur), '[)')
    )
  order by 1, 2;
end;
$$;

/**
 * Crea una cita. Cliente: para sí mismo, queda 'pendiente'. Jefe/recepción/developer:
 * para cualquier cliente, 'confirmada' por defecto. Con p_empleado null se asigna el
 * especialista apto con menos citas ese día. Calcula fin y total en el servidor.
 */
create or replace function public.reservar_cita(
  p_empresa   uuid,
  p_servicios uuid[],
  p_inicio    timestamptz,
  p_empleado  uuid default null,
  p_cliente   uuid default null,
  p_notas     text default '',
  p_estado    text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := public._exigir_sesion();
  v_rol     text := public.mi_rol(p_empresa);
  v_agenda  boolean := public.es_developer() or v_rol in ('boss', 'receptionist');
  v_cliente uuid;
  v_origen  text;
  v_estado  text;
  v_dur     integer;
  v_total   numeric;
  v_fin     timestamptz;
  v_emp     uuid;
  v_tz      text;
  v_id      uuid;
begin
  if v_agenda then
    if p_cliente is null or not exists (
      select 1 from public.clientes c
      where c.id = p_cliente and c.empresa_id = p_empresa and c.anonimizado_at is null
    ) then
      perform public._error('cliente_invalido', 'Selecciona un cliente válido.');
    end if;
    v_cliente := p_cliente;
    v_origen := case when v_rol = 'receptionist' then 'recepcion' else 'jefe' end;
    v_estado := coalesce(p_estado, 'confirmada');
    if v_estado not in ('pendiente', 'confirmada') then
      perform public._error('estado_invalido', 'Una cita nueva solo puede quedar pendiente o confirmada.');
    end if;
    if p_inicio < now() - interval '5 minutes' then
      perform public._error('fecha_pasada', 'No se puede agendar en una hora que ya pasó.');
    end if;
  elsif v_rol = 'user' then
    v_cliente := public.mi_cliente_id(p_empresa);
    if v_cliente is null then
      perform public._error('sin_permiso', 'No eres cliente de esta empresa.');
    end if;
    v_origen := 'usuario';
    v_estado := 'pendiente';
    perform public._validar_ventana_cliente(p_empresa, p_inicio);
  else
    perform public._error('sin_permiso', 'No puedes agendar citas en esta empresa.');
  end if;

  select r.duracion_min, r.total into v_dur, v_total from public._resumen_servicios(p_empresa, p_servicios) r;
  v_fin := p_inicio + make_interval(mins => v_dur);
  select e.zona_horaria into v_tz from public.empresas e where e.id = p_empresa;

  if p_empleado is not null then
    if not public._empleado_apto(p_empresa, p_empleado, p_servicios) then
      perform public._error('especialista_no_apto', 'El especialista no realiza todos los servicios elegidos.');
    end if;
    if not public._slot_libre(p_empresa, p_empleado, p_inicio, v_fin) then
      perform public._error('horario_ocupado', 'Ese horario ya no está disponible.');
    end if;
    v_emp := p_empleado;
  else
    select e.id into v_emp
    from public.empleados e
    where e.empresa_id = p_empresa
      and e.activo
      and public._empleado_apto(p_empresa, e.id, p_servicios)
      and public._slot_libre(p_empresa, e.id, p_inicio, v_fin)
    order by (
      select count(*) from public.citas c
      where c.empleado_id = e.id
        and c.estado in ('pendiente', 'confirmada')
        and (c.inicio at time zone v_tz)::date = (p_inicio at time zone v_tz)::date
    ), e.nombre
    limit 1;
    if v_emp is null then
      perform public._error('horario_ocupado', 'No hay especialistas disponibles en ese horario.');
    end if;
  end if;

  begin
    insert into public.citas (empresa_id, cliente_id, empleado_id, inicio, fin, estado, origen, total, notas, creado_por)
    values (p_empresa, v_cliente, v_emp, p_inicio, v_fin, v_estado, v_origen, v_total, coalesce(p_notas, ''), v_uid)
    returning id into v_id;
  exception
    when exclusion_violation then
      perform public._error('horario_ocupado', 'Ese horario se acaba de ocupar. Elige otro.');
  end;

  insert into public.cita_servicios (empresa_id, cita_id, servicio_id, nombre, precio, duracion_min, orden)
  select p_empresa, v_id, s.id, s.nombre, s.precio, s.duracion_min, array_position(p_servicios, s.id)
  from public.servicios s
  where s.empresa_id = p_empresa and s.id = any (p_servicios);

  return v_id;
end;
$$;

/**
 * Cambia el estado de una cita según la máquina de estados (docs/flujos/08-flujo-citas.md).
 *   Jefe/recepción: confirmar, cancelar, completar, no asistió.
 *   Empleado: completar / no asistió sus citas confirmadas, después de la hora de inicio.
 *   Cliente: cancelar las propias dentro del plazo configurado.
 *   Developer: cualquier cambio (corrección de soporte, queda auditado).
 */
create or replace function public.cambiar_estado_cita(p_cita uuid, p_estado text, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := public._exigir_sesion();
  v_cita   public.citas;
  v_dev    boolean := public.es_developer();
  v_agenda boolean;
  v_cfg    public.empresa_config;
begin
  if p_estado not in ('pendiente', 'confirmada', 'completada', 'cancelada', 'no_asistio') then
    perform public._error('estado_invalido', 'Estado de cita inválido.');
  end if;

  select * into v_cita from public.citas c where c.id = p_cita for update;
  if not found then
    perform public._error('cita_no_encontrada', 'La cita no existe.');
  end if;
  v_agenda := v_dev or public.tiene_rol(v_cita.empresa_id, array['boss', 'receptionist']);

  if not v_dev then
    -- 1) Permiso según el rol (antes que cualquier regla de estado, para no filtrar información).
    if v_agenda then
      null;
    elsif v_cita.empleado_id is not null and v_cita.empleado_id = public.mi_empleado_id(v_cita.empresa_id) then
      if p_estado not in ('completada', 'no_asistio') then
        perform public._error('sin_permiso', 'Solo puedes marcar tus citas como realizadas o no asistidas.');
      end if;
    elsif v_cita.cliente_id = public.mi_cliente_id(v_cita.empresa_id) then
      if p_estado <> 'cancelada' then
        perform public._error('sin_permiso', 'Solo puedes cancelar tus citas.');
      end if;
    else
      perform public._error('sin_permiso', 'No tienes permiso sobre esta cita.');
    end if;

    -- 2) Máquina de estados.
    if v_cita.estado in ('completada', 'cancelada', 'no_asistio') then
      perform public._error('estado_final', 'Esta cita ya está cerrada y no se puede cambiar.');
    end if;
    if not ((v_cita.estado = 'pendiente' and p_estado in ('confirmada', 'cancelada', 'completada'))
         or (v_cita.estado = 'confirmada' and p_estado in ('cancelada', 'completada', 'no_asistio'))) then
      perform public._error('transicion_invalida',
        format('No se puede pasar de %s a %s.', v_cita.estado, p_estado));
    end if;
    if p_estado in ('completada', 'no_asistio') and now() < v_cita.inicio then
      perform public._error('aun_no_inicia', 'La cita aún no ha comenzado.');
    end if;

    -- 3) Reglas propias de cada rol.
    if not v_agenda and p_estado in ('completada', 'no_asistio') and v_cita.estado <> 'confirmada' then
      perform public._error('transicion_invalida', 'Solo puedes cerrar citas confirmadas.');
    end if;
    if not v_agenda and p_estado = 'cancelada' then
      select * into v_cfg from public.empresa_config c where c.empresa_id = v_cita.empresa_id;
      if not v_cfg.usuario_puede_cancelar then
        perform public._error('cancelacion_no_permitida', 'Para cancelar comunícate con el negocio.');
      end if;
      if v_cita.inicio - now() < make_interval(hours => v_cfg.horas_limite_cancelacion) then
        perform public._error('fuera_de_plazo',
          format('Solo puedes cancelar hasta %s horas antes de la cita.', v_cfg.horas_limite_cancelacion));
      end if;
    end if;
  end if;

  update public.citas
    set estado = p_estado,
        cancelada_por      = case when p_estado = 'cancelada' then v_uid end,
        cancelada_at       = case when p_estado = 'cancelada' then now() end,
        motivo_cancelacion = case when p_estado = 'cancelada' then nullif(btrim(p_motivo), '') end
  where id = p_cita;
end;
$$;

/**
 * Mueve una cita activa a otro horario y/o especialista.
 * Cliente: solo las propias, si la empresa lo permite, dentro del plazo; vuelve a 'pendiente'.
 */
create or replace function public.reprogramar_cita(p_cita uuid, p_nuevo_inicio timestamptz, p_empleado uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cita      public.citas;
  v_agenda    boolean;
  v_cfg       public.empresa_config;
  v_servicios uuid[];
  v_dur       integer;
  v_emp       uuid;
  v_estado    text;
begin
  perform public._exigir_sesion();
  select * into v_cita from public.citas c where c.id = p_cita for update;
  if not found then
    perform public._error('cita_no_encontrada', 'La cita no existe.');
  end if;
  if v_cita.estado not in ('pendiente', 'confirmada') then
    perform public._error('estado_final', 'Solo se pueden reprogramar citas pendientes o confirmadas.');
  end if;

  v_agenda := public.es_developer() or public.tiene_rol(v_cita.empresa_id, array['boss', 'receptionist']);
  v_estado := v_cita.estado;

  if v_agenda then
    if p_nuevo_inicio < now() - interval '5 minutes' then
      perform public._error('fecha_pasada', 'No se puede agendar en una hora que ya pasó.');
    end if;
  elsif v_cita.cliente_id = public.mi_cliente_id(v_cita.empresa_id) then
    select * into v_cfg from public.empresa_config c where c.empresa_id = v_cita.empresa_id;
    if not v_cfg.usuario_puede_reprogramar then
      perform public._error('reprogramacion_no_permitida', 'Para reprogramar comunícate con el negocio.');
    end if;
    if v_cita.inicio - now() < make_interval(hours => v_cfg.horas_limite_cancelacion) then
      perform public._error('fuera_de_plazo',
        format('Solo puedes reprogramar hasta %s horas antes de la cita.', v_cfg.horas_limite_cancelacion));
    end if;
    perform public._validar_ventana_cliente(v_cita.empresa_id, p_nuevo_inicio);
    v_estado := 'pendiente';
  else
    perform public._error('sin_permiso', 'No tienes permiso sobre esta cita.');
  end if;

  select array_agg(cs.servicio_id order by cs.orden), sum(cs.duracion_min)
    into v_servicios, v_dur
  from public.cita_servicios cs
  where cs.cita_id = p_cita;

  v_emp := coalesce(p_empleado, v_cita.empleado_id);
  if v_emp is null then
    perform public._error('especialista_requerido', 'Elige un especialista.');
  end if;
  if array_position(v_servicios, null) is not null then
    perform public._error('servicio_no_disponible', 'Un servicio de esta cita ya no existe; crea una cita nueva.');
  end if;
  if not public._empleado_apto(v_cita.empresa_id, v_emp, v_servicios) then
    perform public._error('especialista_no_apto', 'El especialista no realiza todos los servicios de la cita.');
  end if;
  if not public._slot_libre(v_cita.empresa_id, v_emp, p_nuevo_inicio,
                            p_nuevo_inicio + make_interval(mins => v_dur), p_cita) then
    perform public._error('horario_ocupado', 'Ese horario ya no está disponible.');
  end if;

  begin
    update public.citas
      set inicio = p_nuevo_inicio,
          fin = p_nuevo_inicio + make_interval(mins => v_dur),
          empleado_id = v_emp,
          estado = v_estado
    where id = p_cita;
  exception
    when exclusion_violation then
      perform public._error('horario_ocupado', 'Ese horario se acaba de ocupar. Elige otro.');
  end;
end;
$$;

-- -----------------------------------------------------------------------------
-- Plataforma (solo developer)
-- -----------------------------------------------------------------------------

create or replace function public.soy_developer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.es_developer();
$$;

/**
 * Crea una empresa con su configuración, catálogo desde plantilla y horario por
 * defecto (lunes a sábado 09:00–18:00). Uso interno: la llaman crear_empresa y el seed.
 * p_datos: { slug, nombre, plantilla?, zona_horaria?, moneda?, plan?, dias_prueba?,
 *            color_primario?, color_secundario?, color_acento?, correo_contacto?,
 *            telefono_contacto?, razon_social?, nit?, limites? }
 */
create or replace function public._crear_empresa(p_datos jsonb, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id        uuid;
  v_plantilla jsonb;
  v_cat       jsonb;
  v_srv       jsonb;
  v_cat_id    uuid;
  v_orden_cat integer := 0;
  v_orden_srv integer;
begin
  insert into public.empresas (
    slug, nombre, razon_social, nit, correo_contacto, telefono_contacto,
    color_primario, color_secundario, color_acento, zona_horaria, moneda, plan,
    limites, prueba_hasta, creado_por
  ) values (
    lower(btrim(p_datos ->> 'slug')),
    btrim(p_datos ->> 'nombre'),
    p_datos ->> 'razon_social',
    p_datos ->> 'nit',
    p_datos ->> 'correo_contacto',
    p_datos ->> 'telefono_contacto',
    coalesce(p_datos ->> 'color_primario', '#175050'),
    coalesce(p_datos ->> 'color_secundario', '#faf6ee'),
    coalesce(p_datos ->> 'color_acento', '#c9a020'),
    coalesce(p_datos ->> 'zona_horaria', 'America/Bogota'),
    coalesce(p_datos ->> 'moneda', 'COP'),
    coalesce(p_datos ->> 'plan', 'basico'),
    coalesce(p_datos -> 'limites', '{"max_empleados": 5, "max_servicios": 50}'::jsonb),
    current_date + coalesce((p_datos ->> 'dias_prueba')::integer, 14),
    p_actor
  )
  returning id into v_id;

  select p.contenido into v_plantilla
  from public.plantillas p
  where p.clave = coalesce(p_datos ->> 'plantilla', 'vacia') and p.activo;
  if v_plantilla is null then
    perform public._error('plantilla_no_existe', 'La plantilla de catálogo no existe.');
  end if;

  for v_cat in select * from jsonb_array_elements(coalesce(v_plantilla -> 'categorias', '[]'::jsonb)) loop
    insert into public.categorias (empresa_id, nombre, slug, color, orden)
    values (v_id, v_cat ->> 'nombre', v_cat ->> 'slug', coalesce(v_cat ->> 'color', '#175050'), v_orden_cat)
    returning id into v_cat_id;
    v_orden_cat := v_orden_cat + 1;
    v_orden_srv := 0;

    for v_srv in select * from jsonb_array_elements(coalesce(v_cat -> 'servicios', '[]'::jsonb)) loop
      insert into public.servicios (empresa_id, categoria_id, nombre, descripcion, precio, duracion_min, orden)
      values (v_id, v_cat_id, v_srv ->> 'nombre', coalesce(v_srv ->> 'descripcion', ''),
              coalesce((v_srv ->> 'precio')::numeric, 0), coalesce((v_srv ->> 'duracion_min')::integer, 60),
              v_orden_srv);
      v_orden_srv := v_orden_srv + 1;
    end loop;
  end loop;

  insert into public.horarios_atencion (empresa_id, dia_semana, hora_inicio, hora_fin)
  select v_id, d, time '09:00', time '18:00' from generate_series(1, 6) d;

  return v_id;
end;
$$;

create or replace function public.crear_empresa(p_datos jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public._exigir_sesion();
begin
  if not public.es_developer() then
    perform public._error('sin_permiso', 'Solo un developer puede crear empresas.');
  end if;
  if exists (select 1 from public.empresas e where e.slug = lower(btrim(p_datos ->> 'slug'))) then
    perform public._error('slug_ocupado', 'Ese identificador de empresa ya está en uso.');
  end if;
  return public._crear_empresa(p_datos, v_uid);
end;
$$;

/** Cambia el estado de una empresa (prueba, activa, suspendida, eliminada). */
create or replace function public.cambiar_estado_empresa(p_empresa uuid, p_estado text, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._exigir_sesion();
  if not public.es_developer() then
    perform public._error('sin_permiso', 'Solo un developer puede cambiar el estado de una empresa.');
  end if;
  if p_estado not in ('prueba', 'activa', 'suspendida', 'eliminada') then
    perform public._error('estado_invalido', 'Estado de empresa inválido.');
  end if;
  if p_estado in ('suspendida', 'eliminada') and coalesce(btrim(p_motivo), '') = '' then
    perform public._error('motivo_requerido', 'Indica el motivo.');
  end if;

  update public.empresas
    set estado = p_estado,
        motivo_estado = nullif(btrim(p_motivo), ''),
        eliminado_at = case when p_estado = 'eliminada' then now() end
  where id = p_empresa;

  if not found then
    perform public._error('empresa_no_encontrada', 'La empresa no existe.');
  end if;
end;
$$;

/** Otorga o quita el rol developer. No permite quitar al último developer. */
create or replace function public.asignar_developer(p_usuario uuid, p_valor boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._exigir_sesion();
  if not public.es_developer() then
    perform public._error('sin_permiso', 'Solo un developer puede gestionar developers.');
  end if;
  if not p_valor and (select count(*) from public.perfiles where es_developer) <= 1
     and exists (select 1 from public.perfiles where id = p_usuario and es_developer) then
    perform public._error('ultimo_developer', 'No se puede quitar el rol al último developer.');
  end if;

  update public.perfiles set es_developer = p_valor where id = p_usuario;
  if not found then
    perform public._error('usuario_no_encontrado', 'El usuario no existe.');
  end if;
  perform public.registrar_auditoria(null, case when p_valor then 'otorgar_developer' else 'quitar_developer' end,
                                     'perfiles', p_usuario::text);
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos de ejecución: nada es público salvo lo que se concede explícitamente.
-- -----------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;

-- Usadas dentro de políticas RLS y vistas (se evalúan con el rol del que consulta).
grant execute on function
  public.es_developer(),
  public.tiene_rol(uuid, text[]),
  public.mi_rol(uuid),
  public.mi_empleado_id(uuid),
  public.mi_cliente_id(uuid)
to authenticated;

-- API de negocio para el navegador.
grant execute on function
  public.mi_contexto(text),
  public.soy_developer(),
  public.unirse_como_cliente(text, text, text, text, date, boolean),
  public.actualizar_mi_cliente(uuid, text, text, text, date),
  public.anonimizar_mi_cliente(uuid),
  public.disponibilidad(uuid, uuid[], date, date, uuid),
  public.reservar_cita(uuid, uuid[], timestamptz, uuid, uuid, text, text),
  public.cambiar_estado_cita(uuid, text, text),
  public.reprogramar_cita(uuid, timestamptz, uuid),
  public.crear_empresa(jsonb),
  public.cambiar_estado_empresa(uuid, text, text),
  public.asignar_developer(uuid, boolean)
to authenticated;
