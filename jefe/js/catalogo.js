/* CristaSpa - catálogo del jefe: servicios, productos y categorías (con imágenes WebP en Storage). */
import { guardarCategoria, guardarProducto, guardarServicio, listarProductos } from '../../compartido/js/repos/catalogo.js';
import { urlPublica } from '../../compartido/js/supabase.js';
import { comprimirImagen, conCarga, crudo, dinero, esqueletos, html, leerNumero, mostrarError, toast, vacio } from '../../compartido/js/ui.js';
import { duracionBonita } from '../../compartido/js/fechas.js';
import { app, abrirFormulario, cerrarFormulario, leerFormulario, recargarCatalogos, validarFormulario } from './estado.js';

const DURACIONES = [15, 20, 30, 45, 60, 75, 90, 105, 120, 150, 180, 210, 240, 300, 360];
const TEXTO_NUEVO = { servicios: '+ Nuevo servicio', productos: '+ Nuevo producto', categorias: '+ Nueva categoría' };
let sub = 'servicios';
let productos = [];

export async function iniciarCatalogo() {
  document.getElementById('catalogo-pestanas').addEventListener('click', evento => {
    const boton = evento.target.closest('[data-sub]');
    if (!boton) {
      return;
    }
    sub = boton.dataset.sub;
    document.querySelectorAll('#catalogo-pestanas [data-sub]').forEach(item => item.classList.toggle('active', item === boton));
    document.getElementById('catalogo-nuevo').textContent = TEXTO_NUEVO[sub];
    renderizar().catch(mostrarError);
  });
  document.getElementById('catalogo-nuevo').addEventListener('click', () => {
    ({ servicios: formularioServicio, productos: formularioProducto, categorias: formularioCategoria })[sub](null);
  });
  document.getElementById('catalogo-lista').addEventListener('click', evento => {
    const boton = evento.target.closest('[data-editar]');
    if (!boton) {
      return;
    }
    const id = boton.dataset.editar;
    if (sub === 'servicios') {
      formularioServicio(app.servicios.find(item => item.id === id));
    } else if (sub === 'productos') {
      formularioProducto(productos.find(item => item.id === id));
    } else {
      formularioCategoria(app.categorias.find(item => item.id === id));
    }
  });
  document.addEventListener('catalogos-actualizados', () => renderizar().catch(mostrarError));
  await renderizar();
}

async function renderizar() {
  const lista = document.getElementById('catalogo-lista');
  if (sub === 'servicios') {
    lista.innerHTML = app.servicios.length ? app.servicios.map(servicio => html`
      <article class="card management-card ${servicio.activo ? '' : 'inactivo'}">
        <div class="fila-miniatura">
          ${servicio.imagen_path ? crudo(html`<img class="miniatura" src="${urlPublica(servicio.imagen_path)}" alt="" loading="lazy">`) : ''}
          <div>
            <h3 class="management-title">${servicio.nombre}</h3>
            <p class="management-subtitle">${servicio.categoria?.nombre || ''} · ${duracionBonita(servicio.duracion_min)}</p>
          </div>
        </div>
        <div class="card-meta">
          <span class="meta-chip">${dinero(servicio.precio, app.moneda)}</span>
          ${servicio.activo ? '' : crudo('<span class="meta-chip">Inactivo</span>')}
          <span class="meta-chip">${app.empleados.filter(empleado => empleado.activo && empleado.servicio_ids.includes(servicio.id)).length} especialistas</span>
        </div>
        <div class="management-actions" data-escritura><button class="secondary-button" type="button" data-editar="${servicio.id}">Editar</button></div>
      </article>`).join('') : vacio('Aún no hay servicios.');
    return;
  }
  if (sub === 'productos') {
    lista.innerHTML = esqueletos(2);
    productos = await listarProductos(app.empresa.id);
    lista.innerHTML = productos.length ? productos.map(producto => html`
      <article class="card management-card ${producto.activo ? '' : 'inactivo'}">
        <div class="fila-miniatura">
          ${producto.imagen_path ? crudo(html`<img class="miniatura" src="${urlPublica(producto.imagen_path)}" alt="" loading="lazy">`) : ''}
          <div>
            <h3 class="management-title">${producto.nombre}</h3>
            <p class="management-subtitle">${producto.categoria?.nombre || 'Sin categoría'} · ${dinero(producto.precio, app.moneda)}</p>
          </div>
        </div>
        <div class="management-actions" data-escritura><button class="secondary-button" type="button" data-editar="${producto.id}">Editar</button></div>
      </article>`).join('') : vacio('Aún no hay productos.');
    return;
  }
  lista.innerHTML = app.categorias.length ? app.categorias.map(categoria => html`
    <article class="card management-card agenda-card ${categoria.activo ? '' : 'inactivo'}" style="--categoria: ${categoria.color}">
      <h3 class="management-title">${categoria.nombre}</h3>
      <p class="management-subtitle">${app.servicios.filter(servicio => servicio.categoria_id === categoria.id).length} servicios · orden ${categoria.orden}${categoria.activo ? '' : ' · Inactiva'}</p>
      <div class="management-actions" data-escritura><button class="secondary-button" type="button" data-editar="${categoria.id}">Editar</button></div>
    </article>`).join('') : vacio('Aún no hay categorías.');
}

/** Campo de imagen con vista previa. */
function campoImagen(id, rutaActual) {
  return html`
    <div class="field-group"><label for="${id}">Imagen</label>
      <div class="file-field">
        <input type="file" id="${id}" name="imagen" accept="image/*">
        ${rutaActual ? crudo(html`<img class="image-preview" src="${urlPublica(rutaActual)}" alt="Imagen actual">`) : ''}
      </div>
    </div>`;
}

function formularioServicio(servicio) {
  if (!app.categorias.length) {
    toast('Primero crea una categoría.');
    return;
  }
  const duracion = servicio?.duracion_min || 60;
  const opciones = DURACIONES.includes(duracion) ? DURACIONES : [...DURACIONES, duracion].sort((a, b) => a - b);
  const contenedor = abrirFormulario({
    titulo: servicio ? 'Editar servicio' : 'Nuevo servicio',
    kicker: 'Catálogo',
    contenido: html`
      <form class="sheet-body" id="form-servicio" novalidate>
        <div class="field-group"><label for="servicio-categoria">Categoría</label>
          <select id="servicio-categoria" name="categoria_id" required>
            ${crudo(app.categorias.map(categoria => html`<option value="${categoria.id}" ${categoria.id === servicio?.categoria_id ? crudo('selected') : ''}>${categoria.nombre}</option>`).join(''))}
          </select></div>
        <div class="field-group"><label for="servicio-nombre">Nombre</label><input id="servicio-nombre" name="nombre" required maxlength="100" value="${servicio?.nombre || ''}"></div>
        <div class="field-group"><label for="servicio-descripcion">Descripción</label><textarea id="servicio-descripcion" name="descripcion" rows="3">${servicio?.descripcion || ''}</textarea></div>
        <div class="field-row two">
          <div class="field-group"><label for="servicio-precio">Precio (${app.moneda})</label><input id="servicio-precio" name="precio" inputmode="numeric" required value="${servicio ? Number(servicio.precio) : ''}"></div>
          <div class="field-group"><label for="servicio-duracion">Duración</label>
            <select id="servicio-duracion" name="duracion_min">
              ${crudo(opciones.map(minutos => html`<option value="${minutos}" ${minutos === duracion ? crudo('selected') : ''}>${duracionBonita(minutos)}</option>`).join(''))}
            </select></div>
        </div>
        ${crudo(campoImagen('servicio-imagen', servicio?.imagen_path))}
        <label class="check-field"><input type="checkbox" name="activo" ${servicio?.activo === false ? '' : crudo('checked')}> Visible para reservar</label>
        <button class="primary-button" type="submit">Guardar servicio</button>
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
      const imagen = datos.imagen ? await comprimirImagen(datos.imagen) : null;
      await guardarServicio(app.empresa.id, {
        ...datos, id: servicio?.id, precio: leerNumero(datos.precio) ?? 0, duracion_min: Number(datos.duracion_min)
      }, imagen);
      cerrarFormulario();
      toast('Servicio guardado.');
      await recargarCatalogos();
    });
  });
}

function formularioProducto(producto) {
  const contenedor = abrirFormulario({
    titulo: producto ? 'Editar producto' : 'Nuevo producto',
    kicker: 'Catálogo',
    contenido: html`
      <form class="sheet-body" id="form-producto" novalidate>
        <div class="field-group"><label for="producto-categoria">Categoría</label>
          <select id="producto-categoria" name="categoria_id"><option value="">Sin categoría</option>
            ${crudo(app.categorias.map(categoria => html`<option value="${categoria.id}" ${categoria.id === producto?.categoria_id ? crudo('selected') : ''}>${categoria.nombre}</option>`).join(''))}
          </select></div>
        <div class="field-group"><label for="producto-nombre">Nombre</label><input id="producto-nombre" name="nombre" required maxlength="100" value="${producto?.nombre || ''}"></div>
        <div class="field-group"><label for="producto-descripcion">Descripción</label><textarea id="producto-descripcion" name="descripcion" rows="3">${producto?.descripcion || ''}</textarea></div>
        <div class="field-group"><label for="producto-precio">Precio (vacío = por confirmar)</label><input id="producto-precio" name="precio" inputmode="numeric" value="${producto?.precio !== null && producto?.precio !== undefined ? Number(producto.precio) : ''}"></div>
        ${crudo(campoImagen('producto-imagen', producto?.imagen_path))}
        <label class="check-field"><input type="checkbox" name="activo" ${producto?.activo === false ? '' : crudo('checked')}> Visible para clientes</label>
        <button class="primary-button" type="submit">Guardar producto</button>
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
      const imagen = datos.imagen ? await comprimirImagen(datos.imagen) : null;
      await guardarProducto(app.empresa.id, { ...datos, id: producto?.id, precio: leerNumero(datos.precio) }, imagen);
      cerrarFormulario();
      toast('Producto guardado.');
      await renderizar();
    });
  });
}

function formularioCategoria(categoria) {
  const contenedor = abrirFormulario({
    titulo: categoria ? 'Editar categoría' : 'Nueva categoría',
    kicker: 'Catálogo',
    contenido: html`
      <form class="sheet-body" id="form-categoria" novalidate>
        <div class="field-group"><label for="categoria-nombre">Nombre</label><input id="categoria-nombre" name="nombre" required maxlength="60" value="${categoria?.nombre || ''}"></div>
        <div class="field-row two">
          <div class="field-group"><label for="categoria-color">Color en la agenda</label><input type="color" id="categoria-color" name="color" value="${categoria?.color || '#175050'}"></div>
          <div class="field-group"><label for="categoria-orden">Orden</label><input type="number" id="categoria-orden" name="orden" min="0" value="${categoria?.orden ?? app.categorias.length}"></div>
        </div>
        <label class="check-field"><input type="checkbox" name="activo" ${categoria?.activo === false ? '' : crudo('checked')}> Activa</label>
        <button class="primary-button" type="submit">Guardar categoría</button>
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
    const conServiciosActivos = categoria && app.servicios.some(servicio => servicio.categoria_id === categoria.id && servicio.activo);
    if (categoria && !datos.activo && conServiciosActivos) {
      toast('Mueve o desactiva sus servicios antes de desactivar la categoría.');
      return;
    }
    await conCarga(evento.submitter, async () => {
      await guardarCategoria(app.empresa.id, { ...datos, id: categoria?.id, orden: Number(datos.orden) || 0 });
      cerrarFormulario();
      toast('Categoría guardada.');
      await recargarCatalogos();
    });
  });
}
