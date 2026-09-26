-- =============================================================================
-- CristaSpa v2 · 02 · Tablas de negocio
-- Todas llevan empresa_id y las referencias entre ellas son FK compuestas
-- (empresa_id, id), así la base impide cruzar datos entre empresas.
-- Referencia: docs/flujos/04-modelo-de-datos.md
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Configuración de la empresa (1 fila por empresa, la crea un trigger)
-- -----------------------------------------------------------------------------

create table public.empresa_config (
  empresa_id                uuid primary key references public.empresas (id) on delete cascade,
  whatsapp                  text,
  instagram                 text,
  instagram_activo          boolean not null default false,
  facebook                  text,
  facebook_activo           boolean not null default false,
  tiktok                    text,
  tiktok_activo             boolean not null default false,
  intervalo_agenda_min      integer not null default 30
                            check (intervalo_agenda_min in (5, 10, 15, 20, 30, 45, 60)),
  anticipacion_min_horas    integer not null default 2 check (anticipacion_min_horas between 0 and 168),
  dias_reserva_max          integer not null default 30 check (dias_reserva_max between 1 and 365),
  usuario_puede_cancelar    boolean not null default true,
  usuario_puede_reprogramar boolean not null default true,
  horas_limite_cancelacion  integer not null default 24 check (horas_limite_cancelacion between 0 and 168),
  empleado_ve_precios       boolean not null default false,
  mensaje_whatsapp          text not null default
    E'Hola {empresa}, quiero confirmar mi cita.\nCliente: {cliente}\nServicio: {servicio}\nEspecialista: {especialista}\nFecha: {fecha}\nHora: {hora}',
  politica_datos            text,
  updated_at                timestamptz not null default now()
);

create trigger empresa_config_updated_at before update on public.empresa_config
  for each row execute function public.set_updated_at();

/** Crea la configuración por defecto al crear una empresa. */
create or replace function public.crear_config_empresa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.empresa_config (empresa_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger empresas_crear_config after insert on public.empresas
  for each row execute function public.crear_config_empresa();

-- -----------------------------------------------------------------------------
-- Catálogo
-- -----------------------------------------------------------------------------

create table public.categorias (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nombre     text not null check (char_length(btrim(nombre)) between 1 and 60),
  slug       text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  color      text not null default '#175050' check (color ~ '^#[0-9a-fA-F]{6}$'),
  orden      integer not null default 0,
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, slug),
  unique (empresa_id, id)
);

create table public.servicios (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references public.empresas (id) on delete cascade,
  categoria_id uuid not null,
  nombre       text not null check (char_length(btrim(nombre)) between 1 and 100),
  descripcion  text not null default '',
  precio       numeric(12, 2) not null default 0 check (precio >= 0),
  duracion_min integer not null default 60 check (duracion_min between 5 and 720),
  imagen_path  text,
  orden        integer not null default 0,
  activo       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (empresa_id, id),
  foreign key (empresa_id, categoria_id) references public.categorias (empresa_id, id)
);

create index servicios_empresa_categoria_idx on public.servicios (empresa_id, categoria_id) where activo;

create table public.productos (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references public.empresas (id) on delete cascade,
  categoria_id uuid,
  nombre       text not null check (char_length(btrim(nombre)) between 1 and 100),
  descripcion  text not null default '',
  precio       numeric(12, 2) check (precio >= 0),
  imagen_path  text,
  orden        integer not null default 0,
  activo       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (empresa_id, id),
  foreign key (empresa_id, categoria_id) references public.categorias (empresa_id, id)
);

comment on column public.productos.precio is 'null = "Precio por confirmar".';

-- -----------------------------------------------------------------------------
-- Personas
-- -----------------------------------------------------------------------------

create table public.empleados (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references public.empresas (id) on delete cascade,
  usuario_id   uuid references public.perfiles (id) on delete set null,
  nombre       text not null check (char_length(btrim(nombre)) between 2 and 100),
  correo       text not null check (correo ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  telefono     text,
  cargo        text not null default 'Especialista',
  foto_path    text,
  color_agenda text not null default '#175050' check (color_agenda ~ '^#[0-9a-fA-F]{6}$'),
  activo       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (empresa_id, id),
  unique (empresa_id, usuario_id)
);

create unique index empleados_empresa_correo_uidx on public.empleados (empresa_id, lower(correo));

create table public.empleado_servicios (
  empresa_id  uuid not null,
  empleado_id uuid not null,
  servicio_id uuid not null,
  primary key (empleado_id, servicio_id),
  foreign key (empresa_id, empleado_id) references public.empleados (empresa_id, id) on delete cascade,
  foreign key (empresa_id, servicio_id) references public.servicios (empresa_id, id) on delete cascade
);

create index empleado_servicios_servicio_idx on public.empleado_servicios (empresa_id, servicio_id);

create table public.clientes (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references public.empresas (id) on delete cascade,
  usuario_id       uuid references public.perfiles (id) on delete set null,
  nombre           text not null check (char_length(btrim(nombre)) between 1 and 80),
  apellido         text not null default '',
  telefono         text,
  correo           text check (correo is null or correo ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  fecha_nacimiento date,
  notas_internas   text,
  acepta_datos     boolean not null default false,
  acepta_datos_at  timestamptz,
  anonimizado_at   timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (empresa_id, id),
  unique (empresa_id, usuario_id)
);

create unique index clientes_empresa_correo_uidx on public.clientes (empresa_id, lower(correo)) where correo is not null;
create index clientes_empresa_telefono_idx on public.clientes (empresa_id, telefono);

-- -----------------------------------------------------------------------------
-- Horarios y bloqueos
-- -----------------------------------------------------------------------------

create table public.horarios_atencion (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  empleado_id uuid,
  dia_semana  smallint not null check (dia_semana between 0 and 6),
  hora_inicio time not null,
  hora_fin    time not null,
  created_at  timestamptz not null default now(),
  check (hora_fin > hora_inicio),
  foreign key (empresa_id, empleado_id) references public.empleados (empresa_id, id) on delete cascade
);

comment on column public.horarios_atencion.empleado_id is 'null = horario general de la empresa. Si un empleado tiene filas propias, se usan solo esas.';
comment on column public.horarios_atencion.dia_semana is '0 = domingo … 6 = sábado (igual que extract(dow)).';

create index horarios_empresa_idx on public.horarios_atencion (empresa_id, empleado_id, dia_semana);

create table public.bloqueos_agenda (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  empleado_id uuid,
  inicio      timestamptz not null,
  fin         timestamptz not null,
  motivo      text not null default '',
  creado_por  uuid,
  created_at  timestamptz not null default now(),
  check (fin > inicio),
  foreign key (empresa_id, empleado_id) references public.empleados (empresa_id, id) on delete cascade
);

comment on column public.bloqueos_agenda.empleado_id is 'null = bloqueo de toda la empresa (festivo, cierre).';

create index bloqueos_empresa_rango_idx on public.bloqueos_agenda using gist (empresa_id, tstzrange(inicio, fin, '[)'));

-- -----------------------------------------------------------------------------
-- Citas
-- -----------------------------------------------------------------------------

create table public.citas (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references public.empresas (id) on delete cascade,
  cliente_id         uuid not null,
  empleado_id        uuid,
  inicio             timestamptz not null,
  fin                timestamptz not null,
  estado             text not null default 'pendiente'
                     check (estado in ('pendiente', 'confirmada', 'completada', 'cancelada', 'no_asistio')),
  origen             text not null check (origen in ('usuario', 'jefe', 'recepcion', 'empleado')),
  total              numeric(12, 2) not null default 0 check (total >= 0),
  notas              text not null default '',
  cancelada_por      uuid,
  motivo_cancelacion text,
  cancelada_at       timestamptz,
  creado_por         uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (fin > inicio),
  unique (empresa_id, id),
  foreign key (empresa_id, cliente_id) references public.clientes (empresa_id, id),
  foreign key (empresa_id, empleado_id) references public.empleados (empresa_id, id),
  -- Nunca dos citas activas cruzadas para el mismo especialista (hallazgo A-01).
  constraint citas_sin_choque exclude using gist (
    empleado_id with =,
    tstzrange(inicio, fin, '[)') with &&
  ) where (estado in ('pendiente', 'confirmada') and empleado_id is not null)
);

create index citas_empresa_inicio_idx on public.citas (empresa_id, inicio);
create index citas_empresa_empleado_inicio_idx on public.citas (empresa_id, empleado_id, inicio);
create index citas_empresa_cliente_inicio_idx on public.citas (empresa_id, cliente_id, inicio desc);

create table public.cita_servicios (
  id           bigint generated always as identity primary key,
  empresa_id   uuid not null,
  cita_id      uuid not null,
  servicio_id  uuid,
  nombre       text not null,
  precio       numeric(12, 2) not null,
  duracion_min integer not null,
  orden        integer not null default 0,
  foreign key (empresa_id, cita_id) references public.citas (empresa_id, id) on delete cascade,
  foreign key (empresa_id, servicio_id) references public.servicios (empresa_id, id) on delete set null (servicio_id)
);

comment on table public.cita_servicios is 'Servicios de la cita con nombre, precio y duración congelados al reservar.';

create index cita_servicios_cita_idx on public.cita_servicios (empresa_id, cita_id);

-- -----------------------------------------------------------------------------
-- updated_at
-- -----------------------------------------------------------------------------

create trigger categorias_updated_at before update on public.categorias for each row execute function public.set_updated_at();
create trigger servicios_updated_at  before update on public.servicios  for each row execute function public.set_updated_at();
create trigger productos_updated_at  before update on public.productos  for each row execute function public.set_updated_at();
create trigger empleados_updated_at  before update on public.empleados  for each row execute function public.set_updated_at();
create trigger clientes_updated_at   before update on public.clientes   for each row execute function public.set_updated_at();
create trigger citas_updated_at      before update on public.citas      for each row execute function public.set_updated_at();
