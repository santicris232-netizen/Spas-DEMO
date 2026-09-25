/*
  CristaSpa - utilidades para probar el esquema de Supabase en PGlite (Postgres en WASM).
  Crea una base en memoria, aplica la simulación de Supabase y todas las migraciones,
  y permite ejecutar consultas "como" un usuario autenticado para validar RLS.
*/
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const carpetaMigraciones = path.join(raiz, 'supabase', 'migrations');

/**
 * Crea una base nueva con el esquema completo de CristaSpa.
 * @returns {Promise<PGlite>} Base lista para usar.
 */
export async function crearBase() {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.exec(await readFile(path.join(raiz, 'tests', 'db', 'supabase-stub.sql'), 'utf8'));

  const archivos = (await readdir(carpetaMigraciones)).filter(nombre => nombre.endsWith('.sql')).sort();
  for (const archivo of archivos) {
    try {
      await db.exec(await readFile(path.join(carpetaMigraciones, archivo), 'utf8'));
    } catch (error) {
      error.message = `Migración ${archivo}: ${error.message}`;
      throw error;
    }
  }
  return db;
}

/**
 * Ejecuta fn dentro de una transacción con el rol y el usuario indicados.
 * Si fn lanza un error, la transacción se revierte y el error se propaga.
 * @param {PGlite} db Base de datos.
 * @param {string|null} usuarioId UUID del usuario autenticado, o null para anon.
 * @param {(tx: import('@electric-sql/pglite').Transaction) => Promise<T>} fn Consultas a ejecutar.
 * @returns {Promise<T>} Resultado de fn.
 * @template T
 */
export async function como(db, usuarioId, fn) {
  return db.transaction(async tx => {
    await tx.query(`set local role ${usuarioId ? 'authenticated' : 'anon'}`);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [usuarioId || '']);
    return fn(tx);
  });
}

/**
 * Atajo: una consulta como un usuario, devolviendo las filas.
 * @param {PGlite} db Base de datos.
 * @param {string|null} usuarioId Usuario autenticado o null.
 * @param {string} sql Consulta.
 * @param {Array<unknown>} [params] Parámetros.
 * @returns {Promise<Array<object>>} Filas.
 */
export async function consultarComo(db, usuarioId, sql, params = []) {
  return como(db, usuarioId, async tx => (await tx.query(sql, params)).rows);
}

/**
 * Espera que la operación falle y devuelve el error de Postgres.
 * @param {Promise<unknown>} promesa Operación que debe fallar.
 * @returns {Promise<{message: string, code?: string, hint?: string}>} Error capturado.
 */
export async function esperarError(promesa) {
  try {
    await promesa;
  } catch (error) {
    return error;
  }
  throw new Error('Se esperaba un error y la operación terminó bien.');
}

/**
 * Crea un usuario de Supabase Auth (el trigger crea su perfil).
 * @param {PGlite} db Base de datos.
 * @param {string} correo Correo.
 * @param {object} [meta] Metadatos (nombre, apellido, telefono).
 * @returns {Promise<string>} UUID del usuario.
 */
export async function crearUsuario(db, correo, meta = {}) {
  const { rows } = await db.query(
    'insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id',
    [correo, JSON.stringify(meta)]
  );
  return rows[0].id;
}

/**
 * Lunes a 14–20 días de hoy (en Bogotá), a la hora local indicada, como ISO con zona.
 * Siempre es futuro, cae en horario por defecto (L–S 09–18) y dentro de 30 días.
 * @param {PGlite} db Base de datos.
 * @param {string} hora Hora local HH:MM.
 * @param {number} [diasExtra] Días a sumar al lunes.
 * @returns {Promise<string>} Fecha y hora con zona.
 */
export async function proximoLunes(db, hora, diasExtra = 0) {
  const { rows } = await db.query(
    `select ((date_trunc('week', now() at time zone 'America/Bogota')::date + 14 + $2::int) + $1::time)
              at time zone 'America/Bogota' as t`,
    [hora, diasExtra]
  );
  return rows[0].t.toISOString();
}

/**
 * Crea el escenario base de dos empresas con un usuario por rol.
 *   A = "spa-a" (plantilla pestañas-y-cejas) · B = "spa-b" (plantilla spa-bienestar)
 * @param {PGlite} db Base de datos.
 * @returns {Promise<object>} Ids de empresas, usuarios, empleados, clientes y servicios.
 */
export async function crearEscenario(db) {
  const ids = {};

  ids.dev = await crearUsuario(db, 'dev@cristaspa.app', { nombre: 'Dev' });
  await db.query('update public.perfiles set es_developer = true where id = $1', [ids.dev]);

  for (const [clave, slug, plantilla] of [['A', 'spa-a', 'pestanas-y-cejas'], ['B', 'spa-b', 'spa-bienestar']]) {
    const { rows } = await db.query('select public._crear_empresa($1, null) as id', [
      JSON.stringify({ slug, nombre: `Spa ${clave}`, plantilla })
    ]);
    const empresa = rows[0].id;
    ids[`empresa${clave}`] = empresa;

    for (const rol of ['boss', 'receptionist', 'employee', 'user']) {
      const usuario = await crearUsuario(db, `${rol}.${slug}@test.co`, { nombre: `${rol} ${clave}` });
      ids[`${rol}${clave}`] = usuario;
      if (rol !== 'user') {
        await db.query('insert into public.membresias (usuario_id, empresa_id, rol) values ($1, $2, $3)',
          [usuario, empresa, rol]);
      }
    }

    const servicios = (await db.query(
      'select id, nombre, duracion_min, precio from public.servicios where empresa_id = $1 order by orden, nombre',
      [empresa]
    )).rows;
    ids[`servicios${clave}`] = servicios;

    const empleado = (await db.query(
      `insert into public.empleados (empresa_id, usuario_id, nombre, correo)
       values ($1, $2, $3, $4) returning id`,
      [empresa, ids[`employee${clave}`], `Especialista ${clave}`, `employee.${slug}@test.co`]
    )).rows[0].id;
    ids[`empleado${clave}`] = empleado;
    await db.query(
      'insert into public.empleado_servicios (empresa_id, empleado_id, servicio_id) select $1, $2, id from public.servicios where empresa_id = $1',
      [empresa, empleado]
    );

    ids[`cliente${clave}`] = await consultarComo(db, ids[`user${clave}`],
      `select public.unirse_como_cliente($1, $2, 'Prueba', '3000000000', '1995-05-05', true) as id`,
      [slug, `Cliente ${clave}`]
    ).then(filas => filas[0].id);
  }

  return ids;
}
