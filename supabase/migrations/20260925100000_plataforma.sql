-- =============================================================================
-- CristaSpa v2 · 01 · Plataforma
-- Empresas (tenants), perfiles, membresías, plantillas, auditoría y
-- funciones de rol usadas por todas las políticas RLS.
-- Referencia: docs/flujos/03-roles-y-permisos.md, docs/flujos/04-modelo-de-datos.md
-- =============================================================================

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

-- -----------------------------------------------------------------------------
-- Utilidades genéricas
-- -----------------------------------------------------------------------------

/** Mantiene updated_at al día en cualquier tabla que lo tenga. */
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Empresas
-- -----------------------------------------------------------------------------

create table public.empresas (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique
                    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
                           and char_length(slug) between 3 and 40
                           and slug not in ('www', 'app', 'api', 'admin', 'desarrollador',
                                            'cristaspa', 'soporte', 'static', 'assets', 'docs')),
  nombre            text not null check (char_length(btrim(nombre)) between 2 and 80),
  razon_social      text,
  nit               text,
  correo_contacto   text,
  telefono_contacto text,
  logo_path         text,
  color_primario    text not null default '#175050' check (color_primario ~ '^#[0-9a-fA-F]{6}$'),
  color_secundario  text not null default '#faf6ee' check (color_secundario ~ '^#[0-9a-fA-F]{6}$'),
  color_acento      text not null default '#c9a020' check (color_acento ~ '^#[0-9a-fA-F]{6}$'),
  zona_horaria      text not null default 'America/Bogota',
  moneda            text not null default 'COP' check (moneda ~ '^[A-Z]{3}$'),
  estado            text not null default 'prueba'
                    check (estado in ('prueba', 'activa', 'suspendida', 'eliminada')),
  motivo_estado     text,
  plan              text not null default 'basico' check (plan in ('basico', 'pro', 'premium')),
  limites           jsonb not null default '{"max_empleados": 5, "max_servicios": 50}'::jsonb,
  prueba_hasta      date,
  creado_por        uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  eliminado_at      timestamptz
);

comment on table public.empresas is 'Tenants de CristaSpa. Toda tabla de negocio referencia empresas.id mediante empresa_id.';

create trigger empresas_updated_at before update on public.empresas
  for each row execute function public.set_updated_at();

/** Rechaza zonas horarias que Postgres no reconoce. */
create or replace function public.validar_empresa()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform now() at time zone new.zona_horaria;
  return new;
exception
  when invalid_parameter_value then
    raise exception 'Zona horaria inválida: %', new.zona_horaria using errcode = '22023';
end;
$$;

create trigger empresas_validar before insert or update of zona_horaria on public.empresas
  for each row execute function public.validar_empresa();

-- -----------------------------------------------------------------------------
-- Perfiles (1:1 con auth.users)
-- -----------------------------------------------------------------------------

create table public.perfiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  nombre       text not null default '',
  apellido     text not null default '',
  telefono     text,
  es_developer boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on column public.perfiles.es_developer is 'Rol global de plataforma. Solo lo cambia otro developer (RPC) o SQL directo.';

create trigger perfiles_updated_at before update on public.perfiles
  for each row execute function public.set_updated_at();

/** Crea el perfil automáticamente cuando Supabase Auth registra un usuario. */
create or replace function public.crear_perfil_de_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id, nombre, apellido, telefono)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', ''),
    coalesce(new.raw_user_meta_data ->> 'apellido', ''),
    new.raw_user_meta_data ->> 'telefono'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger auth_users_crear_perfil after insert on auth.users
  for each row execute function public.crear_perfil_de_usuario();

-- -----------------------------------------------------------------------------
-- Membresías (usuario ↔ empresa, con rol por empresa)
-- -----------------------------------------------------------------------------

create table public.membresias (
  usuario_id   uuid not null references public.perfiles (id) on delete cascade,
  empresa_id   uuid not null references public.empresas (id) on delete cascade,
  rol          text not null check (rol in ('boss', 'receptionist', 'employee', 'user')),
  activo       boolean not null default true,
  invitado_por uuid references public.perfiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (usuario_id, empresa_id)
);

create index membresias_usuario_activo_idx on public.membresias (usuario_id) where activo;
create index membresias_empresa_rol_idx on public.membresias (empresa_id, rol);

create trigger membresias_updated_at before update on public.membresias
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Plantillas de catálogo (tabla de plataforma, sin empresa_id)
-- -----------------------------------------------------------------------------

create table public.plantillas (
  id          uuid primary key default gen_random_uuid(),
  clave       text not null unique check (clave ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nombre      text not null,
  descripcion text not null default '',
  contenido   jsonb not null default '{"categorias": []}'::jsonb,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger plantillas_updated_at before update on public.plantillas
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Auditoría (solo inserción)
-- -----------------------------------------------------------------------------

create table public.auditoria (
  id         bigint generated always as identity primary key,
  empresa_id uuid references public.empresas (id) on delete set null,
  actor_id   uuid,
  accion     text not null,
  entidad    text not null,
  entidad_id text,
  antes      jsonb,
  despues    jsonb,
  created_at timestamptz not null default now()
);

create index auditoria_empresa_fecha_idx on public.auditoria (empresa_id, created_at desc);

/** Registra una acción en auditoría con el usuario autenticado como actor. */
create or replace function public.registrar_auditoria(
  p_empresa_id uuid,
  p_accion     text,
  p_entidad    text,
  p_entidad_id text,
  p_antes      jsonb default null,
  p_despues    jsonb default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.auditoria (empresa_id, actor_id, accion, entidad, entidad_id, antes, despues)
  values (p_empresa_id, auth.uid(), p_accion, p_entidad, p_entidad_id, p_antes, p_despues);
$$;

-- -----------------------------------------------------------------------------
-- Funciones de rol (base de todas las políticas RLS)
-- -----------------------------------------------------------------------------

/** ¿El usuario autenticado es developer de la plataforma? */
create or replace function public.es_developer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.es_developer from public.perfiles p where p.id = auth.uid()), false);
$$;

/**
 * ¿El usuario autenticado tiene alguno de los roles dados en la empresa,
 * con membresía activa y la empresa operativa (prueba o activa)?
 */
create or replace function public.tiene_rol(p_empresa uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.membresias m
    join public.empresas e on e.id = m.empresa_id
    where m.usuario_id = auth.uid()
      and m.empresa_id = p_empresa
      and m.activo
      and m.rol = any (p_roles)
      and e.estado in ('prueba', 'activa')
  );
$$;

/** Rol del usuario autenticado en una empresa operativa, o null. */
create or replace function public.mi_rol(p_empresa uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.rol
  from public.membresias m
  join public.empresas e on e.id = m.empresa_id
  where m.usuario_id = auth.uid()
    and m.empresa_id = p_empresa
    and m.activo
    and e.estado in ('prueba', 'activa');
$$;
