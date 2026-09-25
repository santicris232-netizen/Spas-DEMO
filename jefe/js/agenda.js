/*
  CristaSpa - agenda del jefe/recepción: día o semana, filtros, acciones por estado,
  checklist de puesta en marcha y actualización en tiempo real.
*/
import { cambiarEstadoCita, escucharCitas, listarCitas } from '../../compartido/js/repos/citas.js';
import { metricasEmpresa } from '../../compartido/js/repos/empresa.js';
import { conCarga, crudo, dinero, esqueletos, html, mostrarError, telefonoWhatsapp, toast, vacio } from '../../compartido/js/ui.js';
import { duracionBonita, fechaLocal, formatearDia, horaBonita, hoy, minutosEntre, rangoDias, sumarDias } from '../../compartido/js/fechas.js';
import { app, ESTADOS_CITA } from './estado.js';
import { abrirNuevaCita, abrirReprogramar } from './cita-form.js';

const vista = { dia: null, rango: 'dia', especialista: '', estado: '', busqueda: '', citas: [] };

export async function iniciarAgenda() {
  vista.dia = hoy(app.zona);
  llenarFiltroEspecialistas();
  document.addEventListener('catalogos-actualizados', llenarFiltroEspecialistas);

  document.getElementById('agenda-anterior').addEventListener('click', () => mover(-1));
  document.getElementById('agenda-siguiente').addEventListener('click', () => mover(1));
  document.getElementById('agenda-hoy').addEventListener('click', () => {
    vista.dia = hoy(app.zona);
    cargar().catch(mostrarError);
  });
  document.querySelectorAll('#vista-agenda [data-rango]').forEach(boton => boton.addEventListener('click', () => {
    vista.rango = boton.dataset.rango;
    document.querySelectorAll('#vista-agenda [data-rango]').forEach(item => item.classList.toggle('active', item === boton));
    cargar().catch(mostrarError);
  }));
  document.getElementById('agenda-especialista').addEventListener('change', evento => {
    vista.especialista = evento.target.value;
    cargar().catch(mostrarError);
  });
  document.getElementById('agenda-estado').addEventListener('change', evento => {
    vista.estado = evento.target.value;
    renderizar();
  });
  document.getElementById('agenda-busqueda').addEventListener('input', evento => {
    vista.busqueda = evento.target.value.trim().toLowerCase();
    renderizar();
  });
  document.getElementById('nueva-cita').addEventListener('click', () => abrirNuevaCita({
    fecha: vista.dia >= hoy(app.zona) ? vista.dia : null,
    alGuardar: () => recargar()
  }));
  document.getElementById('agenda-lista').addEventListener('click', alAccion);

  await Promise.all([cargar(), cargarChecklist()]);
  escucharCitas(app.empresa.id, () => cargar().catch(mostrarError));
}

/** Recarga agenda y checklist (tras crear o cambiar citas desde otras secciones). */
export function recargar() {
  cargar().catch(mostrarError);
  cargarChecklist().catch(mostrarError);
}

function llenarFiltroEspecialistas() {
  const select = document.getElementById('agenda-especialista');
  select.innerHTML = html`<option value="">Todos los especialistas</option><option value="sin">Sin asignar</option>`
    + app.empleados.filter(empleado => empleado.activo).map(empleado => html`<option value="${empleado.id}">${empleado.nombre}</option>`).join('');
  select.value = vista.especialista;
}

function mover(signo) {
  vista.dia = sumarDias(vista.dia, signo * (vista.rango === 'semana' ? 7 : 1));
  cargar().catch(mostrarError);
}

function rangoVisible() {
  if (vista.rango === 'dia') {
    return { desde: vista.dia, hasta: vista.dia };
  }
  const diaSemana = new Date(`${vista.dia}T12:00:00Z`).getUTCDay();
  const lunes = sumarDias(vista.dia, -((diaSemana + 6) % 7));
  return { desde: lunes, hasta: sumarDias(lunes, 6) };
}

async function cargar() {
  const { desde, hasta } = rangoVisible();
  document.getElementById('agenda-titulo').textContent = desde === hasta
    ? (desde === hoy(app.zona) ? 'Hoy · ' : '') + formatearDia(desde, { weekday: 'long', day: 'numeric', month: 'long' })
    : `${formatearDia(desde, { day: 'numeric', month: 'short' })} – ${formatearDia(hasta, { day: 'numeric', month: 'short' })}`;
  document.getElementById('agenda-lista').innerHTML = esqueletos(3);
  const rango = rangoDias(desde, hasta, app.zona);
  vista.citas = await listarCitas(app.empresa.id, {
    desde: rango.inicio,
    hasta: rango.fin,
    empleadoId: vista.especialista === 'sin' ? null : vista.especialista || undefined
  });
  renderizar();
}

function renderizar() {
  const citas = vista.citas.filter(cita => (!vista.estado || cita.estado === vista.estado)
    && (!vista.busqueda || `${cita.cliente_nombre} ${cita.cliente_apellido} ${cita.cliente_telefono || ''} ${cita.cliente_correo || ''}`.toLowerCase().includes(vista.busqueda)));
  const lista = document.getElementById('agenda-lista');
  if (!citas.length) {
    lista.innerHTML = vacio(vista.rango === 'dia' ? 'No hay citas este día.' : 'No hay citas esta semana.');
    return;
  }
  let diaActual = null;
  lista.innerHTML = citas.map(cita => {
    const dia = fechaLocal(cita.inicio, app.zona);
    const separador = vista.rango === 'semana' && dia !== diaActual
      ? html`<p class="dia-separador">${formatearDia(dia, { weekday: 'long', day: 'numeric', month: 'long' })}</p>` : '';
    diaActual = dia;
    return separador + tarjeta(cita);
  }).join('');
}

function tarjeta(cita) {
  const empezo = Date.now() >= new Date(cita.inicio).getTime();
  const activa = ['pendiente', 'confirmada'].includes(cita.estado);
  const numero = telefonoWhatsapp(cita.cliente_telefono);
  const acciones = [];
  if (cita.estado === 'pendiente') {
    acciones.push(['confirmar', 'Confirmar', 'primary-button']);
  }
  if (activa) {
    acciones.push(['reprogramar', cita.empleado_id ? 'Reprogramar' : 'Asignar especialista', 'secondary-button']);
  }
  if (activa && empezo) {
    acciones.push(['completar', 'Realizada', 'primary-button'], ['no_asistio', 'No asistió', 'secondary-button']);
  }
  if (activa) {
    acciones.push(['cancelar', 'Cancelar', 'danger-button']);
  }

  return html`
    <article class="card management-card agenda-card" style="--categoria: ${cita.empleado_color || 'var(--brand-primary)'}">
      <div class="management-top">
        <div>
          <h3 class="management-title">${cita.cliente_nombre} ${cita.cliente_apellido}</h3>
          <p class="management-subtitle">${horaBonita(cita.inicio, app.zona)} – ${horaBonita(cita.fin, app.zona)} · ${duracionBonita(minutosEntre(cita.inicio, cita.fin))}</p>
        </div>
        <span class="status-pill status-${cita.estado}">${ESTADOS_CITA[cita.estado]}</span>
      </div>
      <p class="card-text">${cita.servicios.map(item => item.nombre).join(' + ')}</p>
      <div class="card-meta">
        <span class="meta-chip">${cita.empleado_nombre || '⚠ Sin especialista'}</span>
        <span class="meta-chip">${dinero(cita.total, app.moneda)}</span>
        ${cita.cliente_telefono ? crudo(html`<span class="meta-chip"><a href="tel:${cita.cliente_telefono}">${cita.cliente_telefono}</a></span>`) : ''}
        ${numero ? crudo(html`<span class="meta-chip"><a href="https://wa.me/${numero}" target="_blank" rel="noopener">WhatsApp</a></span>`) : ''}
        <span class="meta-chip">${{ usuario: 'Reservó el cliente', jefe: 'Agendó el negocio', recepcion: 'Agendó recepción', empleado: 'Agendó especialista' }[cita.origen]}</span>
      </div>
      ${cita.notas ? crudo(html`<p class="muted-text">Notas: ${cita.notas}</p>`) : ''}
      ${cita.motivo_cancelacion ? crudo(html`<p class="muted-text">Motivo de cancelación: ${cita.motivo_cancelacion}</p>`) : ''}
      ${acciones.length ? crudo(html`<div class="appointment-actions" data-escritura>
        ${crudo(acciones.map(([accion, texto, clase]) => html`<button class="${clase}" type="button" data-accion="${accion}" data-id="${cita.id}">${texto}</button>`).join(''))}
      </div>`) : ''}
    </article>`;
}

async function alAccion(evento) {
  const boton = evento.target.closest('[data-accion]');
  if (!boton) {
    return;
  }
  const cita = vista.citas.find(item => item.id === boton.dataset.id);
  if (!cita) {
    return;
  }
  const accion = boton.dataset.accion;
  if (accion === 'reprogramar') {
    abrirReprogramar(cita, recargar);
    return;
  }
  let motivo = null;
  if (accion === 'cancelar') {
    if (!window.confirm(`¿Cancelar la cita de ${cita.cliente_nombre}?`)) {
      return;
    }
    motivo = window.prompt('Motivo de la cancelación (opcional)') || null;
  }
  if (accion === 'no_asistio' && !window.confirm('¿Marcar que el cliente no asistió?')) {
    return;
  }
  const estados = { confirmar: 'confirmada', cancelar: 'cancelada', completar: 'completada', no_asistio: 'no_asistio' };
  await conCarga(boton, async () => {
    await cambiarEstadoCita(cita.id, estados[accion], motivo);
    toast({ confirmar: 'Cita confirmada.', cancelar: 'Cita cancelada.', completar: 'Cita realizada.', no_asistio: 'Marcada como no asistida.' }[accion]);
    recargar();
  });
}

async function cargarChecklist() {
  const contenedor = document.getElementById('checklist');
  if (!app.esJefe) {
    contenedor.innerHTML = '';
    return;
  }
  const metricas = await metricasEmpresa(app.empresa.id);
  const pasos = [
    ['logo', 'Subir el logo y elegir los colores (Mi empresa)'],
    ['servicios', 'Revisar categorías y servicios (Catálogo)'],
    ['horarios', 'Definir los horarios de atención (Mi empresa)'],
    ['equipo', 'Crear al menos un especialista con servicios (Equipo)'],
    ['whatsapp', 'Configurar el WhatsApp de confirmación (Mi empresa)'],
    ['primera_cita', 'Recibir la primera cita (comparte el enlace en Mi empresa)']
  ];
  const pendientes = pasos.filter(([clave]) => !metricas.checklist[clave]);
  const avisoSinAsignar = metricas.sin_asignar
    ? html`<div class="aviso">Hay ${metricas.sin_asignar} ${metricas.sin_asignar === 1 ? 'cita próxima' : 'citas próximas'} sin especialista. Filtra por "Sin asignar" para resolverlas.</div>` : '';
  contenedor.innerHTML = avisoSinAsignar + (pendientes.length ? html`
    <section class="checklist">
      <h3>Puesta en marcha</h3>
      <ul>${crudo(pasos.map(([clave, texto]) => html`<li class="${metricas.checklist[clave] ? 'hecho' : ''}">${metricas.checklist[clave] ? '✓' : '○'} ${texto}</li>`).join(''))}</ul>
    </section>` : '');
}
