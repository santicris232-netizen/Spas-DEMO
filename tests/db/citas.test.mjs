/*
  Reglas de agenda (docs/flujos/08-flujo-citas.md): disponibilidad, reservas,
  choques de horario, máquina de estados y permisos por rol.
*/
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearBase, crearEscenario, como, consultarComo, esperarError, proximoLunes } from './helpers.mjs';

let db;
let ids;

before(async () => {
  db = await crearBase();
  ids = await crearEscenario(db);
});

after(async () => {
  await db.close();
});

/** Servicio de A por nombre. */
function servicioA(nombre) {
  const servicio = ids.serviciosA.find(item => item.nombre === nombre);
  assert.ok(servicio, `No existe el servicio ${nombre}`);
  return servicio;
}

/** Reserva como jefe de A y devuelve el id de la cita. */
async function reservarComoJefe(servicios, inicio, extra = {}) {
  const filas = await consultarComo(db, ids.bossA,
    'select public.reservar_cita($1, $2, $3, $4, $5, $6, $7) as id',
    [ids.empresaA, servicios, inicio, extra.empleado ?? ids.empleadoA, extra.cliente ?? ids.clienteA, '', extra.estado ?? null]);
  return filas[0].id;
}

/** Inserta una cita directamente (como superusuario), útil para citas en el pasado. */
async function insertarCita(inicio, minutos, estado) {
  const { rows } = await db.query(
    `insert into public.citas (empresa_id, cliente_id, empleado_id, inicio, fin, estado, origen)
     values ($1, $2, $3, $4::timestamptz, $4::timestamptz + make_interval(mins => $5), $6, 'jefe') returning id`,
    [ids.empresaA, ids.clienteA, ids.empleadoA, inicio, minutos, estado]);
  return rows[0].id;
}

test('el cliente reserva: queda pendiente con fin y total calculados en el servidor', async () => {
  const servicio = servicioA('Extensiones Clásicas'); // 120 min
  const inicio = await proximoLunes(db, '09:00', 1);
  const filas = await consultarComo(db, ids.userA,
    'select public.reservar_cita($1, $2, $3, $4) as id', [ids.empresaA, [servicio.id], inicio, ids.empleadoA]);
  const cita = (await db.query('select * from public.citas where id = $1', [filas[0].id])).rows[0];

  assert.equal(cita.estado, 'pendiente');
  assert.equal(cita.origen, 'usuario');
  assert.equal(cita.cliente_id, ids.clienteA);
  assert.equal((cita.fin - cita.inicio) / 60000, 120);
  assert.equal(Number(cita.total), Number(servicio.precio));

  const congelados = (await db.query('select nombre, precio from public.cita_servicios where cita_id = $1', [cita.id])).rows;
  assert.deepEqual(congelados.map(fila => fila.nombre), ['Extensiones Clásicas']);
});

test('el cliente no puede reservar para otro cliente ni forzar el estado', async () => {
  const inicio = await proximoLunes(db, '15:00', 1);
  const filas = await consultarComo(db, ids.userA,
    'select public.reservar_cita($1, $2, $3, $4, $5, $6, $7) as id',
    [ids.empresaA, [servicioA('Tinte de Pestañas').id], inicio, ids.empleadoA, ids.clienteB, '', 'confirmada']);
  const cita = (await db.query('select cliente_id, estado from public.citas where id = $1', [filas[0].id])).rows[0];
  assert.equal(cita.cliente_id, ids.clienteA, 'debe usar su propia ficha de cliente');
  assert.equal(cita.estado, 'pendiente');
});

test('no se permite doble reserva del mismo especialista (ni cruzada por duración)', async () => {
  const inicio = await proximoLunes(db, '10:00', 2);
  await reservarComoJefe([servicioA('Extensiones Volumen').id], inicio); // 10:00–12:30
  const cruzada = await proximoLunes(db, '12:00', 2);
  const error = await esperarError(reservarComoJefe([servicioA('Tinte de Pestañas').id], cruzada));
  assert.equal(error.hint, 'horario_ocupado');
});

test('la restricción EXCLUDE bloquea el choque aunque se salte la validación previa', async () => {
  const inicio = await proximoLunes(db, '16:00', 2);
  await insertarCita(inicio, 60, 'confirmada');
  const error = await esperarError(insertarCita(inicio, 30, 'pendiente'));
  assert.match(error.message, /citas_sin_choque/);
  // Una cita cancelada no ocupa el horario.
  await insertarCita(inicio, 30, 'cancelada');
});

test('disponibilidad respeta duración y citas existentes (ejemplo del flujo 08)', async () => {
  const dia = await proximoLunes(db, '00:00', 3);
  const fecha = dia.slice(0, 10) === (await proximoLunes(db, '12:00', 3)).slice(0, 10) ? dia.slice(0, 10) : (await proximoLunes(db, '12:00', 3)).slice(0, 10);
  await db.query('update public.empresa_config set intervalo_agenda_min = 30 where empresa_id = $1', [ids.empresaA]);
  // Horario de ese día: 09:00–12:00 solo para esta prueba (el jueves = lunes + 3).
  const dow = (await db.query(`select extract(dow from $1::date)::int as d`, [fecha])).rows[0].d;
  await db.query('update public.horarios_atencion set hora_fin = $3 where empresa_id = $1 and dia_semana = $2',
    [ids.empresaA, dow, '12:00']);
  await reservarComoJefe([servicioA('Lifting de Pestañas').id], await proximoLunes(db, '10:00', 3)); // 10:00–11:00

  const servicio90 = servicioA('Laminado de Cejas').id; // 60 min
  await db.query('update public.servicios set duracion_min = 90 where id = $1', [servicio90]);
  const libres = await consultarComo(db, ids.userA,
    'select inicio from public.disponibilidad($1, $2, $3, $3, $4)', [ids.empresaA, [servicio90], fecha, ids.empleadoA]);
  assert.deepEqual(libres, [], 'un servicio de 90 min no cabe alrededor de una cita de 10:00 a 11:00 en un horario 09–12');

  const servicio60 = servicioA('Mantenimiento Express').id; // 60 min
  const horas = (await consultarComo(db, ids.userA,
    `select to_char(inicio at time zone 'America/Bogota', 'HH24:MI') as h from public.disponibilidad($1, $2, $3, $3, $4)`,
    [ids.empresaA, [servicio60], fecha, ids.empleadoA])).map(fila => fila.h);
  assert.deepEqual(horas, ['09:00', '11:00']);

  await db.query('update public.servicios set duracion_min = 60 where id = $1', [servicio90]);
  await db.query('update public.horarios_atencion set hora_fin = $3 where empresa_id = $1 and dia_semana = $2',
    [ids.empresaA, dow, '18:00']);
});

test('disponibilidad excluye bloqueos y días sin horario (domingo)', async () => {
  const lunes = await proximoLunes(db, '09:00', 7);
  await db.query(
    `insert into public.bloqueos_agenda (empresa_id, empleado_id, inicio, fin, motivo)
     values ($1, $2, $3::timestamptz, $3::timestamptz + interval '9 hours', 'Capacitación')`,
    [ids.empresaA, ids.empleadoA, lunes]);
  const fechaLunes = (await db.query(`select ($1::timestamptz at time zone 'America/Bogota')::date::text as f`, [lunes])).rows[0].f;
  const domingo = (await db.query(`select ($1::date - 1)::text as f`, [fechaLunes])).rows[0].f;

  for (const fecha of [fechaLunes, domingo]) {
    const libres = await consultarComo(db, ids.userA,
      'select * from public.disponibilidad($1, $2, $3, $3)', [ids.empresaA, [servicioA('Tinte de Pestañas').id], fecha]);
    assert.deepEqual(libres, [], `hay horarios libres el ${fecha}`);
  }
});

test('el cliente no puede reservar con menos anticipación que la mínima ni fuera de horario', async () => {
  const pronto = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const error = await esperarError(consultarComo(db, ids.userA,
    'select public.reservar_cita($1, $2, $3)', [ids.empresaA, [servicioA('Tinte de Pestañas').id], pronto]));
  assert.equal(error.hint, 'anticipacion_minima');

  const noche = await proximoLunes(db, '20:00', 1);
  const fueraHorario = await esperarError(consultarComo(db, ids.userA,
    'select public.reservar_cita($1, $2, $3, $4)', [ids.empresaA, [servicioA('Tinte de Pestañas').id], noche, ids.empleadoA]));
  assert.equal(fueraHorario.hint, 'horario_ocupado');
});

test('sin especialista elegido se asigna uno apto automáticamente', async () => {
  const inicio = await proximoLunes(db, '14:00', 4);
  const filas = await consultarComo(db, ids.userA,
    'select public.reservar_cita($1, $2, $3) as id', [ids.empresaA, [servicioA('Henna de Cejas').id], inicio]);
  const cita = (await db.query('select empleado_id from public.citas where id = $1', [filas[0].id])).rows[0];
  assert.equal(cita.empleado_id, ids.empleadoA);
});

test('un especialista que no hace el servicio no puede ser asignado', async () => {
  const otro = (await db.query(
    `insert into public.empleados (empresa_id, nombre, correo) values ($1, 'Sin servicios', 'nada@test.co') returning id`,
    [ids.empresaA])).rows[0].id;
  const error = await esperarError(reservarComoJefe([servicioA('Tinte de Pestañas').id], await proximoLunes(db, '11:00', 4), { empleado: otro }));
  assert.equal(error.hint, 'especialista_no_apto');
});

test('la recepcionista agenda para cualquier cliente y queda con origen recepcion', async () => {
  const filas = await consultarComo(db, ids.receptionistA,
    'select public.reservar_cita($1, $2, $3, $4, $5) as id',
    [ids.empresaA, [servicioA('Diseño de Cejas').id], await proximoLunes(db, '09:00', 5), ids.empleadoA, ids.clienteA]);
  const cita = (await db.query('select origen, estado from public.citas where id = $1', [filas[0].id])).rows[0];
  assert.deepEqual({ ...cita }, { origen: 'recepcion', estado: 'confirmada' });
});

test('el empleado no puede agendar citas', async () => {
  const error = await esperarError(consultarComo(db, ids.employeeA,
    'select public.reservar_cita($1, $2, $3, $4, $5)',
    [ids.empresaA, [servicioA('Diseño de Cejas').id], await proximoLunes(db, '10:00', 5), ids.empleadoA, ids.clienteA]));
  assert.equal(error.code, '42501');
});

test('máquina de estados: el empleado completa sus citas solo después del inicio', async () => {
  const futura = await reservarComoJefe([servicioA('Tinte de Pestañas').id], await proximoLunes(db, '11:00', 5));
  const antes = await esperarError(consultarComo(db, ids.employeeA,
    `select public.cambiar_estado_cita($1, 'completada')`, [futura]));
  assert.equal(antes.hint, 'aun_no_inicia');

  const pasada = await insertarCita(new Date(Date.now() - 2 * 3600 * 1000).toISOString(), 60, 'confirmada');
  await consultarComo(db, ids.employeeA, `select public.cambiar_estado_cita($1, 'completada')`, [pasada]);
  const estado = (await db.query('select estado from public.citas where id = $1', [pasada])).rows[0].estado;
  assert.equal(estado, 'completada');

  const cerrada = await esperarError(consultarComo(db, ids.bossA, `select public.cambiar_estado_cita($1, 'cancelada')`, [pasada]));
  assert.equal(cerrada.hint, 'estado_final');
});

test('el empleado no puede confirmar ni tocar citas de otro especialista', async () => {
  const cita = await reservarComoJefe([servicioA('Tinte de Pestañas').id], await proximoLunes(db, '15:00', 5), { estado: 'pendiente' });
  const confirmar = await esperarError(consultarComo(db, ids.employeeA, `select public.cambiar_estado_cita($1, 'confirmada')`, [cita]));
  assert.equal(confirmar.code, '42501');

  const citaB = (await db.query('select id from public.citas where empresa_id = $1 limit 1', [ids.empresaB])).rows[0];
  if (citaB) {
    const ajena = await esperarError(consultarComo(db, ids.employeeA, `select public.cambiar_estado_cita($1, 'completada')`, [citaB.id]));
    assert.equal(ajena.code, '42501');
  }
});

test('el cliente cancela dentro del plazo y el horario se libera', async () => {
  const inicio = await proximoLunes(db, '17:00', 5);
  const filas = await consultarComo(db, ids.userA,
    'select public.reservar_cita($1, $2, $3, $4) as id', [ids.empresaA, [servicioA('Tinte de Pestañas').id], inicio, ids.empleadoA]);
  await consultarComo(db, ids.userA, `select public.cambiar_estado_cita($1, 'cancelada', 'Viaje')`, [filas[0].id]);
  const cita = (await db.query('select estado, motivo_cancelacion, cancelada_por from public.citas where id = $1', [filas[0].id])).rows[0];
  assert.deepEqual({ ...cita }, { estado: 'cancelada', motivo_cancelacion: 'Viaje', cancelada_por: ids.userA });

  await reservarComoJefe([servicioA('Tinte de Pestañas').id], inicio);
});

test('el cliente no puede cancelar fuera del plazo ni confirmar', async () => {
  const cercana = await insertarCita(new Date(Date.now() + 3 * 3600 * 1000).toISOString(), 30, 'confirmada');
  const tarde = await esperarError(consultarComo(db, ids.userA, `select public.cambiar_estado_cita($1, 'cancelada')`, [cercana]));
  assert.equal(tarde.hint, 'fuera_de_plazo');

  const confirmar = await esperarError(consultarComo(db, ids.userA, `select public.cambiar_estado_cita($1, 'confirmada')`, [cercana]));
  assert.equal(confirmar.code, '42501');
});

test('reprogramar: el cliente mueve su cita y vuelve a pendiente', async () => {
  const cita = await reservarComoJefe([servicioA('Tinte de Pestañas').id], await proximoLunes(db, '09:00', 8));
  const nuevo = await proximoLunes(db, '13:00', 8);
  await consultarComo(db, ids.userA, 'select public.reprogramar_cita($1, $2)', [cita, nuevo]);
  const fila = (await db.query('select inicio, estado from public.citas where id = $1', [cita])).rows[0];
  assert.equal(fila.inicio.toISOString(), nuevo);
  assert.equal(fila.estado, 'pendiente');
});

test('el empleado no ve precios salvo que la empresa lo active; nunca ve el correo del cliente', async () => {
  const cita = await reservarComoJefe([servicioA('Tinte de Pestañas').id], await proximoLunes(db, '10:00', 9));
  const leer = async rol => (await consultarComo(db, ids[rol],
    'select total, cliente_correo, servicios from public.citas_detalle where id = $1', [cita]))[0];

  const oculto = await leer('employeeA');
  assert.equal(oculto.total, null);
  assert.equal(oculto.cliente_correo, null);
  assert.equal(oculto.servicios[0].precio, null);

  await db.query('update public.empresa_config set empleado_ve_precios = true where empresa_id = $1', [ids.empresaA]);
  assert.notEqual((await leer('employeeA')).total, null);
  await db.query('update public.empresa_config set empleado_ve_precios = false where empresa_id = $1', [ids.empresaA]);

  const jefe = await leer('bossA');
  assert.notEqual(jefe.total, null);
  assert.ok(jefe.cliente_correo);
});

test('el empleado no puede leer la tabla de clientes (notas internas)', async () => {
  const filas = await consultarComo(db, ids.employeeA, 'select count(*)::int as n from public.clientes where empresa_id = $1', [ids.empresaA]);
  assert.equal(filas[0].n, 0);
});

test('el cliente solo ve sus propias citas', async () => {
  const otro = await consultarComo(db, ids.bossA,
    `insert into public.clientes (empresa_id, nombre, telefono) values ($1, 'Otra clienta', '3000000000') returning id`, [ids.empresaA]);
  await reservarComoJefe([servicioA('Tinte de Pestañas').id], await proximoLunes(db, '11:00', 9), { cliente: otro[0].id });

  const propias = await consultarComo(db, ids.userA,
    'select distinct cliente_id from public.citas_detalle where empresa_id = $1', [ids.empresaA]);
  assert.deepEqual(propias.map(fila => fila.cliente_id), [ids.clienteA], 'mismo teléfono no debe dar acceso (hallazgo S-06)');
});
