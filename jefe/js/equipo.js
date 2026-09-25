/*
  CristaSpa - equipo del jefe: especialistas (servicios, foto, horario propio, invitación,
  desactivar con reasignación), jefes y recepción (invitar, acceso) y cierres de agenda.
*/
import {
  cambiarAccesoMiembro, crearBloqueo, desactivarEmpleado, eliminarBloqueo, guardarEmpleado, guardarHorarios,
  invitarUsuario, listarBloqueos, listarHorarios, listarMiembros, reactivarEmpleado
} from '../../compartido/js/repos/equipo.js';
import { urlPublica } from '../../compartido/js/supabase.js';
import { comprimirImagen, conCarga, crudo, esqueletos, html, mostrarError, toast, vacio } from '../../compartido/js/ui.js';
import { fechaBonita, horaBonita, hoy } from '../../compartido/js/fechas.js';
import { app, abrirFormulario, cerrarFormulario, leerFormulario, recargarCatalogos, validarFormulario } from './estado.js';
import { conectarEditorHorario, editorHorario, leerEditorHorario } from './horario-editor.js';
import { instanteLocal } from './cita-form.js';
import { recargar as recargarAgenda } from './agenda.js';

const TEXTO_NUEVO = { especialistas: '+ Nuevo especialista', miembros: '+ Invitar jefe o recepción', cierres: '+ Nuevo cierre o ausencia' };
let sub = 'especialistas';
let miembros = [];
let bloqueos = [];

export async function iniciarEquipo() {
  document.getElementById('equipo-pestanas').addEventListener('click', evento => {
    const boton = evento.target.closest('[data-sub]');
    if (!boton) {
      return;
    }
    sub = boton.dataset.sub;
    document.querySelectorAll('#equipo-pestanas [data-sub]').forEach(item => item.classList.toggle('active', item === boton));
    document.getElementById('equipo-nuevo').textContent = TEXTO_NUEVO[sub];
    renderizar().catch(mostrarError);
  });
  document.getElementById('equipo-nuevo').addEventListener('click', () => {
    ({ especialistas: () => formularioEspecialista(null), miembros: formularioMiembro, cierres: formularioCierre })[sub]();
  });
  document.getElementById('equipo-lista').addEventListener('click', alAccion);
  document.addEventListener('catalogos-actualizados', () => {
    if (sub === 'especialistas') {
      renderizar().catch(mostrarError);
    }
  });
  await renderizar();
}

async function renderizar() {
  const lista = document.getElementById('equipo-lista');
  if (sub === 'especialistas') {
    lista.innerHTML = app.empleados.length ? app.empleados.map(empleado => html`
      <article class="card management-card agenda-card ${empleado.activo ? '' : 'inactivo'}" style="--categoria: ${empleado.color_agenda}">
        <div class="fila-miniatura">
          ${empleado.foto_path ? crudo(html`<img class="miniatura" src="${urlPublica(empleado.foto_path)}" alt="" loading="lazy">`) : ''}
          <div>
            <h3 class="management-title">${empleado.nombre}</h3>
            <p class="management-subtitle">${empleado.cargo} · ${empleado.correo}</p>
          </div>
        </div>
        <div class="card-meta">
          <span class="meta-chip">${empleado.servicio_ids.length} servicios</span>
          <span class="meta-chip">${!empleado.activo ? 'Inactivo' : empleado.usuario_id ? 'Con acceso' : 'Sin cuenta'}</span>
        </div>
        <div class="management-actions" data-escritura>
          <button class="secondary-button" type="button" data-accion="editar" data-id="${empleado.id}">Editar</button>
          <button class="secondary-button" type="button" data-accion="horario" data-id="${empleado.id}">Horario propio</button>
          ${empleado.activo && !empleado.usuario_id ? crudo(html`<button class="secondary-button" type="button" data-accion="invitar" data-id="${empleado.id}">Enviar invitación</button>`) : ''}
          ${empleado.activo
            ? crudo(html`<button class="danger-button" type="button" data-accion="desactivar" data-id="${empleado.id}">Desactivar</button>`)
            : crudo(html`<button class="secondary-button" type="button" data-accion="reactivar" data-id="${empleado.id}">Reactivar</button>`)}
        </div>
      </article>`).join('') : vacio('Aún no hay especialistas.');
    return;
  }

  lista.innerHTML = esqueletos(2);
  if (sub === 'miembros') {
    miembros = await listarMiembros(app.empresa.id);
    lista.innerHTML = miembros.length ? miembros.map(miembro => html`
      <article class="card management-card ${miembro.activo ? '' : 'inactivo'}">
        <h3 class="management-title">${miembro.perfil?.nombre || ''} ${miembro.perfil?.apellido || ''}</h3>
        <div class="card-meta">
          <span class="meta-chip">${miembro.rol === 'boss' ? 'Jefe' : 'Recepción'}</span>
          <span class="meta-chip">${miembro.activo ? 'Acceso activo' : 'Sin acceso'}</span>
        </div>
        <div class="management-actions" data-escritura>
          <button class="${miembro.activo ? 'danger-button' : 'secondary-button'}" type="button" data-accion="acceso" data-id="${miembro.usuario_id}">
            ${miembro.activo ? 'Quitar acceso' : 'Devolver acceso'}
          </button>
        </div>
      </article>`).join('') : vacio('No hay jefes ni recepcionistas.');
    return;
  }

  bloqueos = await listarBloqueos(app.empresa.id, new Date().toISOString());
  lista.innerHTML = bloqueos.length ? bloqueos.map(bloqueo => html`
    <article class="card management-card">
      <h3 class="management-title">${bloqueo.motivo || 'Bloqueo'}</h3>
      <p class="management-subtitle">${bloqueo.empleado?.nombre || 'Toda la empresa'}</p>
      <p class="card-text">${fechaBonita(bloqueo.inicio, app.zona)} ${horaBonita(bloqueo.inicio, app.zona)} → ${fechaBonita(bloqueo.fin, app.zona)} ${horaBonita(bloqueo.fin, app.zona)}</p>
      <div class="management-actions" data-escritura><button class="danger-button" type="button" data-accion="eliminar-bloqueo" data-id="${bloqueo.id}">Eliminar</button></div>
    </article>`).join('') : vacio('No hay cierres ni ausencias programadas.');
}

async function alAccion(evento) {
  const boton = evento.target.closest('[data-accion]');
  if (!boton) {
    return;
  }
  const id = boton.dataset.id;
  const empleado = app.empleados.find(item => item.id === id);
  switch (boton.dataset.accion) {
    case 'editar':
      formularioEspecialista(empleado);
      break;
    case 'horario':
      formularioHorario(empleado).catch(mostrarError);
      break;
    case 'invitar':
      await conCarga(boton, async () => {
        const resultado = await invitarUsuario({ empresaId: app.empresa.id, correo: empleado.correo, nombre: empleado.nombre, rol: 'employee', empleadoId: empleado.id });
        toast(resultado.estado === 'vinculado' ? 'La persona ya tenía cuenta: quedó vinculada.' : 'Invitación enviada por correo.');
        await recargarCatalogos();
      });
      break;
    case 'desactivar':
      formularioDesactivar(empleado);
      break;
    case 'reactivar':
      await conCarga(boton, async () => {
        await reactivarEmpleado(id);
        toast('Especialista reactivado.');
        await recargarCatalogos();
      });
      break;
    case 'acceso': {
      const miembro = miembros.find(item => item.usuario_id === id);
      if (miembro.activo && !window.confirm('¿Quitar el acceso de esta persona a la empresa?')) {
        return;
      }
      await conCarga(boton, async () => {
        await cambiarAccesoMiembro(app.empresa.id, id, !miembro.activo);
        toast('Acceso actualizado.');
        await renderizar();
      });
      break;
    }
    case 'eliminar-bloqueo':
      if (!window.confirm('¿Eliminar este cierre?')) {
        return;
      }
      await conCarga(boton, async () => {
        await eliminarBloqueo(id);
        toast('Cierre eliminado.');
        await renderizar();
      });
      break;
    default:
      break;
  }
}

function formularioEspecialista(empleado) {
  const servicios = app.servicios.filter(servicio => servicio.activo);
  const contenedor = abrirFormulario({
    titulo: empleado ? 'Editar especialista' : 'Nuevo especialista',
    kicker: 'Equipo',
    contenido: html`
      <form class="sheet-body" id="form-especialista" novalidate>
        <div class="field-group"><label for="esp-nombre">Nombre completo</label><input id="esp-nombre" name="nombre" required minlength="2" value="${empleado?.nombre || ''}"></div>
        <div class="field-group"><label for="esp-correo">Correo (para su acceso)</label><input id="esp-correo" name="correo" type="email" required value="${empleado?.correo || ''}" ${empleado?.usuario_id ? crudo('disabled') : ''}></div>
        <div class="field-row two">
          <div class="field-group"><label for="esp-telefono">Celular</label><input id="esp-telefono" name="telefono" type="tel" inputmode="numeric" value="${empleado?.telefono || ''}"></div>
          <div class="field-group"><label for="esp-cargo">Cargo</label><input id="esp-cargo" name="cargo" value="${empleado?.cargo || 'Especialista'}"></div>
        </div>
        <div class="field-group"><label for="esp-color">Color en la agenda</label><input type="color" id="esp-color" name="color_agenda" value="${empleado?.color_agenda || '#175050'}"></div>
        <div class="field-group"><label>Servicios que realiza</label>
          <div class="servicios-seleccion">
            ${crudo(servicios.map(servicio => html`<label class="chip-option"><span><input type="checkbox" name="servicios" data-lista value="${servicio.id}" ${empleado?.servicio_ids.includes(servicio.id) ? crudo('checked') : ''}> ${servicio.nombre}</span></label>`).join('') || vacio('Primero crea servicios en Catálogo.'))}
          </div></div>
        <div class="field-group"><label for="esp-foto">Foto</label><div class="file-field"><input type="file" id="esp-foto" name="foto" accept="image/*"></div></div>
        ${!empleado?.usuario_id ? crudo(html`<label class="check-field"><input type="checkbox" name="invitar" ${empleado ? '' : crudo('checked')}> Enviar invitación por correo para que tenga acceso a su agenda</label>`) : ''}
        <button class="primary-button" type="submit">Guardar</button>
      </form>`
  });
  contenedor.querySelector('form').addEventListener('submit', async evento => {
    evento.preventDefault();
    const error = validarFormulario(evento.target);
    if (error) {
      toast(error);
      return;
    }
    const datos = leerFormulario(evento.target);
    if (empleado?.usuario_id) {
      datos.correo = empleado.correo;
    }
    await conCarga(evento.submitter, async () => {
      const foto = datos.foto ? await comprimirImagen(datos.foto) : null;
      const guardado = await guardarEmpleado(app.empresa.id, { ...datos, id: empleado?.id }, datos.servicios || [], foto);
      let mensaje = 'Especialista guardado.';
      if (datos.invitar) {
        try {
          const resultado = await invitarUsuario({ empresaId: app.empresa.id, correo: guardado.correo, nombre: guardado.nombre, rol: 'employee', empleadoId: guardado.id });
          mensaje = resultado.estado === 'vinculado' ? 'Guardado y vinculado a su cuenta existente.' : 'Guardado. Invitación enviada por correo.';
        } catch (errorInvitacion) {
          mensaje = `Guardado, pero la invitación falló: ${errorInvitacion.message}`;
        }
      }
      cerrarFormulario();
      toast(mensaje);
      await recargarCatalogos();
    });
  });
}

function formularioMiembro() {
  const contenedor = abrirFormulario({
    titulo: 'Invitar al equipo',
    kicker: 'Jefes y recepción',
    contenido: html`
      <form class="sheet-body" id="form-miembro" novalidate>
        <div class="field-group"><label for="miembro-nombre">Nombre</label><input id="miembro-nombre" name="nombre" required></div>
        <div class="field-group"><label for="miembro-correo">Correo</label><input id="miembro-correo" name="correo" type="email" required></div>
        <div class="field-group"><label for="miembro-rol">Rol</label>
          <select id="miembro-rol" name="rol">
            <option value="receptionist">Recepción (agenda y clientes)</option>
            <option value="boss">Jefe (acceso total a la empresa)</option>
          </select></div>
        <button class="primary-button" type="submit">Enviar invitación</button>
      </form>`
  });
  contenedor.querySelector('form').addEventListener('submit', async evento => {
    evento.preventDefault();
    const error = validarFormulario(evento.target);
    if (error) {
      toast(error);
      return;
    }
    const datos = leerFormulario(evento.target);
    await conCarga(evento.submitter, async () => {
      const resultado = await invitarUsuario({ empresaId: app.empresa.id, ...datos });
      cerrarFormulario();
      toast(resultado.estado === 'vinculado' ? 'La persona ya tenía cuenta: quedó agregada.' : 'Invitación enviada por correo.');
      await renderizar();
    });
  });
}

async function formularioHorario(empleado) {
  const franjas = (await listarHorarios(app.empresa.id)).filter(franja => franja.empleado_id === empleado.id);
  const contenedor = abrirFormulario({
    titulo: `Horario de ${empleado.nombre}`,
    kicker: 'Equipo',
    contenido: html`
      <form class="sheet-body" id="form-horario" novalidate>
        <p class="muted-text">${franjas.length ? 'Este especialista tiene horario propio.' : 'Sin horario propio: usa el horario de la empresa. Agrega franjas para definir uno.'}</p>
        ${crudo(editorHorario(franjas))}
        <button class="primary-button" type="submit">Guardar horario</button>
        <button class="secondary-button" type="button" id="usar-horario-empresa">Usar el horario de la empresa</button>
      </form>`
  });
  const formulario = contenedor.querySelector('form');
  conectarEditorHorario(formulario);
  const guardar = async (boton, lista) => conCarga(boton, async () => {
    await guardarHorarios(app.empresa.id, empleado.id, lista);
    cerrarFormulario();
    toast('Horario guardado.');
  });
  formulario.addEventListener('submit', evento => {
    evento.preventDefault();
    guardar(evento.submitter, leerEditorHorario(formulario));
  });
  formulario.querySelector('#usar-horario-empresa').addEventListener('click', evento => guardar(evento.currentTarget, []));
}

function formularioDesactivar(empleado) {
  const otros = app.empleados.filter(item => item.activo && item.id !== empleado.id);
  const contenedor = abrirFormulario({
    titulo: `Desactivar a ${empleado.nombre}`,
    kicker: 'Equipo',
    contenido: html`
      <form class="sheet-body" id="form-desactivar">
        <p class="muted-text">Perderá el acceso a su agenda. ¿Qué hacemos con sus citas futuras?</p>
        <div class="field-group"><label for="reasignar">Reasignar a</label>
          <select id="reasignar"><option value="">Dejarlas sin especialista (las resuelvo después)</option>
            ${crudo(otros.map(item => html`<option value="${item.id}">${item.nombre}</option>`).join(''))}
          </select></div>
        <p class="muted-text">Solo se reasignan las citas cuyo horario esté libre para la otra persona y que ella sepa hacer; las demás quedan sin especialista.</p>
        <button class="danger-button" type="submit">Desactivar</button>
      </form>`
  });
  contenedor.querySelector('form').addEventListener('submit', async evento => {
    evento.preventDefault();
    await conCarga(evento.submitter, async () => {
      const resultado = await desactivarEmpleado(empleado.id, contenedor.querySelector('#reasignar').value || null);
      cerrarFormulario();
      toast(`Desactivado. Citas reasignadas: ${resultado.reasignadas}. Sin especialista: ${resultado.sin_asignar}.`);
      await recargarCatalogos();
      recargarAgenda();
    });
  });
}

function formularioCierre() {
  const hoyLocal = hoy(app.zona);
  const contenedor = abrirFormulario({
    titulo: 'Nuevo cierre o ausencia',
    kicker: 'Agenda',
    contenido: html`
      <form class="sheet-body" id="form-cierre" novalidate>
        <div class="field-group"><label for="cierre-quien">Aplica a</label>
          <select id="cierre-quien" name="empleadoId"><option value="">Toda la empresa (festivo o cierre)</option>
            ${crudo(app.empleados.filter(item => item.activo).map(item => html`<option value="${item.id}">${item.nombre}</option>`).join(''))}
          </select></div>
        <div class="field-row two">
          <div class="field-group"><label for="cierre-desde">Desde</label><input type="date" id="cierre-desde" name="desde" min="${hoyLocal}" required></div>
          <div class="field-group"><label for="cierre-hora-desde">Hora</label><input type="time" id="cierre-hora-desde" name="horaDesde" value="00:00" required></div>
        </div>
        <div class="field-row two">
          <div class="field-group"><label for="cierre-hasta">Hasta</label><input type="date" id="cierre-hasta" name="hasta" min="${hoyLocal}" required></div>
          <div class="field-group"><label for="cierre-hora-hasta">Hora</label><input type="time" id="cierre-hora-hasta" name="horaHasta" value="23:59" required></div>
        </div>
        <div class="field-group"><label for="cierre-motivo">Motivo</label><input id="cierre-motivo" name="motivo" required maxlength="120" placeholder="Festivo, capacitación…"></div>
        <button class="primary-button" type="submit">Guardar</button>
      </form>`
  });
  contenedor.querySelector('form').addEventListener('submit', async evento => {
    evento.preventDefault();
    const error = validarFormulario(evento.target);
    if (error) {
      toast(error);
      return;
    }
    const datos = leerFormulario(evento.target);
    const inicio = instanteLocal(datos.desde, datos.horaDesde);
    const fin = instanteLocal(datos.hasta, datos.horaHasta);
    if (new Date(fin) <= new Date(inicio)) {
      toast('La fecha final debe ser posterior a la inicial.');
      return;
    }
    await conCarga(evento.submitter, async () => {
      await crearBloqueo(app.empresa.id, { empleadoId: datos.empleadoId || null, inicio, fin, motivo: datos.motivo });
      cerrarFormulario();
      toast('Cierre guardado. Las citas ya agendadas en ese tiempo no se modifican.');
      await renderizar();
    });
  });
}
