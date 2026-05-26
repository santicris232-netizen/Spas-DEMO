/*
  Maison Lash - utilidades visuales compartidas.
  Agrupa formato de fechas, escape de HTML, lectura de imagenes y mensajes.
*/
(function () {
  'use strict';

  let toastTimer = null;

  /**
   * Escapa texto para inyectarlo de forma segura en HTML.
   * @param {unknown} value Valor de entrada.
   * @returns {string} Texto escapado.
   */
  function escapeHTML(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Escapa texto para atributos HTML.
   * @param {unknown} value Valor de entrada.
   * @returns {string} Texto escapado.
   */
  function escapeAttr(value) {
    return escapeHTML(value).replace(/`/g, '&#096;');
  }

  /**
   * Muestra una notificacion flotante.
   * @param {string} message Mensaje visible.
   */
  function showToast(message) {
    const toast = document.getElementById('toast');

    if (!toast) {
      return;
    }

    toast.textContent = message;
    toast.classList.add('active');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('active'), 2800);
  }

  /**
   * Da formato corto a una fecha ISO.
   * @param {string} value Fecha ISO.
   * @returns {string} Fecha para interfaz.
   */
  function formatDate(value) {
    if (!value) {
      return 'Sin fecha';
    }

    return new Date(`${value}T00:00:00`).toLocaleDateString('es-CO', {
      weekday: 'short',
      day: '2-digit',
      month: 'short'
    });
  }

  /**
   * Calcula dias faltantes hasta una fecha.
   * @param {string} value Fecha ISO.
   * @returns {number} Dias restantes.
   */
  function daysUntil(value) {
    const today = new Date();
    const target = new Date(`${value}T00:00:00`);
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    return Math.ceil((target - today) / 86400000);
  }

  /**
   * Traduce una categoria interna a etiqueta visible.
   * @param {string} category Categoria interna.
   * @returns {string} Etiqueta visible.
   */
  function categoryLabel(category) {
    const labels = {
      pestanas: 'Pestanas',
      cejas: 'Cejas',
      labios: 'Labios'
    };
    return labels[category] || 'Servicio';
  }

  /**
   * Retorna la clase visual para una cita segun categorias.
   * @param {Array<string>} categories Categorias de la cita.
   * @returns {string} Clase CSS.
   */
  function appointmentClass(categories) {
    const values = Array.isArray(categories) ? categories : [];

    if (values.length > 1) {
      return 'calendar-all';
    }

    if (values.includes('cejas')) {
      return 'calendar-cejas';
    }

    if (values.includes('labios')) {
      return 'calendar-labios';
    }

    if (values.includes('pestanas')) {
      return 'calendar-pestanas';
    }

    return 'calendar-all';
  }

  /**
   * Convierte una imagen seleccionada a base64.
   * @param {HTMLInputElement} input Campo file.
   * @returns {Promise<string>} Imagen en data URL.
   */
  function readImageInput(input) {
    return new Promise((resolve, reject) => {
      const file = input.files && input.files[0];

      if (!file) {
        resolve('');
        return;
      }

      if (!file.type.startsWith('image/')) {
        reject(new Error('Selecciona una imagen valida.'));
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        reject(new Error('La imagen no puede superar 5MB.'));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Renderiza una imagen o un bloque de respaldo.
   * @param {string} image Data URL.
   * @param {string} title Titulo usado como alt.
   * @returns {string} HTML de imagen.
   */
  function visualImage(image, title) {
    if (image) {
      return `<img class="visual-image" src="${escapeAttr(image)}" alt="${escapeAttr(title)}">`;
    }

    return `<div class="image-fallback" aria-label="${escapeAttr(title)}">ML</div>`;
  }

  /**
   * Descarga un CSV sencillo compatible con Excel.
   * @param {string} fileName Nombre del archivo.
   * @param {Array<Array<string>>} rows Filas del archivo.
   */
  function downloadCsv(fileName, rows) {
    const csv = rows.map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  window.MaisonUi = {
    escapeHTML,
    escapeAttr,
    showToast,
    formatDate,
    daysUntil,
    categoryLabel,
    appointmentClass,
    readImageInput,
    visualImage,
    downloadCsv
  };
})();
