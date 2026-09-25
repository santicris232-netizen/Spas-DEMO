/*
  Funciones de plataforma: empresas, developers, registro de clientes, límites
  del plan, auditoría y Storage (docs/flujos/12, 13 y 06).
*/
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearBase, crearEscenario, crearUsuario, consultarComo, esperarError } from './helpers.mjs';

let db;
let ids;

before(async () => {
  db = await crearBase();
  ids = await crearEscenario(db);
});

after(async () => {
  await db.close();
});

test('el developer crea una empresa con catálogo de plantilla, configuración y horario', async () => {
  const filas = await consultarComo(db, ids.dev, 'select public.crear_empresa($1) as id', [JSON.stringify({
    slug: 'barberia-norte', nombre: 'Barbería Norte', plantilla: 'barberia', color_primario: '#222222'
  })]);
  const empresa = filas[0].id;

  const resumen = (await db.query(`
    select
      (select estado from public.empresas where id = $1) as estado,
      (select count(*)::int from public.categorias where empresa_id = $1) as categorias,
      (select count(*)::int from public.servicios where empresa_id = $1) as servicios,
      (select count(*)::int from public.horarios_atencion where empresa_id = $1) as horarios,
      (select count(*)::int from public.empresa_config where empresa_id = $1) as config,
      (select count(*)::int from public.auditoria where empresa_id = $1 and entidad = 'empresas' and actor_id = $2) as auditada
  `, [empresa, ids.dev])).rows[0];

  assert.deepEqual({ ...resumen }, { estado: 'prueba', categorias: 3, servicios: 4, horarios: 6, config: 1, auditada: 1 });
});

test('solo el developer puede crear empresas y el slug debe ser único y válido', async () => {
  const jefe = await esperarError(consultarComo(db, ids.bossA, 'select public.crear_empresa($1)',
    [JSON.stringify({ slug: 'otra-mas', nombre: 'Otra' })]));
  assert.equal(jefe.code, '42501');

  const repetido = await esperarError(consultarComo(db, ids.dev, 'select public.crear_empresa($1)',
    [JSON.stringify({ slug: 'spa-a', nombre: 'Copia' })]));
  assert.equal(repetido.hint, 'slug_ocupado');

  for (const slug of ['admin', 'Con Espacios', 'ab', 'fin-']) {
    const invalido = await esperarError(consultarComo(db, ids.dev, 'select public.crear_empresa($1)',
      [JSON.stringify({ slug, nombre: 'Inválida' })]));
    assert.match(invalido.message, /check constraint|slug/, `el slug "${slug}" fue aceptado`);
  }

  const zona = await esperarError(consultarComo(db, ids.dev, 'select public.crear_empresa($1)',
    [JSON.stringify({ slug: 'zona-mala', nombre: 'Zona', zona_horaria: 'Marte/Olympus' })]));
  assert.match(zona.message, /Zona horaria inválida/);
});

test('suspender exige motivo, corta el acceso y reactivar lo devuelve', async () => {
  const sinMotivo = await esperarError(consultarComo(db, ids.dev,
    `select public.cambiar_estado_empresa($1, 'suspendida')`, [ids.empresaB]));
  assert.equal(sinMotivo.hint, 'motivo_requerido');

  await consultarComo(db, ids.dev, `select public.cambiar_estado_empresa($1, 'suspendida', 'Pago pendiente')`, [ids.empresaB]);
  const suspendida = await consultarComo(db, ids.bossB, 'select count(*)::int as n from public.servicios');
  assert.equal(suspendida[0].n, 0);

  await consultarComo(db, ids.dev, `select public.cambiar_estado_empresa($1, 'activa')`, [ids.empresaB]);
  const activa = await consultarComo(db, ids.bossB, 'select count(*)::int as n from public.servicios');
  assert.ok(activa[0].n > 0);

  const jefe = await esperarError(consultarComo(db, ids.bossB, `select public.cambiar_estado_empresa($1, 'activa')`, [ids.empresaB]));
  assert.equal(jefe.code, '42501');
});

test('el developer gestiona developers pero no puede quitar al último', async () => {
  const ultimo = await esperarError(consultarComo(db, ids.dev, 'select public.asignar_developer($1, false)', [ids.dev]));
  assert.equal(ultimo.hint, 'ultimo_developer');

  await consultarComo(db, ids.dev, 'select public.asignar_developer($1, true)', [ids.bossA]);
  const contexto = await consultarComo(db, ids.bossA, 'select public.mi_contexto() as c');
  assert.equal(contexto[0].c.es_developer, true);
  await consultarComo(db, ids.dev, 'select public.asignar_developer($1, false)', [ids.bossA]);

  const noDev = await esperarError(consultarComo(db, ids.bossA, 'select public.asignar_developer($1, true)', [ids.bossA]));
  assert.equal(noDev.code, '42501');
});

test('mi_contexto devuelve membresías, empresa y rol', async () => {
  const [{ c }] = await consultarComo(db, ids.receptionistA, `select public.mi_contexto('spa-a') as c`);
  assert.equal(c.autenticado, true);
  assert.equal(c.rol, 'receptionist');
  assert.equal(c.empresa.slug, 'spa-a');
  assert.deepEqual(c.membresias.map(m => m.slug), ['spa-a']);

  const [{ c: ajena }] = await consultarComo(db, ids.receptionistA, `select public.mi_contexto('spa-b') as c`);
  assert.equal(ajena.empresa, null, 'no debe revelar datos de una empresa ajena');
  assert.equal(ajena.rol, null);

  const [{ c: sinSesion }] = await db.transaction(async tx => {
    await tx.query('set local role authenticated');
    return (await tx.query('select public.mi_contexto() as c')).rows;
  });
  assert.equal(sinSesion.autenticado, false);
});

test('una misma cuenta puede ser clienta de dos empresas', async () => {
  await consultarComo(db, ids.userA,
    `select public.unirse_como_cliente('spa-b', 'Cliente A', 'Prueba', '3000000000', null, true)`);
  const [{ c }] = await consultarComo(db, ids.userA, 'select public.mi_contexto() as c');
  assert.deepEqual(c.membresias.map(m => `${m.slug}:${m.rol}`), ['spa-a:user', 'spa-b:user']);
});

test('registro de cliente: exige aceptar datos y no permite unirse como cliente siendo del equipo', async () => {
  const nuevo = await crearUsuario(db, 'nueva@test.co');
  const sinAceptar = await esperarError(consultarComo(db, nuevo,
    `select public.unirse_como_cliente('spa-a', 'Nueva', '', null, null, false)`));
  assert.equal(sinAceptar.hint, 'debe_aceptar_datos');

  const equipo = await esperarError(consultarComo(db, ids.employeeA,
    `select public.unirse_como_cliente('spa-a', 'Emp', '', null, null, true)`));
  assert.equal(equipo.hint, 'ya_es_miembro');

  const noExiste = await esperarError(consultarComo(db, nuevo,
    `select public.unirse_como_cliente('no-existe', 'Nueva', '', null, null, true)`));
  assert.equal(noExiste.hint, 'empresa_no_disponible');
});

test('registro de cliente: vincula la ficha creada por el jefe con el mismo correo, nunca por teléfono', async () => {
  const [{ id: porCorreo }] = await consultarComo(db, ids.bossA,
    `insert into public.clientes (empresa_id, nombre, correo, telefono, notas_internas)
     values ($1, 'Laura', 'laura@test.co', '3111111111', 'Alérgica al látex') returning id`, [ids.empresaA]);
  await consultarComo(db, ids.bossA,
    `insert into public.clientes (empresa_id, nombre, telefono) values ($1, 'Marta', '3222222222')`, [ids.empresaA]);

  const laura = await crearUsuario(db, 'laura@test.co');
  const [{ id: vinculada }] = await consultarComo(db, laura,
    `select public.unirse_como_cliente('spa-a', 'Laura', 'Gómez', '3111111111', null, true) as id`);
  assert.equal(vinculada, porCorreo);

  const impostora = await crearUsuario(db, 'impostora@test.co');
  const [{ id: nueva }] = await consultarComo(db, impostora,
    `select public.unirse_como_cliente('spa-a', 'Marta', '', '3222222222', null, true) as id`);
  const marta = (await db.query(`select usuario_id from public.clientes where nombre = 'Marta' and empresa_id = $1`, [ids.empresaA])).rows[0];
  assert.equal(marta.usuario_id, null, 'no debe vincularse por teléfono');
  assert.notEqual(nueva, undefined);

  const tabla = await consultarComo(db, laura, 'select * from public.clientes');
  assert.equal(tabla.length, 0, 'el cliente no debe leer la tabla (tiene notas internas)');
  const ficha = await consultarComo(db, laura, 'select * from public.mi_ficha_cliente');
  assert.equal(ficha.length, 1);
  assert.equal(ficha[0].id, porCorreo);
  assert.equal('notas_internas' in ficha[0], false);
});

test('el cliente edita sus datos por RPC pero no puede escribir la tabla directamente', async () => {
  await consultarComo(db, ids.userA, `select public.actualizar_mi_cliente($1, 'Ana', 'Pérez', '3009998877', '1990-01-01')`, [ids.empresaA]);
  const fila = (await db.query('select nombre, telefono from public.clientes where id = $1', [ids.clienteA])).rows[0];
  assert.deepEqual({ ...fila }, { nombre: 'Ana', telefono: '3009998877' });

  const resultado = await consultarComo(db, ids.userA,
    `update public.clientes set notas_internas = 'VIP' where id = $1 returning id`, [ids.clienteA]);
  assert.equal(resultado.length, 0);
});

test('derecho de supresión: anonimiza al cliente, cancela citas futuras y retira la membresía', async () => {
  const usuaria = await crearUsuario(db, 'borrar@test.co');
  const [{ id: cliente }] = await consultarComo(db, usuaria,
    `select public.unirse_como_cliente('spa-a', 'Borrar', 'Me', '3000000001', null, true) as id`);
  await consultarComo(db, usuaria, 'select public.anonimizar_mi_cliente($1)', [ids.empresaA]);

  const fila = (await db.query('select nombre, correo, telefono, usuario_id, anonimizado_at from public.clientes where id = $1', [cliente])).rows[0];
  assert.equal(fila.nombre, 'Cliente eliminado');
  assert.equal(fila.correo, null);
  assert.equal(fila.usuario_id, null);
  assert.ok(fila.anonimizado_at);
  const membresias = (await db.query('select count(*)::int as n from public.membresias where usuario_id = $1', [usuaria])).rows[0].n;
  assert.equal(membresias, 0);
});

test('los límites del plan impiden crear más empleados de los permitidos', async () => {
  await db.query(`update public.empresas set limites = '{"max_empleados": 2, "max_servicios": 50}' where id = $1`, [ids.empresaA]);
  await consultarComo(db, ids.bossA,
    `insert into public.empleados (empresa_id, nombre, correo) values ($1, 'Segunda', 'segunda@test.co')`, [ids.empresaA]);
  const error = await esperarError(consultarComo(db, ids.bossA,
    `insert into public.empleados (empresa_id, nombre, correo) values ($1, 'Tercera', 'tercera@test.co')`, [ids.empresaA]));
  assert.equal(error.hint, 'limite_plan');
  await db.query(`update public.empresas set limites = '{"max_empleados": 5, "max_servicios": 50}' where id = $1`, [ids.empresaA]);
});

test('la auditoría registra cambios sensibles y solo el jefe de la empresa la lee', async () => {
  const servicio = ids.serviciosA[0].id;
  await consultarComo(db, ids.bossA, 'update public.servicios set precio = 99000 where id = $1', [servicio]);
  const registros = await consultarComo(db, ids.bossA,
    `select accion, actor_id from public.auditoria where entidad = 'servicios' and entidad_id = $1 and accion = 'actualizar'`, [servicio]);
  assert.equal(registros.length, 1);
  assert.equal(registros[0].actor_id, ids.bossA);

  for (const rol of ['receptionistA', 'employeeA', 'userA']) {
    const filas = await consultarComo(db, ids[rol], 'select count(*)::int as n from public.auditoria');
    assert.equal(filas[0].n, 0, `${rol} puede leer auditoría`);
  }

  const borrar = await esperarError(consultarComo(db, ids.bossA, 'delete from public.auditoria'));
  assert.match(borrar.message, /permission denied/);
});

test('Storage: el jefe sube imágenes solo en la carpeta de su empresa', async () => {
  await consultarComo(db, ids.bossA,
    `insert into storage.objects (bucket_id, name) values ('empresas', $1)`, [`${ids.empresaA}/servicios/foto.webp`]);

  for (const [rol, ruta] of [
    ['bossA', `${ids.empresaB}/servicios/intruso.webp`],
    ['bossA', 'sin-uuid/servicios/x.webp'],
    ['employeeA', `${ids.empresaA}/servicios/empleado.webp`]
  ]) {
    const error = await esperarError(consultarComo(db, ids[rol],
      `insert into storage.objects (bucket_id, name) values ('empresas', $1)`, [ruta]));
    assert.match(error.message, /row-level security/, `${rol} pudo subir a ${ruta}`);
  }
});
