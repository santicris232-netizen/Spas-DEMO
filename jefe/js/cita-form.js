/*
  CristaSpa - formulario de cita del jefe/recepción: nueva cita y reprogramación.
  Usa la disponibilidad real del servidor; el servidor vuelve a validar al guardar.
*/
import { disponibilidad, reprogramarCita, reservarCita } from '../../compartido/js/repos/citas.js';
import { guardarCliente, listarClientes } from '../../compartido/js/repos/clientes.js';
import { conCarga, crudo, dinero, html, mostrarError, toast, vacio } from '../../compartido/js/ui.js';
import { aInstante, duracionBonita, fechaLocal, horaBonita, hoy } from '../../compartido/js/fechas.js';
import { app, abrirFormulario, cerrarFormulario, especialistasAptos } from './estado.js';

/**
 * Abre el formulario de nueva cita.
 * @param {{cliente?: object|null, fecha?: string|null, alGuardar?: () => void}} [opciones] Valores iniciales.
 */
export function abrirNuevaCita({ cliente = null, fecha = null, alGuardar = () => {} } = {}) {
  const servicios = app.servicios.filter(servicio => servicio.activo);
  const porCategoria = app.categorias.map(categoria => ({
    categoria, servicios: servicios.filter(servicio => servicio.categoria_id === categoria.id)
  })).filter(grupo => grupo.servicios.length);

  const contenedor = abrirFormulario({
    titulo: 'Nueva cita',
    kicker: 'Agenda',
    contenido: html`
      <form class="sheet-body" id="form-cita" novalidate>
        <div class="field-group">
          <label for="cita-cliente-busqueda">Cliente</label>
          <input type="search" id="cita-cliente-busqueda" placeholder="Buscar por nombre, correo o celular…" autocomplete="off">
          <div class="cliente-resultados" id="cita-clientes"></div>
          <button class="link-button" type="button" id="cita-cliente-nuevo">+ Cliente nuevo</button>
          <div class="form-card hidden" id="cita-cliente-form">
            <div class="field-group"><label for="nuevo-nombre">Nombre</label><input id="nuevo-nombre" autocomplete="off"></div>
            <div class="field-group"><label for="nuevo-telefono">Celular</label><input id="nuevo-telefono" type="tel" inputmode="numeric" autocomplete="off"></div>
            <div class="field-group"><label for="nuevo-correo">Correo (opcional)</label><input id="nuevo-correo" type="email" autocomplete="off"></div>
          </div>
        </div>
        <div class="field-group">
          <label>Servicios</label>
          <div class="servicios-seleccion">
            ${crudo(porCategoria.map(grupo => html`
              <p class="dia-separador">${grupo.categoria.nombre}</p>
              ${crudo(grupo.servicios.map(servicio => html`
                <label class="chip-option"><span><input type="checkbox" name="servicios" data-lista value="${servicio.id}"> ${servicio.nombre}</span>
                <small>${duracionBonita(servicio.duracion_min)} · ${dinero(servicio.precio, app.moneda)}</small></label>`).join(''))}`).join('')
              || vacio('No hay servicios activos. Créalos en Catálogo.'))}
          </div>
          <small class="muted-text" id="cita-resumen"></small>
        </div>
        ${crudo(camposHorario())}
        <div class="field-row two">
          <div class="field-group"><label for="cita-estado">Estado</label>
            <select id="cita-estado"><option value="confirmada">Confirmada</option><option value="pendiente">Pendiente</option></select></div>
        </div>
        <div class="field-group"><label for="cita-notas">Notas</label><textarea id="cita-notas" rows="2" maxlength="300"></textarea></div>
        <button class="primary-button" type="submit" id="cita-guardar">Guardar cita</button>
      </form>`
  });

  const formulario = contenedor.querySelector('#form-cita');
  const estado = { clienteId: cliente?.id || null, nuevo: false, slot: null, libres: [] };
  formulario.querySelector('#cita-fecha').value = fecha || hoy(app.zona);

  if (cliente) {
    mostrarClientes([cliente], estado);
  }
  let temporizador = null;
  formulario.querySelector('#cita-cliente-busqueda').addEventListener('input', evento => {
    clearTimeout(temporizador);
    temporizador = setTimeout(async () => {
      const texto = evento.target.value.trim();
      if (texto.length < 2) {
        return;
      }
      try {
        mostrarClientes(await listarClientes(app.empresa.id, texto), estado);
      } catch (error) {
        mostrarError(error);
      }
    }, 300);
  });
  formulario.querySelector('#cita-clientes').addEventListener('click', evento => {
    const opcion = evento.target.closest('[data-cliente]');
    if (opcion) {
      estado.clienteId = opcion.dataset.cliente;
      estado.nuevo = false;
      formulario.querySelector('#cita-cliente-form').classList.add('hidden');
      formulario.querySelectorAll('[data-cliente]').forEach(item => item.classList.toggle('active', item === opcion));
    }
  });
  formulario.querySelector('#cita-cliente-nuevo').addEventListener('click', () => {
    estado.nuevo = true;
    estado.clienteId = null;
    formulario.querySelectorAll('[data-cliente]').forEach(item => item.classList.remove('active'));
    formulario.querySelector('#cita-cliente-form').classList.remove('hidden');
    formulario.querySelector('#nuevo-nombre').focus();
  });

  const servicioIds = () => [...formulario.querySelectorAll('input[name="servicios"]:checked')].map(campo => campo.value);
  const alCambiarServicios = () => {
    const ids = servicioIds();
    const elegidos = app.servicios.filter(servicio => ids.includes(servicio.id));
    formulario.querySelector('#cita-resumen').textContent = elegidos.length
      ? `${duracionBonita(elegidos.reduce((s, x) => s + x.duracion_min, 0))} · ${dinero(elegidos.reduce((s, x) => s + Number(x.precio), 0), app.moneda)}`
      : '';
    llenarEspecialistas(formulario, ids, null);
    cargarHoras(formulario, ids, estado);
  };
  formulario.querySelector('.servicios-seleccion').addEventListener('change', alCambiarServicios);
  conectarHorario(formulario, () => servicioIds(), estado);
  llenarEspecialistas(formulario, [], null);
  cargarHoras(formulario, [], estado);

  formulario.addEventListener('submit', async evento => {
    evento.preventDefault();
    const ids = servicioIds();
    if (!estado.clienteId && !estado.nuevo) {
      toast('Elige un cliente o crea uno nuevo.');
      return;
    }
    if (estado.nuevo && !formulario.querySelector('#nuevo-nombre').value.trim()) {
      toast('Escribe el nombre del cliente nuevo.');
      return;
    }
    if (!ids.length || !estado.slot) {
      toast('Elige al menos un servicio y una hora.');
      return;
    }
    await conCarga(formulario.querySelector('#cita-guardar'), async () => {
      let clienteId = estado.clienteId;
      if (estado.nuevo) {
        const nuevo = await guardarCliente(app.empresa.id, {
          nombre: formulario.querySelector('#nuevo-nombre').value,
          telefono: formulario.querySelector('#nuevo-telefono').value,
          correo: formulario.querySelector('#nuevo-correo').value
        });
        clienteId = nuevo.id;
        estado.nuevo = false;
        estado.clienteId = clienteId;
      }
      try {
        await reservarCita({
          empresaId: app.empresa.id,
          servicios: ids,
          inicio: estado.slot.inicio,
          empleadoId: formulario.querySelector('#cita-especialista').value || estado.slot.empleadoId,
          clienteId,
          notas: formulario.querySelector('#cita-notas').value,
          estado: formulario.querySelector('#cita-estado').value
        });
      } catch (error) {
        if (error.codigo === 'horario_ocupado') {
          cargarHoras(formulario, ids, estado);
        }
        throw error;
      }
      cerrarFormulario();
      toast('Cita guardada.');
      alGuardar();
    });
  });
}

/**
 * Abre el formulario para reprogramar o asignar especialista a una cita.
 * @param {object} cita Cita de citas_detalle.
 * @param {() => void} alGuardar Callback.
 */
export function abrirReprogramar(cita, alGuardar = () => {}) {
  const ids = cita.servicios.map(item => item.servicio_id).filter(Boolean);
  if (ids.length !== cita.servicios.length) {
    toast('Un servicio de esta cita ya no existe. Cancela y crea una nueva.');
    return;
  }
  const contenedor = abrirFormulario({
    titulo: cita.empleado_id ? 'Reprogramar cita' : 'Asignar especialista',
    kicker: `${cita.cliente_nombre} ${cita.cliente_apellido}`.trim(),
    contenido: html`
      <form class="sheet-body" id="form-cita" novalidate>
        <div class="booking-service-summary"><strong>${cita.servicios.map(item => item.nombre).join(' + ')}</strong></div>
        ${crudo(camposHorario())}
        <button class="primary-button" type="submit" id="cita-guardar">Guardar cambios</button>
      </form>`
  });
  const formulario = contenedor.querySelector('#form-cita');
  const estado = { slot: null, libres: [] };
  const fechaCita = fechaLocal(cita.inicio, app.zona);
  formulario.querySelector('#cita-fecha').value = fechaCita < hoy(app.zona) ? hoy(app.zona) : fechaCita;
  llenarEspecialistas(formulario, ids, cita.empleado_id);
  conectarHorario(formulario, () => ids, estado);
  cargarHoras(formulario, ids, estado);

  formulario.addEventListener('submit', async evento => {
    evento.preventDefault();
    if (!estado.slot) {
      toast('Elige una hora.');
      return;
    }
    await conCarga(formulario.querySelector('#cita-guardar'), async () => {
      await reprogramarCita(cita.id, estado.slot.inicio, formulario.querySelector('#cita-especialista').value || estado.slot.empleadoId);
      cerrarFormulario();
      toast('Cita actualizada.');
      alGuardar();
    });
  });
}

/** Campos comunes: especialista, fecha y horas. */
function camposHorario() {
  return html`
    <div class="field-row two">
      <div class="field-group"><label for="cita-especialista">Especialista</label><select id="cita-especialista"></select></div>
      <div class="field-group"><label for="cita-fecha">Fecha</label><input type="date" id="cita-fecha" min="${hoy(app.zona)}" required></div>
    </div>
    <div class="field-group"><label>Hora disponible</label><div class="hours-grid" id="cita-horas"></div></div>`;
}

function conectarHorario(formulario, obtenerIds, estado) {
  formulario.querySelector('#cita-especialista').addEventListener('change', () => cargarHoras(formulario, obtenerIds(), estado));
  formulario.querySelector('#cita-fecha').addEventListener('change', () => cargarHoras(formulario, obtenerIds(), estado));
  formulario.querySelector('#cita-horas').addEventListener('click', evento => {
    const boton = evento.target.closest('[data-inicio]');
    if (boton) {
      estado.slot = { inicio: boton.dataset.inicio, empleadoId: boton.dataset.empleado };
      formulario.querySelectorAll('#cita-horas [data-inicio]').forEach(item => item.classList.toggle('selected', item === boton));
    }
  });
}

function llenarEspecialistas(formulario, ids, seleccionado) {
  const select = formulario.querySelector('#cita-especialista');
  const anterior = seleccionado ?? select.value;
  const aptos = ids.length ? especialistasAptos(ids) : app.empleados.filter(empleado => empleado.activo);
  select.innerHTML = html`<option value="">Cualquiera disponible</option>`
    + aptos.map(empleado => html`<option value="${empleado.id}">${empleado.nombre}</option>`).join('');
  select.value = aptos.some(empleado => empleado.id === anterior) ? anterior : '';
}

async function cargarHoras(formulario, ids, estado) {
  const contenedor = formulario.querySelector('#cita-horas');
  estado.slot = null;
  if (!ids.length) {
    contenedor.innerHTML = vacio('Elige los servicios para ver las horas libres.');
    return;
  }
  if (!especialistasAptos(ids).length) {
    contenedor.innerHTML = vacio('Ningún especialista activo realiza todos estos servicios.');
    return;
  }
  const fecha = formulario.querySelector('#cita-fecha').value;
  const empleado = formulario.querySelector('#cita-especialista').value || null;
  contenedor.innerHTML = '<div class="skeleton"></div>';
  try {
    const libres = await disponibilidad(app.empresa.id, ids, fecha, fecha, empleado);
    const unicos = [...new Map(libres.map(item => [item.inicio, item])).values()];
    contenedor.innerHTML = unicos.length
      ? unicos.map(item => html`<button class="availability-slot" type="button" data-inicio="${item.inicio}" data-empleado="${item.empleado_id}">${horaBonita(item.inicio, app.zona)}</button>`).join('')
      : vacio('No hay horas libres este día.');
  } catch (error) {
    contenedor.innerHTML = vacio(error.message);
  }
}

function mostrarClientes(clientes, estado) {
  const contenedor = document.getElementById('cita-clientes');
  contenedor.innerHTML = clientes.length
    ? clientes.map(cliente => html`
      <button class="cliente-opcion ${cliente.id === estado.clienteId ? 'active' : ''}" type="button" data-cliente="${cliente.id}">
        <strong>${cliente.nombre} ${cliente.apellido}</strong>
        <small>${[cliente.telefono, cliente.correo].filter(Boolean).join(' · ') || 'Sin contacto'}</small>
      </button>`).join('')
    : vacio('Sin resultados. Usa "Cliente nuevo".');
}

/** Instante ISO a partir de fecha y hora local (para formularios de bloqueo). */
export function instanteLocal(fecha, hora) {
  return aInstante(fecha, hora, app.zona);
}
