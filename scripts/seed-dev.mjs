/*
  CristaSpa - datos demo para el proyecto Supabase de DESARROLLO (npm run seed:dev).

  Crea (o actualiza, es idempotente):
    · 1 developer
    · 2 empresas: demo-lash (plantilla pestañas y cejas) y demo-spa (plantilla spa)
    · por empresa: jefe, recepción, 2 especialistas y 1 cliente, más citas de ejemplo
    · 1 cliente que pertenece a las dos empresas (para probar el selector)

  Los usuarios se crean por SQL con el correo ya confirmado: no se envía ningún
  correo (las direcciones @demo.cristaspa.app no existen). La contraseña demo se
  genera una vez y se guarda en .env.demo (ignorado por git).

  Nunca ejecutar contra producción: el script se niega si el proyecto vinculado no es el de dev.
*/
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROYECTO_DEV = 'sgtrclofajcbnswvtdip';
const DOMINIO = 'demo.cristaspa.app';
const archivoEnv = path.join(raiz, '.env.demo');

const vinculado = readFileSync(path.join(raiz, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
if (vinculado !== PROYECTO_DEV) {
  console.error(`El proyecto vinculado (${vinculado}) no es el de desarrollo (${PROYECTO_DEV}). No se ejecuta el seed.`);
  process.exit(1);
}

/** Contraseña demo persistente (letras y números, 16 caracteres). */
function claveDemo() {
  if (existsSync(archivoEnv)) {
    const coincidencia = readFileSync(archivoEnv, 'utf8').match(/^DEMO_PASSWORD=(.+)$/m);
    if (coincidencia) {
      return coincidencia[1].trim();
    }
  }
  const clave = `Demo${randomBytes(9).toString('base64url').replace(/[^a-zA-Z0-9]/g, 'x')}7`;
  writeFileSync(archivoEnv, `# Credenciales de los usuarios demo de cristaspa-dev. No subir a git.\nDEMO_PASSWORD=${clave}\n`);
  return clave;
}

const clave = claveDemo();
const literal = texto => `'${String(texto).replace(/'/g, "''")}'`;

const EMPRESAS = [
  {
    slug: 'demo-lash', nombre: 'Demo Lash Studio', plantilla: 'pestanas-y-cejas',
    colores: { color_primario: '#175050', color_secundario: '#faf6ee', color_acento: '#c9a020' },
    especialistas: ['Valentina Ríos', 'Camila Duarte']
  },
  {
    slug: 'demo-spa', nombre: 'Demo Spa Bienestar', plantilla: 'spa-bienestar',
    colores: { color_primario: '#4a3b6b', color_secundario: '#f7f4fb', color_acento: '#d4a373' },
    especialistas: ['Laura Méndez', 'Sofía Castro']
  }
];

const sql = `
create or replace function pg_temp.usuario_demo(p_correo text, p_nombre text, p_apellido text, p_clave text)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_correo;
  if v_id is null then
    v_id := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change, email_change_token_current, reauthentication_token,
      phone_change, phone_change_token, is_sso_user, is_anonymous)
    values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', p_correo,
      extensions.crypt(p_clave, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('nombre', p_nombre, 'apellido', p_apellido, 'email_verified', true),
      now(), now(), '', '', '', '', '', '', '', '', false, false);
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (v_id::text, v_id, jsonb_build_object('sub', v_id::text, 'email', p_correo, 'email_verified', true),
      'email', now(), now(), now());
  else
    update auth.users set encrypted_password = extensions.crypt(p_clave, extensions.gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
    where id = v_id;
  end if;
  update public.perfiles set nombre = p_nombre, apellido = p_apellido where id = v_id;
  return v_id;
end;
$$;

create or replace function pg_temp.proximo_dia(p_dow int, p_semanas int, p_hora time)
returns timestamptz language sql as $$
  select ((date_trunc('week', now() at time zone 'America/Bogota')::date + (p_semanas * 7) + ((p_dow + 6) % 7)) + p_hora)
         at time zone 'America/Bogota';
$$;

create or replace function pg_temp.cita_demo(p_empresa uuid, p_cliente uuid, p_empleado uuid, p_servicio uuid,
                                              p_inicio timestamptz, p_estado text, p_origen text)
returns void language plpgsql as $$
declare v_srv public.servicios; v_id uuid;
begin
  select * into v_srv from public.servicios where id = p_servicio;
  if exists (select 1 from public.citas where empleado_id = p_empleado and inicio = p_inicio) then
    return;
  end if;
  insert into public.citas (empresa_id, cliente_id, empleado_id, inicio, fin, estado, origen, total, notas)
  values (p_empresa, p_cliente, p_empleado, p_inicio, p_inicio + make_interval(mins => v_srv.duracion_min),
          p_estado, p_origen, v_srv.precio, 'Cita de demostración')
  returning id into v_id;
  insert into public.cita_servicios (empresa_id, cita_id, servicio_id, nombre, precio, duracion_min, orden)
  values (p_empresa, v_id, v_srv.id, v_srv.nombre, v_srv.precio, v_srv.duracion_min, 1);
end;
$$;

do $$
declare
  v_dev uuid; v_multi uuid; v_empresa uuid; v_usuario uuid; v_empleado uuid; v_cliente uuid;
  v_empleados uuid[]; v_servicio uuid; v_indice int;
begin
  v_dev := pg_temp.usuario_demo(${literal(`developer@${DOMINIO}`)}, 'Developer', 'Demo', ${literal(clave)});
  update public.perfiles set es_developer = true where id = v_dev;
  v_multi := pg_temp.usuario_demo(${literal(`cliente.multi@${DOMINIO}`)}, 'Cliente', 'Multiempresa', ${literal(clave)});

  ${EMPRESAS.map(empresa => `
  -- ${empresa.nombre}
  select id into v_empresa from public.empresas where slug = ${literal(empresa.slug)};
  if v_empresa is null then
    v_empresa := public._crear_empresa(${literal(JSON.stringify({ slug: empresa.slug, nombre: empresa.nombre, plantilla: empresa.plantilla, ...empresa.colores }))}::jsonb, v_dev);
  end if;
  update public.empresas set estado = 'activa' where id = v_empresa;
  update public.empresa_config set whatsapp = '3000000000', instagram = 'https://instagram.com/cristaspa',
    instagram_activo = true, anticipacion_min_horas = 1 where empresa_id = v_empresa;

  v_usuario := pg_temp.usuario_demo(${literal(`jefe.${empresa.slug}@${DOMINIO}`)}, 'Jefe', ${literal(empresa.nombre)}, ${literal(clave)});
  insert into public.membresias (usuario_id, empresa_id, rol, invitado_por) values (v_usuario, v_empresa, 'boss', v_dev)
    on conflict (usuario_id, empresa_id) do update set rol = 'boss', activo = true;

  v_usuario := pg_temp.usuario_demo(${literal(`recepcion.${empresa.slug}@${DOMINIO}`)}, 'Recepción', ${literal(empresa.nombre)}, ${literal(clave)});
  insert into public.membresias (usuario_id, empresa_id, rol, invitado_por) values (v_usuario, v_empresa, 'receptionist', v_dev)
    on conflict (usuario_id, empresa_id) do update set rol = 'receptionist', activo = true;

  v_empleados := '{}';
  ${empresa.especialistas.map((nombre, indice) => `
  v_usuario := pg_temp.usuario_demo(${literal(`especialista${indice + 1}.${empresa.slug}@${DOMINIO}`)}, ${literal(nombre.split(' ')[0])}, ${literal(nombre.split(' ')[1])}, ${literal(clave)});
  insert into public.membresias (usuario_id, empresa_id, rol, invitado_por) values (v_usuario, v_empresa, 'employee', v_dev)
    on conflict (usuario_id, empresa_id) do update set rol = 'employee', activo = true;
  select id into v_empleado from public.empleados where empresa_id = v_empresa and usuario_id = v_usuario;
  if v_empleado is null then
    insert into public.empleados (empresa_id, usuario_id, nombre, correo, telefono, cargo, color_agenda)
    values (v_empresa, v_usuario, ${literal(nombre)}, ${literal(`especialista${indice + 1}.${empresa.slug}@${DOMINIO}`)},
            '30000000${indice + 1}0', 'Especialista', ${literal(indice === 0 ? empresa.colores.color_primario : empresa.colores.color_acento)})
    returning id into v_empleado;
  end if;
  insert into public.empleado_servicios (empresa_id, empleado_id, servicio_id)
    select v_empresa, v_empleado, s.id from public.servicios s where s.empresa_id = v_empresa
    on conflict do nothing;
  v_empleados := v_empleados || v_empleado;`).join('')}

  foreach v_usuario in array array[
    pg_temp.usuario_demo(${literal(`cliente.${empresa.slug}@${DOMINIO}`)}, 'Cliente', ${literal(empresa.nombre)}, ${literal(clave)}),
    v_multi
  ] loop
    insert into public.membresias (usuario_id, empresa_id, rol) values (v_usuario, v_empresa, 'user')
      on conflict (usuario_id, empresa_id) do nothing;
    select id into v_cliente from public.clientes where empresa_id = v_empresa and usuario_id = v_usuario;
    if v_cliente is null then
      insert into public.clientes (empresa_id, usuario_id, nombre, apellido, telefono, correo, acepta_datos, acepta_datos_at)
      select v_empresa, v_usuario, p.nombre, p.apellido, '3100000000', u.email, true, now()
      from public.perfiles p join auth.users u on u.id = p.id where p.id = v_usuario
      returning id into v_cliente;
    end if;
  end loop;

  select id into v_cliente from public.clientes c where c.empresa_id = v_empresa
    and c.usuario_id = (select id from auth.users where email = ${literal(`cliente.${empresa.slug}@${DOMINIO}`)});
  v_indice := 0;
  for v_servicio in select id from public.servicios where empresa_id = v_empresa order by orden, nombre limit 3 loop
    perform pg_temp.cita_demo(v_empresa, v_cliente, v_empleados[1 + (v_indice % 2)], v_servicio,
      pg_temp.proximo_dia(2 + v_indice, 1, time '10:00'), case when v_indice = 0 then 'pendiente' else 'confirmada' end, 'jefe');
    v_indice := v_indice + 1;
  end loop;
  perform pg_temp.cita_demo(v_empresa, v_cliente, v_empleados[1],
    (select id from public.servicios where empresa_id = v_empresa order by orden, nombre limit 1),
    pg_temp.proximo_dia(2, -1, time '11:00'), 'completada', 'usuario');
  `).join('')}
end;
$$;

select e.slug, e.estado,
  (select count(*) from public.membresias m where m.empresa_id = e.id) as miembros,
  (select count(*) from public.empleados x where x.empresa_id = e.id) as empleados,
  (select count(*) from public.servicios x where x.empresa_id = e.id) as servicios,
  (select count(*) from public.citas x where x.empresa_id = e.id) as citas
from public.empresas e where e.slug like 'demo-%' order by e.slug;
`;

const archivo = path.join(tmpdir(), `cristaspa-seed-${Date.now()}.sql`);
writeFileSync(archivo, sql);
try {
  const salida = execFileSync('npx', ['supabase', 'db', 'query', '--linked', '-f', archivo], {
    cwd: raiz, encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe']
  });
  const inicio = salida.indexOf('{');
  const filas = inicio >= 0 ? JSON.parse(salida.slice(inicio)).rows : salida;
  console.table(filas);
  console.log(`\nUsuarios demo (@${DOMINIO}) listos. Contraseña en .env.demo`);
  console.log(`  developer · cliente.multi · jefe.<empresa> · recepcion.<empresa> · especialista1.<empresa> · especialista2.<empresa> · cliente.<empresa>`);
  console.log('  Empresas: demo-lash, demo-spa');
} finally {
  unlinkSync(archivo);
}
