/* CristaSpa - clientes del jefe/recepción: búsqueda, ficha, historial, agendar y exportar. */
import { listarCitas } from '../../compartido/js/repos/citas.js';
import { guardarCliente, listarClientes } from '../../compartido/js/repos/clientes.js';
import { conCarga, crudo, descargarCsv, esqueletos, html, mostrarError, toast, vacio } from '../../compartido/js/ui.js';
import { fechaBonita, horaBonita, hoy } from '../../compartido/js/fechas.js';
import { app, abrirFormulario, cerrarFormulario, ESTADOS_CITA, leerFormulario, validarFormulario } from './estado.js';
import { abrirNuevaCita } from './cita-form.js';
import { recargar as recargarAgenda } from './agenda.js';

let clientes = [];
let temporizador = null;

export async function iniciarClientes() {
  document.getElementById('clientes-busqueda').addEventListener('input', evento => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => cargar(evento.target.value).catch(mostrarError), 300);
  });
  document.getElementById('nuevo-cliente').addEventListener('click', () => abrirFicha(null));
  document.getElementById('exportar-clientes').addEventListener('click', exportar);
  document.getElementById('clientes-lista').addEventListener('click', evento => {
    const tarjeta = evento.target.closest('[data-cliente]');
    if (tarjeta) {
      abrirFicha(clientes.find(cliente => cliente.id === tarjeta.dataset.cliente));
    }
  });
  await cargar('');
}

async function cargar(busqueda) {
  const lista = document.getElementById('clientes-lista');
  lista.innerHTML = esqueletos(3);
  clientes = await listarClientes(app.empresa.id, busqueda);
  const mesActual = hoy(app.zona).slice(5, 7);
  lista.innerHTML = clientes.length
    ? clientes.map(cliente => html`
      <button class="card management-card cliente-tarjeta" type="button" data-cliente="${cliente.id}">
        <div class="management-top">
          <div>
            <h3 class="management-title">${cliente.nombre} ${cliente.apellido}</h3>
            <p class="management-subtitle">${[cliente.telefono, cliente.correo].filter(Boolean).join(' · ') || 'Sin contacto'}</p>
          </div>
          ${cliente.usuario_id ? crudo('<span class="meta-chip">Con cuenta</span>') : ''}
        </div>
        ${cliente.fecha_nacimiento?.slice(5, 7) === mesActual ? crudo('<div class="card-meta"><span class="meta-chip">🎂 Cumple este mes</span></div>') : ''}
      </button>`).join('')
    : vacio(busqueda ? 'Sin resultados.' : 'Aún no hay clientes.');
}

async function abrirFicha(cliente) {
  const contenedor = abrirFormulario({
    titulo: cliente ? `${cliente.nombre} ${cliente.apellido}`.trim() : 'Nuevo cliente',
    kicker: 'Cliente',
    contenido: html`
      <form class="sheet-body" id="form-cliente" novalidate>
        <div class="field-row two">
          <div class="field-group"><label for="cliente-nombre">Nombre</label><input id="cliente-nombre" name="nombre" required value="${cliente?.nombre || ''}"></div>
          <div class="field-group"><label for="cliente-apellido">Apellido</label><input id="cliente-apellido" name="apellido" value="${cliente?.apellido || ''}"></div>
        </div>
        <div class="field-group"><label for="cliente-telefono">Celular</label><input id="cliente-telefono" name="telefono" type="tel" inputmode="numeric" value="${cliente?.telefono || ''}"></div>
        <div class="field-group"><label for="cliente-correo">Correo</label><input id="cliente-correo" name="correo" type="email" value="${cliente?.correo || ''}" ${cliente?.usuario_id ? crudo('disabled') : ''}></div>
        <div class="field-group"><label for="cliente-nacimiento">Fecha de nacimiento</label><input id="cliente-nacimiento" name="fecha_nacimiento" type="date" value="${cliente?.fecha_nacimiento || ''}"></div>
        <div class="field-group"><label for="cliente-notas">Notas internas (solo las ve el equipo administrativo)</label><textarea id="cliente-notas" name="notas_internas" rows="3">${cliente?.notas_internas || ''}</textarea></div>
        <button class="primary-button" type="submit" data-escritura>Guardar</button>
        ${cliente ? crudo(html`<button class="secondary-button" type="button" id="cliente-agendar" data-escritura>Agendar cita</button>`) : ''}
        ${cliente ? crudo('<h3 class="form-title">Historial</h3><div class="stack-list" id="cliente-historial"></div>') : ''}
      </form>`
  });
  const formulario = contenedor.querySelector('#form-cliente');
  formulario.addEventListener('submit', async evento => {
    evento.preventDefault();
    const error = validarFormulario(formulario);
    if (error) {
      toast(error);
      return;
    }
    const datos = leerFormulario(formulario);
    if (cliente?.usuario_id) {
      datos.correo = cliente.correo;
    }
    await conCarga(evento.submitter, async () => {
      await guardarCliente(app.empresa.id, { ...datos, id: cliente?.id });
      cerrarFormulario();
      toast('Cliente guardado.');
      await cargar(document.getElementById('clientes-busqueda').value);
    });
  });
  if (!cliente) {
    return;
  }
  contenedor.querySelector('#cliente-agendar').addEventListener('click', () => abrirNuevaCita({ cliente, alGuardar: recargarAgenda }));
  const historial = contenedor.querySelector('#cliente-historial');
  historial.innerHTML = esqueletos(1);
  try {
    const citas = await listarCitas(app.empresa.id, { clienteId: cliente.id, orden: 'desc', limite: 20 });
    historial.innerHTML = citas.length
      ? citas.map(cita => html`
        <div class="card card-body">
          <strong>${fechaBonita(cita.inicio, app.zona)} · ${horaBonita(cita.inicio, app.zona)}</strong>
          <p class="card-text">${cita.servicios.map(item => item.nombre).join(' + ')} · ${cita.empleado_nombre || 'Sin especialista'}</p>
          <div class="card-meta"><span class="status-pill status-${cita.estado}">${ESTADOS_CITA[cita.estado]}</span></div>
        </div>`).join('')
      : vacio('Sin citas registradas.');
  } catch (error) {
    historial.innerHTML = vacio(error.message);
  }
}

async function exportar(evento) {
  await conCarga(evento.currentTarget, async () => {
    const todos = await listarClientes(app.empresa.id, '', 10000);
    descargarCsv(`${app.empresa.slug}-clientes-${hoy(app.zona)}.csv`, [
      ['Nombre', 'Apellido', 'Celular', 'Correo', 'Fecha de nacimiento', 'Tiene cuenta', 'Creado'],
      ...todos.map(cliente => [cliente.nombre, cliente.apellido, cliente.telefono, cliente.correo, cliente.fecha_nacimiento,
        cliente.usuario_id ? 'Sí' : 'No', cliente.created_at?.slice(0, 10)])
    ]);
  });
}
