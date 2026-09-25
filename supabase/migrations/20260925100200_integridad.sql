-- =============================================================================
-- CristaSpa v2 · 03 · Triggers de integridad y auditoría
-- Referencia: docs/flujos/04-modelo-de-datos.md#triggers, docs/flujos/05-seguridad.md
-- =============================================================================

-- -----------------------------------------------------------------------------
-- empresa_id inmutable (amenaza T4)
-- -----------------------------------------------------------------------------

create or replace function public.bloquear_cambio_empresa()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.empresa_id is distinct from old.empresa_id then
    raise exception 'empresa_id no se puede modificar' using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
declare
  tabla text;
begin
  foreach tabla in array array[
    'membresias', 'empresa_config', 'categorias', 'servicios', 'productos', 'empleados',
    'empleado_servicios', 'clientes', 'horarios_atencion', 'bloqueos_agenda', 'citas', 'cita_servicios'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.bloquear_cambio_empresa()',
      tabla || '_empresa_inmutable', tabla
    );
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- es_developer solo lo cambia un developer o SQL directo (amenaza T2)
-- -----------------------------------------------------------------------------

create or replace function public.proteger_es_developer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.es_developer is distinct from old.es_developer
     and auth.uid() is not null
     and not public.es_developer() then
    raise exception 'No tienes permiso para cambiar es_developer' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger perfiles_proteger_developer before update on public.perfiles
  for each row execute function public.proteger_es_developer();

-- -----------------------------------------------------------------------------
-- Límites del plan (empleados y servicios activos)
-- -----------------------------------------------------------------------------

create or replace function public.validar_limites_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limite integer;
  v_actual integer;
  v_clave  text := case tg_table_name when 'empleados' then 'max_empleados' else 'max_servicios' end;
begin
  if not new.activo then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.activo then
    return new;
  end if;

  select (e.limites ->> v_clave)::integer into v_limite
  from public.empresas e where e.id = new.empresa_id;

  if v_limite is null then
    return new;
  end if;

  execute format('select count(*) from public.%I where empresa_id = $1 and activo', tg_table_name)
    into v_actual using new.empresa_id;

  if v_actual >= v_limite then
    raise exception 'Tu plan permite % %. Contacta a CristaSpa para ampliarlo.',
      v_limite, case tg_table_name when 'empleados' then 'empleados' else 'servicios' end
      using errcode = 'P0001', hint = 'limite_plan';
  end if;
  return new;
end;
$$;

create trigger empleados_limite_plan before insert or update of activo on public.empleados
  for each row execute function public.validar_limites_plan();
create trigger servicios_limite_plan before insert or update of activo on public.servicios
  for each row execute function public.validar_limites_plan();

-- -----------------------------------------------------------------------------
-- Auditoría automática de tablas sensibles
-- -----------------------------------------------------------------------------

create or replace function public.auditar_cambios()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fila    jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_empresa uuid;
  v_id      text;
begin
  v_empresa := case when tg_table_name = 'empresas' then (v_fila ->> 'id')::uuid else (v_fila ->> 'empresa_id')::uuid end;
  v_id := coalesce(v_fila ->> 'id', v_fila ->> 'usuario_id');

  -- Al purgar una empresa, sus filas se borran en cascada: la auditoría queda sin FK
  -- (el empresa_id sigue disponible dentro de "antes").
  if tg_op = 'DELETE' and not exists (select 1 from public.empresas e where e.id = v_empresa) then
    v_empresa := null;
  end if;

  insert into public.auditoria (empresa_id, actor_id, accion, entidad, entidad_id, antes, despues)
  values (
    v_empresa,
    auth.uid(),
    case tg_op when 'INSERT' then 'crear' when 'UPDATE' then 'actualizar' else 'eliminar' end,
    tg_table_name,
    v_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end;
$$;

do $$
declare
  tabla text;
begin
  foreach tabla in array array['empresas', 'membresias', 'empleados', 'servicios', 'citas'] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.auditar_cambios()',
      tabla || '_auditar', tabla
    );
  end loop;
end;
$$;
