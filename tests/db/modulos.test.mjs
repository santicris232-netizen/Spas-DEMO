/* RPC de los módulos jefe y desarrollador (migración 20260926100000_rpc_modulos.sql). */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearBase, crearEscenario, consultarComo, esperarError, proximoLunes } from './helpers.mjs';

let db;
let ids;

before(async () => {
  db = await crearBase();
  ids = await crearEscenario(db);
});

after(async () => {
  await db.close();
});

/** Crea un segundo especialista de A con todos los servicios. */
async function segundoEspecialista() {
  const { rows } = await db.query(
    `insert into public.empleados (empresa_id, nombre, correo) values ($1, 'Segunda', 'segunda@test.co') returning id`, [ids.empresaA]);
  await db.query(
    'insert into public.empleado_servicios (empresa_id, empleado_id, servicio_id) select $1, $2, id from public.servicios where empresa_id = $1',
    [ids.empresaA, rows[0].id]);
  return rows[0].id;
}

test('desactivar especialista reasigna las citas que caben y deja sin asignar las demás', async () => {
  const segunda = await segundoEspecialista();
  const servicio = ids.serviciosA[0].id;
  const reservar = async (hora, empleado) => (await consultarComo(db, ids.bossA,
    'select public.reservar_cita($1, $2, $3, $4, $5) as id',
    [ids.empresaA, [servicio], await proximoLunes(db, hora, 21), empleado, ids.clienteA]))[0].id;

  const libre = await reservar('10:00', ids.empleadoA);
  const chocaria = await reservar('14:00', ids.empleadoA);
  await reservar('14:00', segunda); // la segunda ya está ocupada a las 14:00

  const [{ r }] = await consultarComo(db, ids.bossA, 'select public.desactivar_empleado($1, $2) as r', [ids.empleadoA, segunda]);
  assert.deepEqual(r, { reasignadas: 1, sin_asignar: 1 });

  const citas = (await db.query('select id, empleado_id from public.citas where id = any($1)', [[libre, chocaria]])).rows;
  assert.equal(citas.find(c => c.id === libre).empleado_id, segunda);
  assert.equal(citas.find(c => c.id === chocaria).empleado_id, null);

  const memb = (await db.query('select activo from public.membresias where usuario_id = $1', [ids.employeeA])).rows[0];
  assert.equal(memb.activo, false, 'debe perder el acceso');

  const metricas = (await consultarComo(db, ids.bossA, 'select public.metricas_empresa($1) as m', [ids.empresaA]))[0].m;
  assert.equal(metricas.sin_asignar, 1);

  await consultarComo(db, ids.bossA, 'select public.reactivar_empleado($1)', [ids.empleadoA]);
  const reactivada = (await db.query('select activo from public.membresias where usuario_id = $1', [ids.employeeA])).rows[0];
  assert.equal(reactivada.activo, true);
});

test('solo el jefe gestiona el equipo', async () => {
  for (const rol of ['receptionistA', 'employeeA', 'userA', 'bossB']) {
    const error = await esperarError(consultarComo(db, ids[rol], 'select public.desactivar_empleado($1)', [ids.empleadoA]));
    assert.equal(error.code, '42501', rol);
  }
});

test('no se puede dejar a una empresa sin jefe activo', async () => {
  const error = await esperarError(consultarComo(db, ids.bossA,
    'select public.cambiar_acceso_miembro($1, $2, false)', [ids.empresaA, ids.bossA]));
  assert.equal(error.hint, 'ultimo_jefe');

  await consultarComo(db, ids.bossA, 'select public.cambiar_acceso_miembro($1, $2, false)', [ids.empresaA, ids.receptionistA]);
  const filas = await consultarComo(db, ids.receptionistA, 'select count(*)::int as n from public.servicios');
  assert.equal(filas[0].n, 0, 'la recepcionista desactivada no debe ver datos');
  await consultarComo(db, ids.bossA, 'select public.cambiar_acceso_miembro($1, $2, true)', [ids.empresaA, ids.receptionistA]);
});

test('guardar_horarios reemplaza de forma atómica y rechaza franjas cruzadas o inválidas', async () => {
  const franjas = [
    { dia_semana: 1, hora_inicio: '08:00', hora_fin: '12:00' },
    { dia_semana: 1, hora_inicio: '14:00', hora_fin: '19:00' }
  ];
  await consultarComo(db, ids.bossA, 'select public.guardar_horarios($1, null, $2)', [ids.empresaA, JSON.stringify(franjas)]);
  const guardadas = (await db.query('select count(*)::int as n from public.horarios_atencion where empresa_id = $1 and empleado_id is null', [ids.empresaA])).rows[0].n;
  assert.equal(guardadas, 2);

  const cruzadas = await esperarError(consultarComo(db, ids.bossA, 'select public.guardar_horarios($1, null, $2)',
    [ids.empresaA, JSON.stringify([...franjas, { dia_semana: 1, hora_inicio: '11:00', hora_fin: '15:00' }])]));
  assert.equal(cruzadas.hint, 'horario_superpuesto');

  const invertida = await esperarError(consultarComo(db, ids.bossA, 'select public.guardar_horarios($1, null, $2)',
    [ids.empresaA, JSON.stringify([{ dia_semana: 2, hora_inicio: '18:00', hora_fin: '09:00' }])]));
  assert.equal(invertida.hint, 'horario_invalido');

  const intacto = (await db.query('select count(*)::int as n from public.horarios_atencion where empresa_id = $1 and empleado_id is null', [ids.empresaA])).rows[0].n;
  assert.equal(intacto, 2, 'un error no debe borrar los horarios existentes');

  const recepcion = await esperarError(consultarComo(db, ids.receptionistA, 'select public.guardar_horarios($1, null, $2)', [ids.empresaA, '[]']));
  assert.equal(recepcion.code, '42501');
});

test('metricas_empresa devuelve checklist y solo la ve el jefe', async () => {
  const [{ m }] = await consultarComo(db, ids.bossA, 'select public.metricas_empresa($1) as m', [ids.empresaA]);
  assert.equal(m.checklist.servicios, true);
  assert.equal(m.checklist.horarios, true);
  assert.equal(m.checklist.logo, false);
  assert.equal(typeof m.ingresos_completadas, 'number');

  const error = await esperarError(consultarComo(db, ids.receptionistA, 'select public.metricas_empresa($1)', [ids.empresaA]));
  assert.equal(error.code, '42501');
});

test('métricas, resumen de empresas y búsqueda de usuarios son solo para developers', async () => {
  const [{ m }] = await consultarComo(db, ids.dev, 'select public.metricas_plataforma() as m');
  assert.ok(m.por_estado.prueba >= 2);

  const resumen = await consultarComo(db, ids.dev, 'select slug, jefes from public.resumen_empresas() order by slug');
  assert.deepEqual(resumen.map(fila => fila.slug), ['spa-a', 'spa-b']);
  assert.equal(resumen[0].jefes[0].correo, 'boss.spa-a@test.co');

  const encontrados = await consultarComo(db, ids.dev, `select correo, membresias from public.buscar_usuarios('recept')`);
  assert.equal(encontrados.length, 2);

  for (const sql of ['select public.metricas_plataforma()', 'select * from public.resumen_empresas()', `select * from public.buscar_usuarios('boss')`]) {
    const error = await esperarError(consultarComo(db, ids.bossA, sql));
    assert.equal(error.code, '42501', sql);
  }
});

test('_usuario_por_correo no es accesible desde el navegador', async () => {
  const error = await esperarError(consultarComo(db, ids.dev, `select public._usuario_por_correo('boss.spa-a@test.co')`));
  assert.match(error.message, /permission denied/);
});

test('el modo soporte queda auditado', async () => {
  await consultarComo(db, ids.dev, 'select public.registrar_soporte($1)', [ids.empresaB]);
  const { rows } = await db.query(`select actor_id from public.auditoria where accion = 'ver_como_empresa' and empresa_id = $1`, [ids.empresaB]);
  assert.equal(rows[0].actor_id, ids.dev);
});

test('solo el developer cambia plan, límites y fin de prueba', async () => {
  await consultarComo(db, ids.dev, 'select public.actualizar_empresa_plataforma($1, $2)', [ids.empresaB, JSON.stringify({
    plan: 'pro', limites: { max_empleados: 20, max_servicios: 200 }, prueba_hasta: '2030-01-01', nit: ' 900.123.456-7 '
  })]);
  const fila = (await db.query('select plan, limites, prueba_hasta::text, nit, nombre from public.empresas where id = $1', [ids.empresaB])).rows[0];
  assert.deepEqual({ ...fila }, { plan: 'pro', limites: { max_empleados: 20, max_servicios: 200 }, prueba_hasta: '2030-01-01', nit: '900.123.456-7', nombre: 'Spa B' });

  const jefe = await esperarError(consultarComo(db, ids.bossB, 'select public.actualizar_empresa_plataforma($1, $2)', [ids.empresaB, '{"plan":"premium"}']));
  assert.equal(jefe.code, '42501');
  const invalido = await esperarError(consultarComo(db, ids.dev, 'select public.actualizar_empresa_plataforma($1, $2)', [ids.empresaB, '{"plan":"gratis"}']));
  assert.match(invalido.message, /check constraint/);
});
