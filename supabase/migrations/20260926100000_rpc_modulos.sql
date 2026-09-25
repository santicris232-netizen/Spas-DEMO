-- =============================================================================
-- CristaSpa v2 · 09 · RPC de los módulos jefe y desarrollador
-- Equipo (desactivar/reactivar con reasignación de citas), horarios atómicos,
-- métricas de empresa y de plataforma, búsqueda global de usuarios y apoyo a
-- las Edge Functions de invitación.
-- Referencia: docs/flujos/09-modulo-jefe.md, docs/flujos/12-modulo-desarrollador.md
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Equipo
-- -----------------------------------------------------------------------------

/**
 * Desactiva un especialista. Sus citas futuras activas se reasignan a p_reasignar_a
 * cuando ese horario está libre; las demás quedan sin especialista para que el jefe
 * las resuelva. También desactiva su membresía (pierde el acceso).
 */
create or replace function public.desactivar_empleado(p_empleado uuid, p_reasignar_a uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_emp          public.empleados;
  v_cita         public.citas;
  v_servicios    uuid[];
  v_reasignadas  integer := 0;
  v_sin_asignar  integer := 0;
begin
  perform public._exigir_sesion();
  select * into v_emp from public.empleados where id = p_empleado for update;
  if not found then
    perform public._error('empleado_no_encontrado', 'El especialista no existe.');
  end if;
  if not (public.es_developer() or public.tiene_rol(v_emp.empresa_id, array['boss'])) then
    perform public._error('sin_permiso', 'Solo el jefe puede desactivar especialistas.');
  end if;
  if p_reasignar_a is not null and (p_reasignar_a = p_empleado or not exists (
    select 1 from public.empleados where id = p_reasignar_a and empresa_id = v_emp.empresa_id and activo
  )) then
    perform public._error('especialista_invalido', 'Elige otro especialista activo para reasignar las citas.');
  end if;

  for v_cita in
    select * from public.citas
    where empleado_id = p_empleado and estado in ('pendiente', 'confirmada') and inicio > now()
    order by inicio
    for update
  loop
    select array_agg(cs.servicio_id) into v_servicios from public.cita_servicios cs where cs.cita_id = v_cita.id;
    if p_reasignar_a is not null
       and array_position(v_servicios, null) is null
       and public._empleado_apto(v_emp.empresa_id, p_reasignar_a, v_servicios)
       and public._slot_libre(v_emp.empresa_id, p_reasignar_a, v_cita.inicio, v_cita.fin, v_cita.id) then
      update public.citas set empleado_id = p_reasignar_a where id = v_cita.id;
      v_reasignadas := v_reasignadas + 1;
    else
      update public.citas set empleado_id = null where id = v_cita.id;
      v_sin_asignar := v_sin_asignar + 1;
    end if;
  end loop;

  update public.empleados set activo = false where id = p_empleado;
  if v_emp.usuario_id is not null then
    update public.membresias set activo = false
    where usuario_id = v_emp.usuario_id and empresa_id = v_emp.empresa_id and rol = 'employee';
  end if;

  return jsonb_build_object('reasignadas', v_reasignadas, 'sin_asignar', v_sin_asignar);
end;
$$;

/** Reactiva un especialista y su membresía. */
create or replace function public.reactivar_empleado(p_empleado uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_emp public.empleados;
begin
  perform public._exigir_sesion();
  select * into v_emp from public.empleados where id = p_empleado;
  if not found then
    perform public._error('empleado_no_encontrado', 'El especialista no existe.');
  end if;
  if not (public.es_developer() or public.tiene_rol(v_emp.empresa_id, array['boss'])) then
    perform public._error('sin_permiso', 'Solo el jefe puede reactivar especialistas.');
  end if;
  update public.empleados set activo = true where id = p_empleado;
  if v_emp.usuario_id is not null then
    update public.membresias set activo = true
    where usuario_id = v_emp.usuario_id and empresa_id = v_emp.empresa_id;
  end if;
end;
$$;

/** Activa o desactiva el acceso de un miembro del equipo (jefe o recepción). */
create or replace function public.cambiar_acceso_miembro(p_empresa uuid, p_usuario uuid, p_activo boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_memb public.membresias;
begin
  perform public._exigir_sesion();
  if not (public.es_developer() or public.tiene_rol(p_empresa, array['boss'])) then
    perform public._error('sin_permiso', 'Solo el jefe puede gestionar el acceso del equipo.');
  end if;
  select * into v_memb from public.membresias where usuario_id = p_usuario and empresa_id = p_empresa for update;
  if not found or v_memb.rol = 'user' then
    perform public._error('miembro_no_encontrado', 'La persona no pertenece al equipo.');
  end if;
  if not p_activo and v_memb.rol = 'boss' and (
    select count(*) from public.membresias
    where empresa_id = p_empresa and rol = 'boss' and activo
  ) <= 1 then
    perform public._error('ultimo_jefe', 'La empresa debe conservar al menos un jefe activo.');
  end if;
  update public.membresias set activo = p_activo where usuario_id = p_usuario and empresa_id = p_empresa;
end;
$$;

/**
 * Reemplaza de forma atómica los horarios de la empresa (p_empleado null) o de un especialista.
 * p_franjas: [{ "dia_semana": 1, "hora_inicio": "09:00", "hora_fin": "13:00" }, ...]
 * Con p_empleado y lista vacía, el especialista vuelve a usar el horario de la empresa.
 */
create or replace function public.guardar_horarios(p_empresa uuid, p_empleado uuid, p_franjas jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_franja jsonb;
begin
  perform public._exigir_sesion();
  if not (public.es_developer() or public.tiene_rol(p_empresa, array['boss'])) then
    perform public._error('sin_permiso', 'Solo el jefe puede cambiar los horarios.');
  end if;
  if p_empleado is not null and not exists (
    select 1 from public.empleados where id = p_empleado and empresa_id = p_empresa
  ) then
    perform public._error('empleado_no_encontrado', 'El especialista no existe.');
  end if;
  if jsonb_typeof(coalesce(p_franjas, '[]'::jsonb)) <> 'array' then
    perform public._error('dato_invalido', 'Formato de horarios inválido.');
  end if;

  delete from public.horarios_atencion
  where empresa_id = p_empresa and empleado_id is not distinct from p_empleado;

  for v_franja in select * from jsonb_array_elements(coalesce(p_franjas, '[]'::jsonb)) loop
    if (v_franja ->> 'hora_fin')::time <= (v_franja ->> 'hora_inicio')::time then
      perform public._error('horario_invalido', 'La hora de cierre debe ser posterior a la de apertura.');
    end if;
    insert into public.horarios_atencion (empresa_id, empleado_id, dia_semana, hora_inicio, hora_fin)
    values (p_empresa, p_empleado, (v_franja ->> 'dia_semana')::smallint,
            (v_franja ->> 'hora_inicio')::time, (v_franja ->> 'hora_fin')::time);
  end loop;

  if exists (
    select 1
    from public.horarios_atencion a
    join public.horarios_atencion b
      on a.empresa_id = b.empresa_id and a.empleado_id is not distinct from b.empleado_id
     and a.dia_semana = b.dia_semana and a.id < b.id
     and a.hora_inicio < b.hora_fin and b.hora_inicio < a.hora_fin
    where a.empresa_id = p_empresa and a.empleado_id is not distinct from p_empleado
  ) then
    perform public._error('horario_superpuesto', 'Hay franjas que se cruzan el mismo día.');
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Métricas
-- -----------------------------------------------------------------------------

/** Indicadores del mes y checklist de puesta en marcha de una empresa (jefe o developer). */
create or replace function public.metricas_empresa(p_empresa uuid, p_desde date default null, p_hasta date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz     text;
  v_desde  timestamptz;
  v_hasta  timestamptz;
  v_hoy    date;
  v_config public.empresa_config;
  v_emp    public.empresas;
begin
  perform public._exigir_sesion();
  if not (public.es_developer() or public.tiene_rol(p_empresa, array['boss'])) then
    perform public._error('sin_permiso', 'Solo el jefe puede ver los indicadores.');
  end if;
  select * into v_emp from public.empresas where id = p_empresa;
  select * into v_config from public.empresa_config where empresa_id = p_empresa;
  v_tz := v_emp.zona_horaria;
  v_hoy := (now() at time zone v_tz)::date;
  v_desde := coalesce(p_desde, date_trunc('month', v_hoy)::date)::timestamp at time zone v_tz;
  v_hasta := (coalesce(p_hasta, (date_trunc('month', v_hoy) + interval '1 month - 1 day')::date) + 1)::timestamp at time zone v_tz;

  return jsonb_build_object(
    'por_estado', coalesce((
      select jsonb_object_agg(estado, n) from (
        select c.estado, count(*) as n from public.citas c
        where c.empresa_id = p_empresa and c.inicio >= v_desde and c.inicio < v_hasta
        group by c.estado
      ) x
    ), '{}'::jsonb),
    'ingresos_completadas', (
      select coalesce(sum(c.total), 0) from public.citas c
      where c.empresa_id = p_empresa and c.estado = 'completada' and c.inicio >= v_desde and c.inicio < v_hasta
    ),
    'servicios_top', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', nombre, 'cantidad', n) order by n desc) from (
        select cs.nombre, count(*) as n
        from public.cita_servicios cs join public.citas c on c.id = cs.cita_id
        where c.empresa_id = p_empresa and c.estado <> 'cancelada' and c.inicio >= v_desde and c.inicio < v_hasta
        group by cs.nombre order by n desc limit 5
      ) x
    ), '[]'::jsonb),
    'por_especialista', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', e.nombre, 'citas', n, 'minutos', minutos) order by n desc) from (
        select c.empleado_id, count(*) as n, sum(extract(epoch from (c.fin - c.inicio)) / 60)::integer as minutos
        from public.citas c
        where c.empresa_id = p_empresa and c.estado in ('confirmada', 'completada', 'pendiente')
          and c.inicio >= v_desde and c.inicio < v_hasta and c.empleado_id is not null
        group by c.empleado_id
      ) x join public.empleados e on e.id = x.empleado_id
    ), '[]'::jsonb),
    'checklist', jsonb_build_object(
      'logo', v_emp.logo_path is not null,
      'servicios', exists (select 1 from public.servicios where empresa_id = p_empresa and activo),
      'horarios', exists (select 1 from public.horarios_atencion where empresa_id = p_empresa),
      'equipo', exists (
        select 1 from public.empleados e
        where e.empresa_id = p_empresa and e.activo
          and exists (select 1 from public.empleado_servicios es where es.empleado_id = e.id)
      ),
      'whatsapp', coalesce(btrim(v_config.whatsapp), '') <> '',
      'primera_cita', exists (select 1 from public.citas where empresa_id = p_empresa)
    ),
    'sin_asignar', (
      select count(*) from public.citas c
      where c.empresa_id = p_empresa and c.empleado_id is null and c.estado in ('pendiente', 'confirmada') and c.inicio > now()
    )
  );
end;
$$;

/** Indicadores globales de la plataforma (solo developer). */
create or replace function public.metricas_plataforma()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._exigir_sesion();
  if not public.es_developer() then
    perform public._error('sin_permiso', 'Solo un developer puede ver las métricas de la plataforma.');
  end if;

  return jsonb_build_object(
    'por_estado', coalesce((
      select jsonb_object_agg(estado, n) from (
        select estado, count(*) as n from public.empresas group by estado
      ) x
    ), '{}'::jsonb),
    'nuevas_30_dias', (select count(*) from public.empresas where created_at > now() - interval '30 days'),
    'pruebas_por_vencer', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre, 'slug', slug, 'prueba_hasta', prueba_hasta) order by prueba_hasta)
      from public.empresas
      where estado = 'prueba' and prueba_hasta between current_date and current_date + 7
    ), '[]'::jsonb),
    'citas_mes', (select count(*) from public.citas where created_at >= date_trunc('month', now())),
    'top_empresas', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', e.nombre, 'slug', e.slug, 'citas', x.n) order by x.n desc) from (
        select empresa_id, count(*) as n from public.citas
        where created_at >= date_trunc('month', now()) group by empresa_id order by n desc limit 10
      ) x join public.empresas e on e.id = x.empresa_id
    ), '[]'::jsonb),
    'usuarios_por_rol', coalesce((
      select jsonb_object_agg(rol, n) from (
        select rol, count(*) as n from public.membresias where activo group by rol
      ) x
    ), '{}'::jsonb),
    'sin_actividad_14_dias', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', e.nombre, 'slug', e.slug, 'ultima_cita', u.ultima) order by u.ultima nulls first)
      from public.empresas e
      left join lateral (select max(c.created_at) as ultima from public.citas c where c.empresa_id = e.id) u on true
      where e.estado in ('prueba', 'activa') and (u.ultima is null or u.ultima < now() - interval '14 days')
    ), '[]'::jsonb)
  );
end;
$$;

/** Resumen por empresa para la lista del módulo desarrollador. */
create or replace function public.resumen_empresas()
returns table (
  id uuid, slug text, nombre text, estado text, plan text, logo_path text, prueba_hasta date,
  created_at timestamptz, empleados bigint, clientes bigint, citas_mes bigint, jefes jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._exigir_sesion();
  if not public.es_developer() then
    perform public._error('sin_permiso', 'Solo un developer puede listar empresas.');
  end if;
  return query
  select e.id, e.slug, e.nombre, e.estado, e.plan, e.logo_path, e.prueba_hasta, e.created_at,
    (select count(*) from public.empleados x where x.empresa_id = e.id and x.activo),
    (select count(*) from public.clientes x where x.empresa_id = e.id and x.anonimizado_at is null),
    (select count(*) from public.citas x where x.empresa_id = e.id and x.created_at >= date_trunc('month', now())),
    coalesce((
      select jsonb_agg(jsonb_build_object('usuario_id', m.usuario_id, 'nombre', trim(p.nombre || ' ' || p.apellido),
                                          'correo', u.email, 'activo', m.activo, 'confirmado', u.email_confirmed_at is not null))
      from public.membresias m
      join public.perfiles p on p.id = m.usuario_id
      join auth.users u on u.id = m.usuario_id
      where m.empresa_id = e.id and m.rol = 'boss'
    ), '[]'::jsonb)
  from public.empresas e
  order by e.created_at desc;
end;
$$;

-- -----------------------------------------------------------------------------
-- Usuarios (developer)
-- -----------------------------------------------------------------------------

/** Busca usuarios por correo o nombre en toda la plataforma (solo developer). */
create or replace function public.buscar_usuarios(p_texto text)
returns table (id uuid, correo text, nombre text, es_developer boolean, confirmado boolean, membresias jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._exigir_sesion();
  if not public.es_developer() then
    perform public._error('sin_permiso', 'Solo un developer puede buscar usuarios.');
  end if;
  if char_length(btrim(coalesce(p_texto, ''))) < 3 then
    perform public._error('busqueda_corta', 'Escribe al menos 3 caracteres.');
  end if;
  return query
  select u.id, u.email::text, trim(p.nombre || ' ' || p.apellido), p.es_developer, u.email_confirmed_at is not null,
    coalesce((
      select jsonb_agg(jsonb_build_object('empresa_id', e.id, 'empresa', e.nombre, 'slug', e.slug, 'rol', m.rol, 'activo', m.activo))
      from public.membresias m join public.empresas e on e.id = m.empresa_id
      where m.usuario_id = u.id
    ), '[]'::jsonb)
  from auth.users u
  join public.perfiles p on p.id = u.id
  where u.email ilike '%' || btrim(p_texto) || '%'
     or (p.nombre || ' ' || p.apellido) ilike '%' || btrim(p_texto) || '%'
  order by u.email
  limit 50;
end;
$$;

/** Registra en auditoría que un developer entró a una empresa en modo soporte. */
create or replace function public.registrar_soporte(p_empresa uuid, p_edicion boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._exigir_sesion();
  if not public.es_developer() then
    perform public._error('sin_permiso', 'Solo un developer puede usar el modo soporte.');
  end if;
  perform public.registrar_auditoria(p_empresa, case when p_edicion then 'soporte_edicion' else 'ver_como_empresa' end,
                                     'empresas', p_empresa::text);
end;
$$;

-- -----------------------------------------------------------------------------
-- Apoyo a Edge Functions (solo service_role)
-- -----------------------------------------------------------------------------

/** Id del usuario de Auth con ese correo, o null. */
create or replace function public._usuario_por_correo(p_correo text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from auth.users u where lower(u.email) = lower(btrim(p_correo)) limit 1;
$$;

-- -----------------------------------------------------------------------------
-- Permisos
-- -----------------------------------------------------------------------------

revoke execute on function
  public.desactivar_empleado(uuid, uuid),
  public.reactivar_empleado(uuid),
  public.cambiar_acceso_miembro(uuid, uuid, boolean),
  public.guardar_horarios(uuid, uuid, jsonb),
  public.metricas_empresa(uuid, date, date),
  public.metricas_plataforma(),
  public.resumen_empresas(),
  public.buscar_usuarios(text),
  public.registrar_soporte(uuid, boolean),
  public._usuario_por_correo(text)
from public, anon, authenticated;

grant execute on function
  public.desactivar_empleado(uuid, uuid),
  public.reactivar_empleado(uuid),
  public.cambiar_acceso_miembro(uuid, uuid, boolean),
  public.guardar_horarios(uuid, uuid, jsonb),
  public.metricas_empresa(uuid, date, date),
  public.metricas_plataforma(),
  public.resumen_empresas(),
  public.buscar_usuarios(text),
  public.registrar_soporte(uuid, boolean)
to authenticated;

grant execute on function public._usuario_por_correo(text) to service_role;
