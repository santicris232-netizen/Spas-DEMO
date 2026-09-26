/*
  CristaSpa - utilidades de interfaz compartidas.
  Escape de HTML (protección XSS), mensajes, formato de moneda, imágenes, hojas
  inferiores, pestañas, CSV y archivos .ics. No accede a datos.
*/

let temporizadorToast = null;

/**
 * Escapa texto para insertarlo en HTML.
 * @param {unknown} valor Valor.
 * @returns {string} Texto seguro.
 */
export function esc(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/`/g, '&#096;');
}

/**
 * Plantilla etiquetada que escapa todas las interpolaciones.
 * Usar `crudo(html)` para insertar HTML ya escapado.
 * @example html`<p>${nombre}</p>`
 * @returns {string} HTML seguro.
 */
export function html(partes, ...valores) {
  return partes.reduce((acumulado, parte, indice) => {
    if (indice === 0) {
      return parte;
    }
    const valor = valores[indice - 1];
    const texto = valor && valor.__crudo ? valor.valor
      : Array.isArray(valor) ? valor.map(item => (item && item.__crudo ? item.valor : esc(item))).join('')
        : esc(valor);
    return acumulado + texto + parte;
  }, '');
}

/**
 * Marca HTML ya seguro para no volver a escaparlo dentro de html``.
 * @param {string} valor HTML confiable (generado con html``).
 * @returns {{__crudo: true, valor: string}} Marcador.
 */
export function crudo(valor) {
  return { __crudo: true, valor };
}

/**
 * Muestra un mensaje flotante breve.
 * @param {string} mensaje Texto.
 */
export function toast(mensaje) {
  const elemento = document.getElementById('toast');
  if (!elemento) {
    return;
  }
  elemento.textContent = mensaje;
  elemento.classList.add('active');
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => elemento.classList.remove('active'), 3200);
}

/**
 * Muestra un error al usuario y lo registra en consola.
 * @param {Error & {codigo?: string, original?: unknown}} error Error (idealmente ErrorApp).
 */
export function mostrarError(error) {
  console.error(error?.original || error);
  toast(error?.message || 'Ocurrió un error inesperado.');
}

/**
 * Formatea dinero según la moneda de la empresa.
 * @param {number|string|null} valor Monto.
 * @param {string} [moneda] Código ISO (COP por defecto).
 * @returns {string} Texto, o "Precio por confirmar" si no hay valor.
 */
export function dinero(valor, moneda = 'COP') {
  if (valor === null || valor === undefined || valor === '') {
    return 'Precio por confirmar';
  }
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: moneda, maximumFractionDigits: moneda === 'COP' ? 0 : 2
  }).format(Number(valor));
}

/**
 * Convierte texto con separadores ("$80.000") a número.
 * @param {string} texto Texto del usuario.
 * @returns {number|null} Número o null si está vacío.
 */
export function leerNumero(texto) {
  const limpio = String(texto ?? '').replace(/[^\d,]/g, '').replace(',', '.');
  return limpio ? Number(limpio) : null;
}

/**
 * Iniciales de un nombre (máximo 2).
 * @param {string} nombre Nombre.
 * @returns {string} Iniciales.
 */
export function iniciales(nombre) {
  return String(nombre || '?').trim().split(/\s+/).slice(0, 2).map(palabra => palabra[0]).join('').toUpperCase();
}

/**
 * Imagen o bloque de respaldo con iniciales.
 * @param {string} url URL pública.
 * @param {string} titulo Texto alternativo.
 * @returns {string} HTML.
 */
export function imagen(url, titulo) {
  if (url) {
    return html`<img class="visual-image" src="${url}" alt="${titulo}" loading="lazy">`;
  }
  return html`<div class="image-fallback" role="img" aria-label="${titulo}">${iniciales(titulo)}</div>`;
}

/**
 * Reduce una imagen a WebP (máx. 1200 px, calidad 0.82) antes de subirla.
 * @param {File} archivo Imagen seleccionada.
 * @returns {Promise<Blob>} Imagen comprimida.
 */
export async function comprimirImagen(archivo) {
  if (!archivo || !archivo.type.startsWith('image/')) {
    throw new Error('Selecciona una imagen válida.');
  }
  if (archivo.size > 10 * 1024 * 1024) {
    throw new Error('La imagen no puede superar 10 MB.');
  }
  const mapa = await createImageBitmap(archivo);
  const escala = Math.min(1, 1200 / Math.max(mapa.width, mapa.height));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(mapa.width * escala);
  lienzo.height = Math.round(mapa.height * escala);
  lienzo.getContext('2d').drawImage(mapa, 0, 0, lienzo.width, lienzo.height);
  const blob = await new Promise(resolve => lienzo.toBlob(resolve, 'image/webp', 0.82));
  if (!blob) {
    throw new Error('No se pudo procesar la imagen.');
  }
  if (blob.size > 2 * 1024 * 1024) {
    throw new Error('La imagen sigue siendo muy pesada. Usa una más pequeña.');
  }
  return blob;
}

/**
 * Descarga un CSV compatible con Excel (UTF-8 con BOM, separador punto y coma).
 * @param {string} nombre Nombre del archivo.
 * @param {Array<Array<unknown>>} filas Filas (la primera es el encabezado).
 */
export function descargarCsv(nombre, filas) {
  const contenido = filas
    .map(fila => fila.map(celda => `"${String(celda ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');
  descargar(nombre, new Blob(['﻿', contenido], { type: 'text/csv;charset=utf-8' }));
}

/**
 * Descarga un Blob como archivo.
 * @param {string} nombre Nombre del archivo.
 * @param {Blob} blob Contenido.
 */
export function descargar(nombre, blob) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Genera un archivo .ics para agregar una cita al calendario del teléfono.
 * @param {{id: string, inicio: string, fin: string, titulo: string, descripcion: string, lugar?: string}} evento Datos.
 * @returns {Blob} Archivo de calendario.
 */
export function crearIcs(evento) {
  const formato = fecha => new Date(fecha).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const limpiar = texto => String(texto || '').replace(/[\\;,]/g, caracter => `\\${caracter}`).replace(/\n/g, '\\n');
  const lineas = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CristaSpa//Citas//ES', 'BEGIN:VEVENT',
    `UID:${evento.id}@cristaspa.app`, `DTSTAMP:${formato(new Date())}`,
    `DTSTART:${formato(evento.inicio)}`, `DTEND:${formato(evento.fin)}`,
    `SUMMARY:${limpiar(evento.titulo)}`, `DESCRIPTION:${limpiar(evento.descripcion)}`,
    evento.lugar ? `LOCATION:${limpiar(evento.lugar)}` : null,
    'END:VEVENT', 'END:VCALENDAR'
  ].filter(Boolean);
  return new Blob([lineas.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
}

/**
 * Activa una navegación por pestañas (.segment-button[data-view] → .view).
 * @param {HTMLElement} nav Contenedor de botones.
 * @param {(vista: string) => void} [alCambiar] Se llama con el id de la vista activa.
 */
export function activarPestanas(nav, alCambiar) {
  nav.addEventListener('click', evento => {
    const boton = evento.target.closest('[data-view]');
    if (!boton || boton.classList.contains('hidden')) {
      return;
    }
    mostrarVista(nav, boton.dataset.view);
    alCambiar?.(boton.dataset.view);
  });
}

/**
 * Muestra una vista y marca su pestaña.
 * @param {HTMLElement} nav Contenedor de pestañas.
 * @param {string} vista Id de la vista.
 */
export function mostrarVista(nav, vista) {
  nav.querySelectorAll('[data-view]').forEach(item => item.classList.toggle('active', item.dataset.view === vista));
  document.querySelectorAll('.view').forEach(item => item.classList.toggle('active', item.id === vista));
  window.scrollTo({ top: 0 });
}

/**
 * Abre una hoja inferior (.sheet-backdrop).
 * @param {string} id Id del contenedor.
 */
export function abrirHoja(id) {
  const hoja = document.getElementById(id);
  hoja.classList.add('active');
  hoja.setAttribute('aria-hidden', 'false');
  hoja.querySelector('input, select, textarea, button')?.focus({ preventScroll: true });
}

/**
 * Cierra una hoja inferior.
 * @param {string} id Id del contenedor.
 */
export function cerrarHoja(id) {
  const hoja = document.getElementById(id);
  hoja.classList.remove('active');
  hoja.setAttribute('aria-hidden', 'true');
}

/**
 * Conecta el cierre de una hoja: botón [data-cerrar-hoja], clic en el fondo y tecla Escape.
 * @param {string} id Id del contenedor.
 */
export function prepararHoja(id) {
  const hoja = document.getElementById(id);
  hoja.addEventListener('click', evento => {
    if (evento.target === hoja || evento.target.closest('[data-cerrar-hoja]')) {
      cerrarHoja(id);
    }
  });
  document.addEventListener('keydown', evento => {
    if (evento.key === 'Escape' && hoja.classList.contains('active')) {
      cerrarHoja(id);
    }
  });
}

/**
 * Deshabilita un botón mientras corre una acción, para evitar dobles envíos.
 * @param {HTMLButtonElement|null} boton Botón.
 * @param {() => Promise<T>} accion Acción.
 * @returns {Promise<T|undefined>} Resultado, o undefined si falló (el error ya se mostró).
 * @template T
 */
export async function conCarga(boton, accion) {
  const textoOriginal = boton?.textContent;
  if (boton) {
    boton.disabled = true;
    boton.textContent = 'Procesando…';
  }
  try {
    return await accion();
  } catch (error) {
    mostrarError(error);
    return undefined;
  } finally {
    if (boton) {
      boton.disabled = false;
      boton.textContent = textoOriginal;
    }
  }
}

/** HTML de carga (esqueletos). */
export function esqueletos(cantidad = 3) {
  return '<div class="skeleton"></div>'.repeat(cantidad);
}

/** HTML de estado vacío. */
export function vacio(mensaje) {
  return html`<div class="empty-state">${mensaje}</div>`;
}

/**
 * Muestra una banda de "sin conexión" mientras el dispositivo esté offline.
 */
export function vigilarConexion() {
  const banda = document.createElement('div');
  banda.className = 'banner banner-offline hidden';
  banda.setAttribute('role', 'status');
  banda.textContent = 'Sin conexión: los cambios no se guardarán hasta que vuelvas a tener internet.';
  document.body.prepend(banda);
  const actualizar = () => banda.classList.toggle('hidden', navigator.onLine);
  window.addEventListener('online', actualizar);
  window.addEventListener('offline', actualizar);
  actualizar();
}

/**
 * Normaliza un número celular colombiano para wa.me (agrega 57 si tiene 10 dígitos).
 * @param {string} telefono Número.
 * @returns {string} Solo dígitos con indicativo, o vacío.
 */
export function telefonoWhatsapp(telefono) {
  const digitos = String(telefono || '').replace(/\D/g, '');
  if (!digitos) {
    return '';
  }
  return digitos.length === 10 ? `57${digitos}` : digitos;
}

/**
 * Reemplaza {variables} de una plantilla.
 * @param {string} plantilla Texto con {llaves}.
 * @param {Record<string, string>} valores Valores.
 * @returns {string} Texto final.
 */
export function rellenarPlantilla(plantilla, valores) {
  return String(plantilla || '').replace(/\{(\w+)\}/g, (coincidencia, clave) => valores[clave] ?? coincidencia);
}
