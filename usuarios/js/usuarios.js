/*
  CristaSpa - módulo del cliente (docs/flujos/11-modulo-usuario.md).
  Inicio, reserva de uno o varios servicios con disponibilidad real, mis citas
  (cancelar, reprogramar, calendario, volver a reservar), productos y perfil.
*/
import { protegerPagina, cambiarClave, cerrarSesion } from '../../compartido/js/auth.js';
import { urlPublica } from '../../compartido/js/supabase.js';
import { listarCategorias, listarProductos, listarServicios } from '../../compartido/js/repos/catalogo.js';
import { listarEspecialistas } from '../../compartido/js/repos/equipo.js';
import { cambiarEstadoCita, disponibilidad, escucharCitas, listarCitas, reprogramarCita, reservarCita } from '../../compartido/js/repos/citas.js';
import { actualizarMiFicha, eliminarMiCuenta, miFicha } from '../../compartido/js/repos/clientes.js';
import { obtenerConfig } from '../../compartido/js/repos/empresa.js';
import {
  activarPestanas, abrirHoja, cerrarHoja, conCarga, crearIcs, crudo, descargar, dinero, esqueletos, html, imagen,
  mostrarError, mostrarVista, prepararHoja, rellenarPlantilla, telefonoWhatsapp, toast, vacio
} from '../../compartido/js/ui.js';
import { diasHasta, duracionBonita, fechaBonita, fechaLocal, formatearDia, horaBonita, hoy, sumarDias } from '../../compartido/js/fechas.js';

const ESTADOS = { pendiente: 'Pendiente', confirmada: 'Confirmada', completada: 'Realizada', cancelada: 'Cancelada', no_asistio: 'No asistió' };

const estado = {
  empresa: null,
  zona: 'America/Bogota',
  moneda: 'COP',
  config: null,
  ficha: null,
  categorias: [],
  servicios: [],
  especialistas: [],
  citas: [],
  seleccion: [],
  categoriaFiltro: null,
  grupoCitas: 'proximas',
  reserva: null
};

document.addEventListener('DOMContentLoaded', iniciar);

async function iniciar() {
  activarPestanas(document.getElementById('navegacion'), vista => {
    document.body.classList.toggle('con-barra', vista === 'vista-reservar' && estado.seleccion.length > 0);
    document.getElementById('seleccion-barra').classList.toggle('hidden', vista !== 'vista-reservar' || !estado.seleccion.length);
  });
  const sesion = await protegerPagina({ roles: ['user'], titulo: 'Mis citas' });
  if (!sesion) {
    return;
  }
  estado.empresa = sesion.empresa;
  estado.zona = sesion.empresa.zona_horaria;
  estado.moneda = sesion.empresa.moneda;

  prepararHoja('hoja-reserva');
  conectarEventos();

  document.getElementById('proxima-cita').innerHTML = esqueletos(1);
  try {
    const [config, ficha, categorias, servicios, especialistas, productos] = await Promise.all([
      obtenerConfig(estado.empresa.id),
      miFicha(estado.empresa.id),
      listarCategorias(estado.empresa.id, { soloActivas: true }),
      listarServicios(estado.empresa.id, { soloActivos: true }),
      listarEspecialistas(estado.empresa.id),
      listarProductos(estado.empresa.id, { soloActivos: true })
    ]);
    Object.assign(estado, { config, ficha, categorias, servicios, especialistas });
    renderizarPerfil();
    renderizarCategorias();
    renderizarServicios();
    renderizarProductos(productos);
    renderizarContacto();
    await cargarCitas();
  } catch (error) {
    mostrarError(error);
  }

  escucharCitas(estado.empresa.id, () => cargarCitas().catch(mostrarError));
}

function conectarEventos() {
  document.getElementById('seleccion-continuar').addEventListener('click', () => abrirReserva({ modo: 'nueva' }));
  document.getElementById('reserva-especialista').addEventListener('change', evento => {
    estado.reserva.empleadoId = evento.target.value || null;
    cargarDisponibilidad();
  });
  document.getElementById('reserva-dias').addEventListener('click', evento => {
    const boton = evento.target.closest('[data-dia]');
    if (boton && !boton.disabled) {
      estado.reserva.dia = boton.dataset.dia;
      estado.reserva.slot = null;
      renderizarDiasYHoras();
    }
  });
  document.getElementById('reserva-horas').addEventListener('click', evento => {
    const boton = evento.target.closest('[data-inicio]');
    if (boton) {
      estado.reserva.slot = { inicio: boton.dataset.inicio, empleadoId: boton.dataset.empleado };
      renderizarDiasYHoras();
    }
  });
  document.getElementById('form-reserva').addEventListener('submit', confirmarReserva);
  document.getElementById('pestanas-citas').addEventListener('click', evento => {
    const boton = evento.target.closest('[data-grupo]');
    if (boton) {
      estado.grupoCitas = boton.dataset.grupo;
      document.querySelectorAll('#pestanas-citas [data-grupo]').forEach(item => item.classList.toggle('active', item === boton));
      renderizarCitas();
    }
  });
  document.getElementById('lista-citas').addEventListener('click', alAccionCita);
  document.getElementById('proxima-cita').addEventListener('click', alAccionCita);
  document.getElementById('form-perfil').addEventListener('submit', guardarPerfil);
  document.getElementById('form-clave').addEventListener('submit', guardarClave);
  document.getElementById('cerrar-sesion').addEventListener('click', cerrarSesion);
  document.getElementById('eliminar-cuenta').addEventListener('click', eliminarCuenta);
}

// ---------------------------------------------------------------------------
// Catálogo y selección de servicios
// ---------------------------------------------------------------------------

function renderizarCategorias() {
  const chips = estado.categorias.map(categoria => html`
    <button class="chip-option" type="button" data-categoria="${categoria.id}" style="--categoria: ${categoria.color}">${categoria.nombre}</button>`);
  document.getElementById('inicio-categorias').innerHTML = chips.join('') || vacio('Aún no hay servicios publicados.');
  const filtro = document.getElementById('filtro-categorias');
  filtro.innerHTML = html`<button class="chip-option active" type="button" data-categoria="">Todos</button>` + chips.join('');

  const alElegir = evento => {
    const boton = evento.target.closest('[data-categoria]');
    if (!boton) {
      return;
    }
    estado.categoriaFiltro = boton.dataset.categoria || null;
    filtro.querySelectorAll('[data-categoria]').forEach(item => item.classList.toggle('active', (item.dataset.categoria || null) === estado.categoriaFiltro));
    renderizarServicios();
    mostrarVista(document.getElementById('navegacion'), 'vista-reservar');
  };
  document.getElementById('inicio-categorias').addEventListener('click', alElegir);
  filtro.addEventListener('click', alElegir);
}

function renderizarServicios() {
  const lista = document.getElementById('lista-servicios');
  const servicios = estado.servicios.filter(servicio => servicio.categoria?.activo !== false
    && (!estado.categoriaFiltro || servicio.categoria_id === estado.categoriaFiltro));
  if (!servicios.length) {
    lista.innerHTML = vacio('No hay servicios disponibles en esta categoría.');
    return;
  }
  lista.innerHTML = servicios.map(servicio => {
    const elegido = estado.seleccion.includes(servicio.id);
    return html`
      <article class="card service-card ${elegido ? 'seleccionado' : ''}">
        ${crudo(imagen(urlPublica(servicio.imagen_path), servicio.nombre))}
        <div class="card-body">
          <div class="card-meta"><span class="meta-chip">${servicio.categoria?.nombre || 'Servicio'}</span><span class="meta-chip">${duracionBonita(servicio.duracion_min)}</span></div>
          <h3 class="card-title">${servicio.nombre}</h3>
          <p class="card-text">${servicio.descripcion}</p>
          <div class="service-meta">
            <p class="service-price">${dinero(servicio.precio, estado.moneda)}</p>
          </div>
          <button class="${elegido ? 'secondary-button' : 'primary-button'}" type="button" data-servicio="${servicio.id}" aria-pressed="${elegido}">
            ${elegido ? 'Quitar' : 'Agregar'}
          </button>
        </div>
      </article>`;
  }).join('');
  lista.querySelectorAll('[data-servicio]').forEach(boton => boton.addEventListener('click', () => alternarServicio(boton.dataset.servicio)));
}

function alternarServicio(servicioId) {
  estado.seleccion = estado.seleccion.includes(servicioId)
    ? estado.seleccion.filter(id => id !== servicioId)
    : [...estado.seleccion, servicioId];
  renderizarServicios();
  actualizarBarra();
}

function actualizarBarra() {
  const elegidos = serviciosPorId(estado.seleccion);
  const barra = document.getElementById('seleccion-barra');
  barra.classList.toggle('hidden', !elegidos.length);
  document.body.classList.toggle('con-barra', elegidos.length > 0);
  if (!elegidos.length) {
    return;
  }
  const minutos = elegidos.reduce((suma, servicio) => suma + servicio.duracion_min, 0);
  const total = elegidos.reduce((suma, servicio) => suma + Number(servicio.precio), 0);
  document.getElementById('seleccion-resumen').textContent = `${elegidos.length} ${elegidos.length === 1 ? 'servicio' : 'servicios'} · ${dinero(total, estado.moneda)}`;
  document.getElementById('seleccion-detalle').textContent = duracionBonita(minutos);
}

function serviciosPorId(ids) {
  return ids.map(id => estado.servicios.find(servicio => servicio.id === id)).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Hoja de reserva
// ---------------------------------------------------------------------------

/**
 * Abre la hoja para una cita nueva o para reprogramar.
 * @param {{modo: 'nueva'|'reprogramar', cita?: object}} opciones Modo.
 */
function abrirReserva({ modo, cita = null }) {
  const servicios = modo === 'reprogramar' ? cita.servicios.map(item => item.servicio_id).filter(Boolean) : [...estado.seleccion];
  if (!servicios.length) {
    toast(modo === 'reprogramar' ? 'Esta cita tiene servicios que ya no existen; reserva una nueva.' : 'Elige al menos un servicio.');
    return;
  }
  estado.reserva = {
    modo,
    citaId: cita?.id || null,
    servicios,
    empleadoId: modo === 'reprogramar' ? cita.empleado_id : null,
    dia: null,
    slot: null,
    libres: []
  };

  const elegidos = serviciosPorId(servicios);
  const nombres = elegidos.length ? elegidos.map(servicio => servicio.nombre) : cita.servicios.map(item => item.nombre);
  const minutos = elegidos.reduce((suma, servicio) => suma + servicio.duracion_min, 0);
  document.getElementById('reserva-kicker').textContent = modo === 'reprogramar' ? 'Reprogramar' : 'Nueva cita';
  document.getElementById('reserva-titulo').textContent = modo === 'reprogramar' ? 'Elige el nuevo horario' : 'Elige tu horario';
  document.getElementById('reserva-resumen').innerHTML = html`
    <strong>${nombres.join(' + ')}</strong>
    <span>${minutos ? duracionBonita(minutos) : ''}${modo === 'nueva' ? ` · ${dinero(elegidos.reduce((s, x) => s + Number(x.precio), 0), estado.moneda)}` : ''}</span>`;
  document.getElementById('reserva-notas-campo').classList.toggle('hidden', modo === 'reprogramar');
  document.getElementById('reserva-notas').value = '';

  const aptos = estado.especialistas.filter(especialista => servicios.every(id => especialista.servicio_ids.includes(id)));
  const select = document.getElementById('reserva-especialista');
  select.innerHTML = html`<option value="">Cualquiera disponible</option>`
    + aptos.map(especialista => html`<option value="${especialista.id}">${especialista.nombre} · ${especialista.cargo}</option>`).join('');
  select.value = estado.reserva.empleadoId && aptos.some(item => item.id === estado.reserva.empleadoId) ? estado.reserva.empleadoId : '';
  estado.reserva.empleadoId = select.value || null;

  document.getElementById('form-reserva').classList.remove('hidden');
  abrirHoja('hoja-reserva');
  if (!aptos.length) {
    document.getElementById('reserva-dias').innerHTML = '';
    document.getElementById('reserva-horas').innerHTML = vacio('Ningún especialista realiza todos estos servicios juntos. Resérvalos por separado.');
    return;
  }
  cargarDisponibilidad();
}

async function cargarDisponibilidad() {
  const reserva = estado.reserva;
  const desde = hoy(estado.zona);
  const hasta = sumarDias(desde, Math.min(estado.config.dias_reserva_max, 45));
  document.getElementById('reserva-dias').innerHTML = esqueletos(1);
  document.getElementById('reserva-horas').innerHTML = '';
  try {
    reserva.libres = await disponibilidad(estado.empresa.id, reserva.servicios, desde, hasta, reserva.empleadoId);
  } catch (error) {
    mostrarError(error);
    reserva.libres = [];
  }
  if (estado.reserva !== reserva) {
    return;
  }
  const dias = [...new Set(reserva.libres.map(item => fechaLocal(item.inicio, estado.zona)))];
  reserva.dia = dias.includes(reserva.dia) ? reserva.dia : dias[0] || null;
  reserva.slot = null;
  renderizarDiasYHoras();
}

function renderizarDiasYHoras() {
  const reserva = estado.reserva;
  const desde = hoy(estado.zona);
  const totalDias = Math.min(estado.config.dias_reserva_max, 45);
  const conHorario = new Set(reserva.libres.map(item => fechaLocal(item.inicio, estado.zona)));

  document.getElementById('reserva-dias').innerHTML = Array.from({ length: totalDias + 1 }, (_, indice) => sumarDias(desde, indice))
    .map(dia => html`
      <button class="day-pill ${dia === reserva.dia ? 'active' : ''}" type="button" data-dia="${dia}" ${conHorario.has(dia) ? '' : crudo('disabled')}
        aria-label="${formatearDia(dia, { weekday: 'long', day: 'numeric', month: 'long' })}">
        <span class="day-pill-weekday">${formatearDia(dia, { weekday: 'short' }).replace('.', '')}</span>
        <span class="day-pill-number">${Number(dia.slice(8))}</span>
        <span class="day-pill-month">${formatearDia(dia, { month: 'short' }).replace('.', '')}</span>
      </button>`).join('');

  const horas = document.getElementById('reserva-horas');
  if (!reserva.dia) {
    horas.innerHTML = vacio('No hay horarios disponibles en las próximas semanas. Prueba con otro especialista.');
  } else {
    const delDia = reserva.libres.filter(item => fechaLocal(item.inicio, estado.zona) === reserva.dia);
    const unicos = [...new Map(delDia.map(item => [item.inicio, item])).values()];
    horas.innerHTML = unicos.map(item => {
      const elegido = reserva.slot?.inicio === item.inicio;
      return html`<button class="availability-slot ${elegido ? 'selected' : ''}" type="button" data-inicio="${item.inicio}" data-empleado="${item.empleado_id}">${horaBonita(item.inicio, estado.zona)}</button>`;
    }).join('');
  }
  document.getElementById('reserva-confirmar').disabled = !reserva.slot;
  document.querySelector('#reserva-dias .active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

async function confirmarReserva(evento) {
  evento.preventDefault();
  const reserva = estado.reserva;
  if (!reserva?.slot) {
    return;
  }
  const empleadoId = reserva.empleadoId || reserva.slot.empleadoId;
  await conCarga(document.getElementById('reserva-confirmar'), async () => {
    try {
      if (reserva.modo === 'reprogramar') {
        await reprogramarCita(reserva.citaId, reserva.slot.inicio, empleadoId);
        cerrarHoja('hoja-reserva');
        toast('Cita reprogramada. El negocio la confirmará.');
      } else {
        await reservarCita({
          empresaId: estado.empresa.id, servicios: reserva.servicios, inicio: reserva.slot.inicio,
          empleadoId, notas: document.getElementById('reserva-notas').value.trim()
        });
        estado.seleccion = [];
        renderizarServicios();
        actualizarBarra();
        mostrarExito(empleadoId);
      }
      await cargarCitas();
    } catch (error) {
      if (error.codigo === 'horario_ocupado') {
        await cargarDisponibilidad();
      }
      throw error;
    }
  });
}

/** Confirmación dentro de la hoja con el aviso opcional por WhatsApp. */
function mostrarExito(empleadoId) {
  const reserva = estado.reserva;
  const especialista = estado.especialistas.find(item => item.id === empleadoId);
  const servicios = serviciosPorId(reserva.servicios).map(servicio => servicio.nombre).join(', ');
  const numero = telefonoWhatsapp(estado.config.whatsapp);
  const mensaje = rellenarPlantilla(estado.config.mensaje_whatsapp, {
    empresa: estado.empresa.nombre,
    cliente: `${estado.ficha?.nombre || ''} ${estado.ficha?.apellido || ''}`.trim(),
    servicio: servicios,
    especialista: especialista?.nombre || 'Por asignar',
    fecha: fechaBonita(reserva.slot.inicio, estado.zona, { weekday: 'long', day: 'numeric', month: 'long' }),
    hora: horaBonita(reserva.slot.inicio, estado.zona)
  });
  document.getElementById('reserva-titulo').textContent = '¡Cita reservada!';
  document.getElementById('reserva-kicker').textContent = 'Listo';
  document.getElementById('form-reserva').classList.add('hidden');
  const panel = document.querySelector('#hoja-reserva .sheet-panel');
  panel.querySelector('.reserva-exito')?.remove();
  panel.insertAdjacentHTML('beforeend', html`
    <div class="sheet-body reserva-exito">
      <p>Tu cita quedó <strong>pendiente de confirmación</strong> para el ${fechaBonita(reserva.slot.inicio, estado.zona, { weekday: 'long', day: 'numeric', month: 'long' })} a las ${horaBonita(reserva.slot.inicio, estado.zona)}.</p>
      ${numero ? crudo(html`<a class="primary-button" href="https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}" target="_blank" rel="noopener">Avisar por WhatsApp</a>`) : ''}
      <button class="secondary-button" type="button" id="exito-ver-citas">Ver mis citas</button>
    </div>`);
  panel.querySelector('#exito-ver-citas').addEventListener('click', () => {
    cerrarHoja('hoja-reserva');
    panel.querySelector('.reserva-exito')?.remove();
    mostrarVista(document.getElementById('navegacion'), 'vista-citas');
    document.getElementById('seleccion-barra').classList.add('hidden');
  });
}

// ---------------------------------------------------------------------------
// Mis citas
// ---------------------------------------------------------------------------

async function cargarCitas() {
  estado.citas = await listarCitas(estado.empresa.id, { orden: 'asc' });
  renderizarCitas();
  renderizarProxima();
}

function renderizarProxima() {
  const ahora = Date.now();
  const proxima = estado.citas.find(cita => ['pendiente', 'confirmada'].includes(cita.estado) && new Date(cita.fin) > ahora);
  document.getElementById('proxima-cita').innerHTML = proxima
    ? tarjetaCita(proxima, { destacada: true })
    : html`<div class="empty-state">No tienes citas próximas. <button class="link-button" type="button" id="ir-reservar">Reserva ahora</button></div>`;
  document.getElementById('ir-reservar')?.addEventListener('click', () => mostrarVista(document.getElementById('navegacion'), 'vista-reservar'));
}

function renderizarCitas() {
  const ahora = Date.now();
  const proximas = estado.grupoCitas === 'proximas';
  const citas = estado.citas.filter(cita => {
    const activa = ['pendiente', 'confirmada'].includes(cita.estado) && new Date(cita.fin) > ahora;
    return proximas ? activa : !activa;
  });
  if (!proximas) {
    citas.reverse();
  }
  document.getElementById('lista-citas').innerHTML = citas.length
    ? citas.map(cita => tarjetaCita(cita)).join('')
    : vacio(proximas ? 'No tienes citas próximas.' : 'Aún no tienes historial.');
}

/**
 * Tarjeta de una cita con sus acciones.
 * @param {object} cita Cita de citas_detalle.
 * @param {{destacada?: boolean}} [opciones] Estilo.
 * @returns {string} HTML.
 */
function tarjetaCita(cita, { destacada = false } = {}) {
  const dias = diasHasta(cita.inicio, estado.zona);
  const activa = ['pendiente', 'confirmada'].includes(cita.estado) && new Date(cita.fin) > Date.now();
  const horasFaltan = (new Date(cita.inicio) - Date.now()) / 3600000;
  const dentroDePlazo = horasFaltan >= estado.config.horas_limite_cancelacion;
  const puedeCancelar = activa && estado.config.usuario_puede_cancelar && dentroDePlazo;
  const puedeReprogramar = activa && estado.config.usuario_puede_reprogramar && dentroDePlazo;
  const categoria = estado.servicios.find(servicio => servicio.id === cita.servicios[0]?.servicio_id)?.categoria?.color;

  return html`
    <article class="card user-appointment-card agenda-card ${destacada ? 'destacada' : ''}" style="--categoria: ${categoria || 'var(--brand-primary)'}">
      <div class="user-appointment-top">
        <div>
          <h3 class="user-appointment-title">${cita.servicios.map(item => item.nombre).join(' + ')}</h3>
          <p class="card-text">${fechaBonita(cita.inicio, estado.zona, { weekday: 'long', day: 'numeric', month: 'long' })} · ${horaBonita(cita.inicio, estado.zona)}</p>
        </div>
        ${activa ? crudo(html`
          <div class="countdown-box">
            <span class="countdown-number">${dias <= 0 ? 'Hoy' : dias}</span>
            <span class="countdown-label">${dias <= 0 ? '' : dias === 1 ? 'día' : 'días'}</span>
          </div>`) : ''}
      </div>
      <div class="card-meta">
        <span class="meta-chip">${cita.empleado_nombre || 'Especialista por asignar'}</span>
        ${cita.total !== null ? crudo(html`<span class="meta-chip">${dinero(cita.total, estado.moneda)}</span>`) : ''}
        <span class="status-pill status-${cita.estado}">${ESTADOS[cita.estado]}</span>
      </div>
      ${cita.estado === 'cancelada' && cita.motivo_cancelacion ? crudo(html`<p class="muted-text">Motivo: ${cita.motivo_cancelacion}</p>`) : ''}
      <div class="cita-acciones">
        ${activa ? crudo(html`<button class="secondary-button" type="button" data-accion="ics" data-id="${cita.id}">Agregar al calendario</button>`) : ''}
        ${puedeReprogramar ? crudo(html`<button class="secondary-button" type="button" data-accion="reprogramar" data-id="${cita.id}">Reprogramar</button>`) : ''}
        ${puedeCancelar ? crudo(html`<button class="danger-button" type="button" data-accion="cancelar" data-id="${cita.id}">Cancelar</button>`) : ''}
        ${!activa ? crudo(html`<button class="secondary-button" type="button" data-accion="repetir" data-id="${cita.id}">Volver a reservar</button>`) : ''}
      </div>
      ${activa && !dentroDePlazo && (estado.config.usuario_puede_cancelar || estado.config.usuario_puede_reprogramar)
        ? crudo(html`<p class="muted-text">Para cambios con menos de ${estado.config.horas_limite_cancelacion} h de anticipación, comunícate con el negocio.</p>`) : ''}
    </article>`;
}

async function alAccionCita(evento) {
  const boton = evento.target.closest('[data-accion]');
  if (!boton) {
    return;
  }
  const cita = estado.citas.find(item => item.id === boton.dataset.id);
  if (!cita) {
    return;
  }
  switch (boton.dataset.accion) {
    case 'cancelar': {
      if (!window.confirm('¿Seguro que quieres cancelar esta cita?')) {
        return;
      }
      const motivo = window.prompt('¿Quieres contarnos el motivo? (opcional)') || null;
      await conCarga(boton, async () => {
        await cambiarEstadoCita(cita.id, 'cancelada', motivo);
        toast('Cita cancelada.');
        await cargarCitas();
      });
      break;
    }
    case 'reprogramar':
      abrirReserva({ modo: 'reprogramar', cita });
      break;
    case 'repetir': {
      const disponibles = cita.servicios.map(item => item.servicio_id).filter(id => estado.servicios.some(servicio => servicio.id === id));
      if (!disponibles.length) {
        toast('Esos servicios ya no están disponibles.');
        return;
      }
      estado.seleccion = disponibles;
      renderizarServicios();
      mostrarVista(document.getElementById('navegacion'), 'vista-reservar');
      actualizarBarra();
      break;
    }
    case 'ics':
      descargar(`cita-${fechaLocal(cita.inicio, estado.zona)}.ics`, crearIcs({
        id: cita.id,
        inicio: cita.inicio,
        fin: cita.fin,
        titulo: `${cita.servicios.map(item => item.nombre).join(' + ')} · ${estado.empresa.nombre}`,
        descripcion: `Especialista: ${cita.empleado_nombre || 'por asignar'}`,
        lugar: estado.empresa.nombre
      }));
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Productos, contacto y perfil
// ---------------------------------------------------------------------------

function renderizarProductos(productos) {
  document.getElementById('lista-productos').innerHTML = productos.length
    ? productos.map(producto => html`
      <article class="card">
        ${crudo(imagen(urlPublica(producto.imagen_path), producto.nombre))}
        <div class="card-body">
          ${producto.categoria ? crudo(html`<div class="card-meta"><span class="meta-chip">${producto.categoria.nombre}</span></div>`) : ''}
          <h3 class="card-title">${producto.nombre}</h3>
          <p class="card-text">${producto.descripcion}</p>
          <p class="product-price">${dinero(producto.precio, estado.moneda)}</p>
        </div>
      </article>`).join('')
    : vacio('No hay productos publicados.');
}

function renderizarContacto() {
  const config = estado.config;
  const numero = telefonoWhatsapp(config.whatsapp);
  const redes = [
    numero ? ['WhatsApp', `https://wa.me/${numero}`] : null,
    config.instagram_activo && config.instagram ? ['Instagram', urlRed(config.instagram, 'instagram.com')] : null,
    config.facebook_activo && config.facebook ? ['Facebook', urlRed(config.facebook, 'facebook.com')] : null,
    config.tiktok_activo && config.tiktok ? ['TikTok', urlRed(config.tiktok, 'tiktok.com/@')] : null
  ].filter(Boolean);
  document.getElementById('contacto-empresa').innerHTML = redes.length
    ? html`<h3 class="subsection-title">Contáctanos</h3>` + redes.map(([nombre, url]) => html`<a class="secondary-button" href="${url}" target="_blank" rel="noopener">${nombre}</a>`).join('')
    : '';
}

/** Convierte un usuario o URL de red social en URL completa. */
function urlRed(valor, dominio) {
  const texto = valor.trim();
  if (/^https?:\/\//i.test(texto)) {
    return texto;
  }
  const usuario = texto.replace(/^@/, '');
  return dominio.endsWith('@') ? `https://www.${dominio}${usuario}` : `https://www.${dominio}/${usuario}`;
}

function renderizarPerfil() {
  const ficha = estado.ficha || {};
  document.getElementById('saludo').textContent = `Hola, ${ficha.nombre || ''}`.trim();
  document.getElementById('cliente-nombre').textContent = ficha.nombre || 'Cliente';
  document.getElementById('perfil-nombre').value = ficha.nombre || '';
  document.getElementById('perfil-apellido').value = ficha.apellido || '';
  document.getElementById('perfil-telefono').value = ficha.telefono || '';
  document.getElementById('perfil-correo').value = ficha.correo || '';
  document.getElementById('perfil-nacimiento').value = ficha.fecha_nacimiento || '';
}

async function guardarPerfil(evento) {
  evento.preventDefault();
  const datos = {
    nombre: document.getElementById('perfil-nombre').value.trim(),
    apellido: document.getElementById('perfil-apellido').value.trim(),
    telefono: document.getElementById('perfil-telefono').value.trim(),
    fecha_nacimiento: document.getElementById('perfil-nacimiento').value || null
  };
  if (!datos.nombre) {
    toast('El nombre es obligatorio.');
    return;
  }
  await conCarga(evento.submitter, async () => {
    await actualizarMiFicha(estado.empresa.id, datos);
    estado.ficha = { ...estado.ficha, ...datos };
    renderizarPerfil();
    toast('Datos actualizados.');
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

async function eliminarCuenta(evento) {
  const confirmacion = window.prompt(`Esto borrará tus datos de ${estado.empresa.nombre} y cancelará tus citas futuras. Escribe ELIMINAR para confirmar.`);
  if (confirmacion !== 'ELIMINAR') {
    return;
  }
  await conCarga(evento.currentTarget, async () => {
    await eliminarMiCuenta(estado.empresa.id);
    toast('Tu cuenta en esta empresa fue eliminada.');
    setTimeout(cerrarSesion, 1200);
  });
}
