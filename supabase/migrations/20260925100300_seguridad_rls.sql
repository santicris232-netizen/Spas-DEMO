-- =============================================================================
-- CristaSpa v2 · 04 · Seguridad: RLS, permisos y vistas
--
-- Grupos de roles (docs/flujos/03-roles-y-permisos.md):
--   ADMIN  = boss
--   AGENDA = boss, receptionist
--   EQUIPO = boss, receptionist, employee
--   TODOS  = boss, receptionist, employee, user
-- El developer (perfiles.es_developer) accede a todo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Funciones de identidad dentro de una empresa
-- -----------------------------------------------------------------------------

/** Ficha de empleado del usuario autenticado en la empresa (cualquier rol de equipo). */
create or replace function public.mi_empleado_id(p_empresa uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.id
  from public.empleados e
  where e.empresa_id = p_empresa
    and e.usuario_id = auth.uid()
    and e.activo
    and public.tiene_rol(p_empresa, array['boss', 'receptionist', 'employee']);
$$;

/** Ficha de cliente del usuario autenticado en la empresa (rol user). */
create or replace function public.mi_cliente_id(p_empresa uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.clientes c
  where c.empresa_id = p_empresa
    and c.usuario_id = auth.uid()
    and public.tiene_rol(p_empresa, array['user']);
$$;

-- -----------------------------------------------------------------------------
-- Activar RLS en todas las tablas
-- -----------------------------------------------------------------------------

alter table public.empresas           enable row level security;
alter table public.perfiles           enable row level security;
alter table public.membresias         enable row level security;
alter table public.plantillas         enable row level security;
alter table public.auditoria          enable row level security;
alter table public.empresa_config     enable row level security;
alter table public.categorias         enable row level security;
alter table public.servicios          enable row level security;
alter table public.productos          enable row level security;
alter table public.empleados          enable row level security;
alter table public.empleado_servicios enable row level security;
alter table public.clientes           enable row level security;
alter table public.horarios_atencion  enable row level security;
alter table public.bloqueos_agenda    enable row level security;
alter table public.citas              enable row level security;
alter table public.cita_servicios     enable row level security;

-- -----------------------------------------------------------------------------
-- Plataforma
-- -----------------------------------------------------------------------------

create policy empresas_select on public.empresas for select to authenticated
  using ((select public.es_developer())
         or public.tiene_rol(id, array['boss', 'receptionist', 'employee', 'user']));

create policy empresas_update on public.empresas for update to authenticated
  using ((select public.es_developer()) or public.tiene_rol(id, array['boss']))
  with check ((select public.es_developer()) or public.tiene_rol(id, array['boss']));

create policy perfiles_select on public.perfiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select public.es_developer())
    or exists (
      select 1 from public.membresias m
      where m.usuario_id = perfiles.id
        and public.tiene_rol(m.empresa_id, array['boss'])
    )
  );

create policy perfiles_update on public.perfiles for update to authenticated
  using (id = (select auth.uid()) or (select public.es_developer()))
  with check (id = (select auth.uid()) or (select public.es_developer()));

create policy membresias_select on public.membresias for select to authenticated
  using (
    usuario_id = (select auth.uid())
    or (select public.es_developer())
    or public.tiene_rol(empresa_id, array['boss'])
  );

create policy plantillas_developer on public.plantillas for all to authenticated
  using ((select public.es_developer()))
  with check ((select public.es_developer()));

create policy auditoria_select on public.auditoria for select to authenticated
  using ((select public.es_developer()) or public.tiene_rol(empresa_id, array['boss']));

-- -----------------------------------------------------------------------------
-- Configuración y catálogo
-- -----------------------------------------------------------------------------

create policy empresa_config_select on public.empresa_config for select to authenticated
  using ((select public.es_developer())
         or public.tiene_rol(empresa_id, array['boss', 'receptionist', 'employee', 'user']));

create policy empresa_config_update on public.empresa_config for update to authenticated
  using ((select public.es_developer()) or public.tiene_rol(empresa_id, array['boss']))
  with check ((select public.es_developer()) or public.tiene_rol(empresa_id, array['boss']));

do $$
declare
  tabla text;
begin
  foreach tabla in array array['categorias', 'servicios', 'productos'] loop
    execute format($f$
      create policy %1$I on public.%2$I for select to authenticated
        using ((select public.es_developer())
               or public.tiene_rol(empresa_id, array['boss', 'receptionist', 'employee'])
               or (activo and public.tiene_rol(empresa_id, array['user'])));
      create policy %3$I on public.%2$I for all to authenticated
        using ((select public.es_developer()) or public.tiene_rol(empresa_id, array['boss']))
        with check ((select public.es_developer()) or public.tiene_rol(empresa_id, array['boss']));
    $f$, tabla || '_select', tabla, tabla || '_admin');
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Equipo, horarios y bloqueos
-- -----------------------------------------------------------------------------

create policy empleados_select on public.empleados for select to authenticated
  using ((select public.es_developer())
         or public.tiene_rol(empresa_id, array['boss', 'receptionist', 'employee']));

create policy empleados_admin on public.empleados for all to authenticated
  using ((select public.es_developer()) or public.tiene_rol(empresa_id, array['boss']))
  with check ((select public.es_developer()) or public.tiene_rol(empresa_id, array['boss']));

create policy empleado_servicios_select on public.empleado_servicios for select to authenticated
  using ((select public.es_developer())
         or public.tiene_rol(empresa_id, array['boss', 'receptionist', 'employee', 'user']));

create policy empleado_servicios_admin on public.empleado_servicios for all to authenticated
  using ((select public.es_developer()) or public.tiene_rol(empresa_id, array['boss']))
  with check ((select public.es_developer()) or public.tiene_rol(empresa_id, array['boss']));

create policy horarios_select on public.horarios_atencion for select to authenticated
  using ((select public.es_developer())
         or public.tiene_rol(empresa_id, array['boss', 'receptionist', 'employee', 'user']));

create policy horarios_admin on public.horarios_atencion for all to authenticated
  using ((select public.es_developer()) or public.tiene_rol(empresa_id, array['boss']))
  with check ((select public.es_developer()) or public.tiene_rol(empresa_id, array['boss']));

create policy bloqueos_select on public.bloqueos_agenda for select to authenticated
  using ((select public.es_developer())
         or public.tiene_rol(empresa_id, array['boss', 'receptionist', 'employee']));

create policy bloqueos_gestion on public.bloqueos_agenda for all to authenticated
  using (
    (select public.es_developer())
    or public.tiene_rol(empresa_id, array['boss', 'receptionist'])
    or (empleado_id is not null and empleado_id = public.mi_empleado_id(empresa_id))
  )
  with check (
    (select public.es_developer())
    or public.tiene_rol(empresa_id, array['boss', 'receptionist'])
    or (empleado_id is not null and empleado_id = public.mi_empleado_id(empresa_id))
  );

-- -----------------------------------------------------------------------------
-- Clientes: solo jefe y recepción leen la tabla (tiene notas_internas).
-- El empleado usa citas_detalle y el cliente su vista mi_ficha_cliente.
-- -----------------------------------------------------------------------------

create policy clientes_select on public.clientes for select to authenticated
  using ((select public.es_developer()) or public.tiene_rol(empresa_id, array['boss', 'receptionist']));

create policy clientes_insert on public.clientes for insert to authenticated
  with check ((select public.es_developer()) or public.tiene_rol(empresa_id, array['boss', 'receptionist']));

create policy clientes_update on public.clientes for update to authenticated
  using ((select public.es_developer()) or public.tiene_rol(empresa_id, array['boss', 'receptionist']))
  with check ((select public.es_developer()) or public.tiene_rol(empresa_id, array['boss', 'receptionist']));

-- -----------------------------------------------------------------------------
-- Citas: lectura por RLS (necesaria para Realtime); escritura solo por RPC
-- -----------------------------------------------------------------------------

create policy citas_select on public.citas for select to authenticated
  using (
    (select public.es_developer())
    or public.tiene_rol(empresa_id, array['boss', 'receptionist'])
    or (empleado_id is not null and empleado_id = public.mi_empleado_id(empresa_id))
    or cliente_id = public.mi_cliente_id(empresa_id)
  );

create policy cita_servicios_select on public.cita_servicios for select to authenticated
  using (exists (select 1 from public.citas c where c.id = cita_servicios.cita_id));

-- -----------------------------------------------------------------------------
-- Privilegios de tabla y de columna (defensa en profundidad sobre RLS)
-- -----------------------------------------------------------------------------

-- El proyecto se crea con "Automatically expose new tables" desactivado: ninguna tabla
-- recibe permisos por defecto. Se parte de cero (por si acaso) y se concede lo mínimo.
-- anon no recibe nada: solo la vista empresas_publicas (más abajo).
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Catálogo, equipo y agenda interna: CRUD sujeto a RLS.
grant select, insert, update, delete on
  public.categorias, public.servicios, public.productos, public.empleados,
  public.empleado_servicios, public.horarios_atencion, public.bloqueos_agenda, public.plantillas
to authenticated;

-- Clientes: jefe y recepción crean y editan (sin borrar: se anonimizan por RPC).
grant select, insert, update on public.clientes to authenticated;

-- Solo lectura desde el navegador: se escriben por RPC, triggers o Edge Functions.
grant select on public.membresias, public.auditoria, public.citas, public.cita_servicios to authenticated;

-- Configuración: la fila la crea un trigger; el jefe solo la actualiza.
grant select, update on public.empresa_config to authenticated;

-- empresas: el jefe solo edita marca y contacto; estado/plan/límites van por RPC.
grant select on public.empresas to authenticated;
grant update (nombre, razon_social, nit, correo_contacto, telefono_contacto, logo_path,
              color_primario, color_secundario, color_acento)
  on public.empresas to authenticated;

-- perfiles: cada uno edita sus datos personales; es_developer va por RPC.
grant select on public.perfiles to authenticated;
grant update (nombre, apellido, telefono) on public.perfiles to authenticated;

-- -----------------------------------------------------------------------------
-- Vistas (se ejecutan con permisos del dueño y filtran por rol explícitamente)
-- -----------------------------------------------------------------------------

/** Marca pública de empresas operativas: la usa el login antes de autenticar. */
create view public.empresas_publicas as
  select e.slug, e.nombre, e.logo_path, e.color_primario, e.color_secundario, e.color_acento, e.estado
  from public.empresas e
  where e.estado in ('prueba', 'activa');

/** Especialistas visibles para cualquier miembro (incluido el cliente): sin correo ni teléfono. */
create view public.especialistas_publicos as
  select
    e.id,
    e.empresa_id,
    e.nombre,
    e.cargo,
    e.foto_path,
    e.color_agenda,
    coalesce(array_agg(es.servicio_id) filter (where es.servicio_id is not null), '{}'::uuid[]) as servicio_ids
  from public.empleados e
  left join public.empleado_servicios es on es.empleado_id = e.id
  where e.activo
    and (public.es_developer()
         or public.tiene_rol(e.empresa_id, array['boss', 'receptionist', 'employee', 'user']))
  group by e.id;

/**
 * Citas con cliente, especialista y servicios, para todas las pantallas.
 * Cada rol ve lo mismo que en citas_select; al empleado se le ocultan precios
 * salvo que la empresa active empleado_ve_precios, y nunca ve el correo del cliente.
 */
create view public.citas_detalle as
  select
    c.id,
    c.empresa_id,
    c.cliente_id,
    c.empleado_id,
    c.inicio,
    c.fin,
    c.estado,
    c.origen,
    c.notas,
    case when v.ver_precio then c.total end as total,
    cl.nombre   as cliente_nombre,
    cl.apellido as cliente_apellido,
    cl.telefono as cliente_telefono,
    case when v.es_agenda then cl.correo end as cliente_correo,
    em.nombre       as empleado_nombre,
    em.color_agenda as empleado_color,
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'servicio_id', cs.servicio_id,
               'nombre', cs.nombre,
               'precio', case when v.ver_precio then cs.precio end,
               'duracion_min', cs.duracion_min
             ) order by cs.orden)
      from public.cita_servicios cs
      where cs.cita_id = c.id
    ), '[]'::jsonb) as servicios,
    c.motivo_cancelacion,
    c.cancelada_at,
    c.created_at,
    c.updated_at
  from public.citas c
  join public.empresa_config cfg on cfg.empresa_id = c.empresa_id
  join public.clientes cl on cl.id = c.cliente_id
  left join public.empleados em on em.id = c.empleado_id
  cross join lateral (
    select
      public.es_developer() or public.tiene_rol(c.empresa_id, array['boss', 'receptionist']) as es_agenda,
      coalesce(c.empleado_id = public.mi_empleado_id(c.empresa_id), false)                   as es_su_cita,
      coalesce(c.cliente_id = public.mi_cliente_id(c.empresa_id), false)                     as es_cliente
  ) r
  cross join lateral (
    select r.es_agenda, (r.es_agenda or r.es_cliente or (r.es_su_cita and cfg.empleado_ve_precios)) as ver_precio
  ) v
  where r.es_agenda or r.es_su_cita or r.es_cliente;

/** Ficha propia del cliente autenticado, sin notas internas del negocio. */
create view public.mi_ficha_cliente as
  select c.id, c.empresa_id, c.nombre, c.apellido, c.telefono, c.correo, c.fecha_nacimiento, c.acepta_datos_at
  from public.clientes c
  where c.usuario_id = auth.uid()
    and public.tiene_rol(c.empresa_id, array['user']);

revoke all on public.empresas_publicas, public.especialistas_publicos, public.citas_detalle,
  public.mi_ficha_cliente from anon, authenticated;
grant select on public.empresas_publicas to anon, authenticated;
grant select on public.especialistas_publicos, public.citas_detalle, public.mi_ficha_cliente to authenticated;

-- -----------------------------------------------------------------------------
-- Realtime (solo existe en Supabase)
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.citas, public.servicios, public.categorias, public.empresa_config, public.bloqueos_agenda;
  end if;
end;
$$;
