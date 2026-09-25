/*
  CristaSpa - módulo del especialista (docs/flujos/10-modulo-empleado.md).
  Agenda propia por día o semana en la zona horaria de la empresa, marcar citas
  como realizadas o no asistidas, ausencias propias y avisos en tiempo real.
*/
import { protegerPagina, cambiarClave, cerrarSesion } from '../../compartido/js/auth.js';
import { rpc } from '../../compartido/js/supabase.js';
import { cambiarEstadoCita, escucharCitas, listarCitas } from '../../compartido/js/repos/citas.js';
import { crearBloqueo, eliminarBloqueo, listarBloqueos } from '../../compartido/js/repos/equipo.js';
import {
  activarPestanas, conCarga, crudo, dinero, esqueletos, html, mostrarError, telefonoWhatsapp, toast, vacio
} from '../../compartido/js/ui.js';
import { aInstante, duracionBonita, fechaBonita, fechaLocal, formatearDia, horaBonita, hoy, minutosEntre, rangoDias, sumarDias } from '../../compartido/js/fechas.js';

const ESTADOS = { pendiente: 'Pendiente', confirmada: 'Confirmada', completada: 'Realizada', cancelada: 'Cancelada', no_asistio: 'No asistió' };

const estado = {
  empresa: null,
  zona: 'America/Bogota',
  empleadoId: null,
  dia: null,
  rango: 'dia',
  filtro: '',
  citas: []
};

document.addEventListener('DOMContentLoaded', iniciar);

async function iniciar() {
  activarPestanas(document.getElementById('navegacion'), vista => {
    if (vista === 'vista-ausencias' && estado.empleadoId) {
      cargarAusencias().catch(mostrarError);
    }
  });
  const sesion = await protegerPagina({ roles: ['employee'], titulo: 'Mi agenda' });
  if (!sesion) {
    return;
  }
  estado.empresa = sesion.empresa;
  estado.zona = sesion.empresa.zona_horaria;
  estado.dia = hoy(estado.zona);
  const perfil = sesion.contexto.perfil || {};
  document.getElementById('empleado-nombre').textContent = `${perfil.nombre || ''} ${perfil.apellido || ''}`.trim() || 'Mis citas';

  conectarEventos();

  try {
    estado.empleadoId = await rpc('mi_empleado_id', { p_empresa: estado.empresa.id });
  } catch (error) {
    mostrarError(error);
  }
  if (!estado.empleadoId) {
    document.getElementById('lista-citas').innerHTML = vacio('Tu usuario aún no está vinculado a una ficha de especialista. Pide al jefe que revise tu invitación.');
    return;
  }

  await Promise.all([cargarAgenda(), cargarResumen()]).catch(mostrarError);
  if (document.getElementById('vista-ausencias').classList.contains('active')) {
    cargarAusencias().catch(mostrarError);
  }

  escucharCitas(estado.empresa.id, cambio => {
    if (cambio.eventType === 'INSERT' && cambio.new?.empleado_id === estado.empleadoId) {
      toast(`Nueva cita: ${fechaBonita(cambio.new.inicio, estado.zona)} a las ${horaBonita(cambio.new.inicio, estado.zona)}`);
    }
    Promise.all([cargarAgenda(), cargarResumen()]).catch(mostrarError);
  });
}

function conectarEventos() {
  document.getElementById('dia-anterior').addEventListener('click', () => moverDia(-1));
  document.getElementById('dia-siguiente').addEventListener('click', () => moverDia(1));
  document.getElementById('ir-hoy').addEventListener('click', () => {
    estado.dia = hoy(estado.zona);
    cargarAgenda().catch(mostrarError);
  });
  document.querySelectorAll('[data-rango]').forEach(boton => boton.addEventListener('click', () => {
    estado.rango = boton.dataset.rango;
    document.querySelectorAll('[data-rango]').forEach(item => item.classList.toggle('active', item === boton));
    cargarAgenda().catch(mostrarError);
  }));
  document.getElementById('filtro-estado').addEventListener('change', evento => {
    estado.filtro = evento.target.value;
    renderizarAgenda();
  });
  document.getElementById('lista-citas').addEventListener('click', alAccionCita);
  document.getElementById('form-ausencia').addEventListener('submit', guardarAusencia);
  document.getElementById('lista-ausencias').addEventListener('click', alEliminarAusencia);
  document.getElementById('form-clave').addEventListener('submit', guardarClave);
  document.getElementById('cerrar-sesion').addEventListener('click', cerrarSesion);
  document.getElementById('cerrar-sesion-2').addEventListener('click', cerrarSesion);
  const hoyLocal = hoy(estado.zona);
  document.getElementById('ausencia-desde').min = hoyLocal;
  document.getElementById('ausencia-hasta').min = hoyLocal;
}

function moverDia(signo) {
  estado.dia = sumarDias(estado.dia, signo * (estado.rango === 'semana' ? 7 : 1));
  cargarAgenda().catch(mostrarError);
}

/** Rango de fechas locales visible (día o semana de lunes a domingo). */
function rangoVisible() {
  if (estado.rango === 'dia') {
    return { desde: estado.dia, hasta: estado.dia };
  }
  const diaSemana = new Date(`${estado.dia}T12:00:00Z`).getUTCDay();
  const lunes = sumarDias(estado.dia, -((diaSemana + 6) % 7));
  return { desde: lunes, hasta: sumarDias(lunes, 6) };
}

async function cargarAgenda() {
  const { desde, hasta } = rangoVisible();
  const titulo = desde === hasta
    ? (desde === hoy(estado.zona) ? 'Hoy · ' : '') + formatearDia(desde, { weekday: 'long', day: 'numeric', month: 'long' })
    : `${formatearDia(desde, { day: 'numeric', month: 'short' })} – ${formatearDia(hasta, { day: 'numeric', month: 'short' })}`;
  document.getElementById('fecha-titulo').textContent = titulo;
  document.getElementById('lista-citas').innerHTML = esqueletos(2);
  const rango = rangoDias(desde, hasta, estado.zona);
  estado.citas = await listarCitas(estado.empresa.id, { desde: rango.inicio, hasta: rango.fin, empleadoId: estado.empleadoId });
  renderizarAgenda();
}

async function cargarResumen() {
  const hoyLocal = hoy(estado.zona);
  const inicioMes = `${hoyLocal.slice(0, 8)}01`;
  const rangoHoy = rangoDias(hoyLocal, hoyLocal, estado.zona);
  const desdeMes = rangoDias(inicioMes, inicioMes, estado.zona).inicio;
  const [deHoy, proximas, delMes] = await Promise.all([
    listarCitas(estado.empresa.id, { desde: rangoHoy.inicio, hasta: rangoHoy.fin, empleadoId: estado.empleadoId, estados: ['pendiente', 'confirmada', 'completada'] }),
    listarCitas(estado.empresa.id, { desde: new Date().toISOString(), empleadoId: estado.empleadoId, estados: ['pendiente', 'confirmada'] }),
    listarCitas(estado.empresa.id, { desde: desdeMes, empleadoId: estado.empleadoId, estados: ['completada'] })
  ]);
  document.getElementById('resumen').innerHTML = html`
    <div class="summary-item"><strong>${deHoy.length}</strong><span>Hoy</span></div>
    <div class="summary-item"><strong>${proximas.length}</strong><span>Próximas</span></div>
    <div class="summary-item"><strong>${delMes.length}</strong><span>Realizadas mes</span></div>`;
}

function renderizarAgenda() {
  const citas = estado.citas.filter(cita => !estado.filtro || cita.estado === estado.filtro);
  const lista = document.getElementById('lista-citas');
  if (!citas.length) {
    lista.innerHTML = vacio(estado.rango === 'dia' ? 'No tienes citas este día.' : 'No tienes citas esta semana.');
    return;
  }
  let diaActual = null;
  lista.innerHTML = citas.map(cita => {
    const dia = fechaLocal(cita.inicio, estado.zona);
    const separador = estado.rango === 'semana' && dia !== diaActual
      ? html`<p class="dia-separador">${formatearDia(dia, { weekday: 'long', day: 'numeric', month: 'long' })}</p>` : '';
    diaActual = dia;
    return separador + tarjetaCita(cita);
  }).join('');
}

function tarjetaCita(cita) {
  const empezo = Date.now() >= new Date(cita.inicio).getTime();
  const puedeCerrar = cita.estado === 'confirmada' && empezo;
  const numero = telefonoWhatsapp(cita.cliente_telefono);
  return html`
    <article class="card employee-appointment-card agenda-card" style="--categoria: ${cita.empleado_color || 'var(--brand-primary)'}">
      <div class="employee-card-top">
        <div>
          <h3 class="employee-card-title">${cita.cliente_nombre} ${cita.cliente_apellido}</h3>
          <p class="card-text">${cita.servicios.map(item => item.nombre).join(' + ')} · ${duracionBonita(minutosEntre(cita.inicio, cita.fin))}</p>
        </div>
        <div class="time-badge">${horaBonita(cita.inicio, estado.zona)}<small>a ${horaBonita(cita.fin, estado.zona)}</small></div>
      </div>
      <div class="card-meta">
        <span class="status-pill status-${cita.estado}">${ESTADOS[cita.estado]}</span>
        ${cita.total !== null ? crudo(html`<span class="meta-chip">${dinero(cita.total, estado.empresa.moneda)}</span>`) : ''}
        ${cita.cliente_telefono ? crudo(html`<span class="meta-chip"><a href="tel:${cita.cliente_telefono}">${cita.cliente_telefono}</a></span>`) : ''}
        ${numero ? crudo(html`<span class="meta-chip"><a href="https://wa.me/${numero}" target="_blank" rel="noopener">WhatsApp</a></span>`) : ''}
      </div>
      ${cita.notas ? crudo(html`<p class="employee-services">Notas: ${cita.notas}</p>`) : ''}
      ${cita.estado === 'pendiente' ? crudo('<p class="muted-text">Pendiente de confirmación por el negocio.</p>') : ''}
      ${puedeCerrar ? crudo(html`
        <div class="acciones-cita">
          <button class="primary-button" type="button" data-accion="completada" data-id="${cita.id}">Realizada</button>
          <button class="secondary-button" type="button" data-accion="no_asistio" data-id="${cita.id}">No asistió</button>
        </div>`) : ''}
    </article>`;
}

async function alAccionCita(evento) {
  const boton = evento.target.closest('[data-accion]');
  if (!boton) {
    return;
  }
  const accion = boton.dataset.accion;
  if (accion === 'no_asistio' && !window.confirm('¿Marcar que el cliente no asistió?')) {
    return;
  }
  await conCarga(boton, async () => {
    await cambiarEstadoCita(boton.dataset.id, accion);
    toast(accion === 'completada' ? 'Cita marcada como realizada.' : 'Cita marcada como no asistida.');
    await Promise.all([cargarAgenda(), cargarResumen()]);
  });
}

// ---------------------------------------------------------------------------
// Ausencias
// ---------------------------------------------------------------------------

async function cargarAusencias() {
  const lista = document.getElementById('lista-ausencias');
  lista.innerHTML = esqueletos(1);
  const bloqueos = (await listarBloqueos(estado.empresa.id, new Date().toISOString()))
    .filter(bloqueo => bloqueo.empleado_id === estado.empleadoId || bloqueo.empleado_id === null);
  lista.innerHTML = bloqueos.length
    ? bloqueos.map(bloqueo => html`
      <article class="card card-body">
        <h3 class="card-title">${bloqueo.motivo || 'Ausencia'}</h3>
        <p class="card-text">${fechaBonita(bloqueo.inicio, estado.zona)} ${horaBonita(bloqueo.inicio, estado.zona)} → ${fechaBonita(bloqueo.fin, estado.zona)} ${horaBonita(bloqueo.fin, estado.zona)}</p>
        ${bloqueo.empleado_id ? crudo(html`<div class="acciones-cita"><button class="danger-button" type="button" data-bloqueo="${bloqueo.id}">Eliminar</button></div>`)
          : crudo('<p class="muted-text">Cierre de toda la empresa.</p>')}
      </article>`).join('')
    : vacio('No tienes ausencias programadas.');
}

async function guardarAusencia(evento) {
  evento.preventDefault();
  const formulario = evento.currentTarget;
  if (!formulario.checkValidity()) {
    toast('Completa las fechas, horas y el motivo.');
    return;
  }
  const inicio = aInstante(formulario.querySelector('#ausencia-desde').value, formulario.querySelector('#ausencia-hora-desde').value, estado.zona);
  const fin = aInstante(formulario.querySelector('#ausencia-hasta').value, formulario.querySelector('#ausencia-hora-hasta').value, estado.zona);
  if (new Date(fin) <= new Date(inicio)) {
    toast('La fecha final debe ser posterior a la inicial.');
    return;
  }
  await conCarga(evento.submitter, async () => {
    await crearBloqueo(estado.empresa.id, {
      empleadoId: estado.empleadoId, inicio, fin, motivo: formulario.querySelector('#ausencia-motivo').value.trim()
    });
    formulario.reset();
    toast('Agenda bloqueada.');
    await cargarAusencias();
  });
}

async function alEliminarAusencia(evento) {
  const boton = evento.target.closest('[data-bloqueo]');
  if (!boton || !window.confirm('¿Eliminar esta ausencia?')) {
    return;
  }
  await conCarga(boton, async () => {
    await eliminarBloqueo(boton.dataset.bloqueo);
    toast('Ausencia eliminada.');
    await cargarAusencias();
  });
}

async function guardarClave(evento) {
  evento.preventDefault();
  const clave = document.getElementById('clave-nueva').value;
  if (clave.length < 8 || !/[a-zA-Z]/.test(clave) || !/\d/.test(clave)) {
    toast('La contraseña debe tener al menos 8 caracteres, con letras y números.');
    return;
  }
  await conCarga(evento.submitter, async () => {
    await cambiarClave(clave);
    evento.target.reset();
    toast('Contraseña actualizada.');
  });
}
