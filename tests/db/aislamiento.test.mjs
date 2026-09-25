/*
  Matriz de aislamiento entre empresas (docs/flujos/15-plan-de-implementacion.md#pruebas).
  Ningún miembro de la empresa A puede leer, crear, mover ni borrar datos de la empresa B.
*/
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearBase, crearEscenario, como, consultarComo, esperarError, proximoLunes } from './helpers.mjs';

const TABLAS_NEGOCIO = [
  'empresa_config', 'categorias', 'servicios', 'productos', 'empleados', 'empleado_servicios',
  'clientes', 'horarios_atencion', 'bloqueos_agenda', 'citas', 'cita_servicios', 'membresias', 'auditoria'
];
const ROLES_A = ['bossA', 'receptionistA', 'employeeA', 'userA'];

let db;
let ids;

before(async () => {
  db = await crearBase();
  ids = await crearEscenario(db);

  // Datos en ambas empresas para que exista algo que filtrar.
  for (const clave of ['A', 'B']) {
    const inicio = await proximoLunes(db, '10:00');
    await consultarComo(db, ids[`boss${clave}`],
      'select public.reservar_cita($1, $2, $3, $4, $5)',
      [ids[`empresa${clave}`], [ids[`servicios${clave}`][0].id], inicio, ids[`empleado${clave}`], ids[`cliente${clave}`]]);
    await db.query(
      `insert into public.bloqueos_agenda (empresa_id, empleado_id, inicio, fin, motivo)
       values ($1, $2, now() + interval '40 days', now() + interval '41 days', 'Vacaciones')`,
      [ids[`empresa${clave}`], ids[`empleado${clave}`]]
    );
    await db.query(
      `insert into public.productos (empresa_id, nombre) values ($1, 'Producto ${clave}')`,
      [ids[`empresa${clave}`]]
    );
  }
});

after(async () => {
  await db.close();
});

test('la empresa B tiene datos en todas las tablas (si no, la matriz no probaría nada)', async () => {
  for (const tabla of TABLAS_NEGOCIO) {
    const { rows } = await db.query(`select count(*)::int as n from public.${tabla} where empresa_id = $1`, [ids.empresaB]);
    assert.ok(rows[0].n > 0, `B no tiene filas en ${tabla}`);
  }
});

test('ningún rol de A ve filas de B en ninguna tabla de negocio', async () => {
  for (const rol of ROLES_A) {
    for (const tabla of TABLAS_NEGOCIO) {
      const filas = await consultarComo(db, ids[rol],
        `select count(*)::int as n from public.${tabla} where empresa_id = $1`, [ids.empresaB]);
      assert.equal(filas[0].n, 0, `${rol} ve ${filas[0].n} filas de B en ${tabla}`);
    }
    const empresas = await consultarComo(db, ids[rol], 'select count(*)::int as n from public.empresas where id = $1', [ids.empresaB]);
    assert.equal(empresas[0].n, 0, `${rol} ve la empresa B`);
  }
});

test('las vistas tampoco exponen datos de B', async () => {
  for (const rol of ROLES_A) {
    for (const vista of ['citas_detalle', 'especialistas_publicos']) {
      const filas = await consultarComo(db, ids[rol],
        `select count(*)::int as n from public.${vista} where empresa_id = $1`, [ids.empresaB]);
      assert.equal(filas[0].n, 0, `${rol} ve filas de B en ${vista}`);
    }
  }
});

test('el jefe de A no puede insertar datos con empresa_id de B', async () => {
  const categoriaB = (await db.query('select id from public.categorias where empresa_id = $1 limit 1', [ids.empresaB])).rows[0].id;
  const error = await esperarError(consultarComo(db, ids.bossA,
    `insert into public.servicios (empresa_id, categoria_id, nombre) values ($1, $2, 'Intruso')`,
    [ids.empresaB, categoriaB]));
  assert.match(error.message, /row-level security/);
});

test('el jefe de A no puede mover una fila a la empresa B', async () => {
  const servicioA = ids.serviciosA[0].id;
  const error = await esperarError(consultarComo(db, ids.bossA,
    'update public.servicios set empresa_id = $1 where id = $2', [ids.empresaB, servicioA]));
  assert.ok(error.message.length > 0);
  const actual = await db.query('select empresa_id from public.servicios where id = $1', [servicioA]);
  assert.equal(actual.rows[0].empresa_id, ids.empresaA);
});

test('una FK compuesta impide que un servicio de A apunte a una categoría de B', async () => {
  const categoriaB = (await db.query('select id from public.categorias where empresa_id = $1 limit 1', [ids.empresaB])).rows[0].id;
  const error = await esperarError(consultarComo(db, ids.bossA,
    `insert into public.servicios (empresa_id, categoria_id, nombre) values ($1, $2, 'Cruce')`,
    [ids.empresaA, categoriaB]));
  assert.match(error.message, /foreign key/);
});

test('el jefe de A no puede actualizar ni borrar filas de B', async () => {
  const resultado = await como(db, ids.bossA, async tx => {
    const actualizadas = await tx.query(`update public.servicios set nombre = 'Hackeado' where empresa_id = $1`, [ids.empresaB]);
    const borradas = await tx.query('delete from public.productos where empresa_id = $1', [ids.empresaB]);
    return { actualizadas: actualizadas.affectedRows, borradas: borradas.affectedRows };
  });
  assert.deepEqual(resultado, { actualizadas: 0, borradas: 0 });
});

test('las citas no se pueden escribir directamente, ni siquiera por el jefe', async () => {
  const error = await esperarError(consultarComo(db, ids.bossA,
    `update public.citas set total = 0 where empresa_id = $1`, [ids.empresaA]));
  assert.match(error.message, /permission denied/);
});

test('un usuario no puede darse el rol developer', async () => {
  const error = await esperarError(consultarComo(db, ids.userA,
    'update public.perfiles set es_developer = true where id = $1', [ids.userA]));
  assert.match(error.message, /permission denied/);
});

test('un usuario no puede crearse una membresía de jefe', async () => {
  const error = await esperarError(consultarComo(db, ids.userA,
    `insert into public.membresias (usuario_id, empresa_id, rol) values ($1, $2, 'boss')`, [ids.userA, ids.empresaA]));
  assert.match(error.message, /permission denied/);
});

test('el jefe no puede cambiar estado, plan ni límites de su empresa', async () => {
  const error = await esperarError(consultarComo(db, ids.bossA,
    `update public.empresas set estado = 'activa', limites = '{"max_empleados": 999}' where id = $1`, [ids.empresaA]));
  assert.match(error.message, /permission denied/);
});

test('el jefe sí puede editar la marca de su empresa', async () => {
  const filas = await consultarComo(db, ids.bossA,
    `update public.empresas set color_primario = '#112233' where id = $1 returning color_primario`, [ids.empresaA]);
  assert.equal(filas[0].color_primario, '#112233');
});

test('con la empresa suspendida sus miembros pierden todo acceso', async () => {
  await db.query(`update public.empresas set estado = 'suspendida' where id = $1`, [ids.empresaA]);
  try {
    for (const rol of ROLES_A) {
      for (const tabla of ['servicios', 'citas', 'empresa_config', 'empresas']) {
        const filtro = tabla === 'empresas' ? 'id' : 'empresa_id';
        const filas = await consultarComo(db, ids[rol],
          `select count(*)::int as n from public.${tabla} where ${filtro} = $1`, [ids.empresaA]);
        assert.equal(filas[0].n, 0, `${rol} aún ve ${tabla} con la empresa suspendida`);
      }
    }
    const contexto = await consultarComo(db, ids.bossA, `select public.mi_contexto('spa-a') as c`);
    assert.equal(contexto[0].c.empresa.estado, 'suspendida', 'el contexto debe explicar la suspensión');
    assert.equal(contexto[0].c.rol, null);
  } finally {
    await db.query(`update public.empresas set estado = 'prueba' where id = $1`, [ids.empresaA]);
  }
});

test('el developer ve las dos empresas', async () => {
  const filas = await consultarComo(db, ids.dev,
    'select count(distinct empresa_id)::int as n from public.servicios where empresa_id in ($1, $2)', [ids.empresaA, ids.empresaB]);
  assert.equal(filas[0].n, 2);
});

test('anon solo puede leer empresas_publicas', async () => {
  const publicas = await consultarComo(db, null, 'select slug from public.empresas_publicas order by slug');
  assert.deepEqual(publicas.map(fila => fila.slug), ['spa-a', 'spa-b']);
  assert.equal(Object.keys((await consultarComo(db, null, 'select * from public.empresas_publicas limit 1'))[0]).includes('id'), false);

  for (const tabla of ['empresas', 'servicios', 'clientes', 'citas', 'perfiles']) {
    const error = await esperarError(consultarComo(db, null, `select * from public.${tabla}`));
    assert.match(error.message, /permission denied/, `anon pudo leer ${tabla}`);
  }
});

test('anon no puede ejecutar funciones de negocio', async () => {
  const error = await esperarError(consultarComo(db, null, `select public.crear_empresa('{}'::jsonb)`));
  assert.match(error.message, /permission denied/);
});

test('ningún usuario autenticado puede ejecutar funciones internas', async () => {
  for (const sql of [
    `select public._crear_empresa('{"slug":"x-x-x","nombre":"X"}'::jsonb, null)`,
    `select public.registrar_auditoria(null, 'x', 'x', 'x')`
  ]) {
    const error = await esperarError(consultarComo(db, ids.bossA, sql));
    assert.match(error.message, /permission denied/, sql);
  }
});

test('todas las tablas del esquema public tienen RLS activo', async () => {
  const { rows } = await db.query(
    `select tablename from pg_tables where schemaname = 'public' and not rowsecurity order by tablename`);
  assert.deepEqual(rows, []);
});
