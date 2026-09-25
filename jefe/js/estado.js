/*
  CristaSpa - estado compartido del módulo del jefe y utilidades de la hoja genérica.
  Cada sección (agenda, clientes, catálogo, equipo, empresa, reportes) lee de aquí
  la empresa activa y los catálogos ya cargados.
*/
import { listarCategorias, listarServicios } from '../../compartido/js/repos/catalogo.js';
import { listarEmpleados } from '../../compartido/js/repos/equipo.js';
import { obtenerConfig } from '../../compartido/js/repos/empresa.js';
import { abrirHoja, cerrarHoja } from '../../compartido/js/ui.js';

export const ESTADOS_CITA = {
  pendiente: 'Pendiente', confirmada: 'Confirmada', completada: 'Realizada', cancelada: 'Cancelada', no_asistio: 'No asistió'
};

export const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** Estado de la sesión del módulo. */
export const app = {
  empresa: null,
  zona: 'America/Bogota',
  moneda: 'COP',
  rol: 'boss',
  esJefe: true,
  soporte: null,
  config: null,
  categorias: [],
  servicios: [],
  empleados: []
};

/** Recarga categorías, servicios y especialistas. */
export async function recargarCatalogos() {
  const [categorias, servicios, empleados] = await Promise.all([
    listarCategorias(app.empresa.id),
    listarServicios(app.empresa.id),
    listarEmpleados(app.empresa.id)
  ]);
  Object.assign(app, { categorias, servicios, empleados });
  document.dispatchEvent(new CustomEvent('catalogos-actualizados'));
}

/** Recarga la configuración de la empresa. */
export async function recargarConfig() {
  app.config = await obtenerConfig(app.empresa.id);
}

/**
 * Abre la hoja genérica con un contenido.
 * @param {{titulo: string, kicker?: string, contenido: string}} opciones Texto y HTML (ya escapado).
 * @returns {HTMLElement} Contenedor del contenido.
 */
export function abrirFormulario({ titulo, kicker = '', contenido }) {
  document.getElementById('hoja-titulo').textContent = titulo;
  document.getElementById('hoja-kicker').textContent = kicker;
  const contenedor = document.getElementById('hoja-contenido');
  contenedor.innerHTML = contenido;
  abrirHoja('hoja');
  return contenedor;
}

/** Cierra la hoja genérica. */
export function cerrarFormulario() {
  cerrarHoja('hoja');
}

/** Especialistas activos que atienden todos los servicios dados. */
export function especialistasAptos(servicioIds) {
  return app.empleados.filter(empleado => empleado.activo && servicioIds.every(id => empleado.servicio_ids.includes(id)));
}

/**
 * Lee un formulario a objeto (inputs con name).
 * @param {HTMLFormElement} formulario Formulario.
 * @returns {Record<string, any>} Valores (checkbox → boolean, varios checkbox con mismo name → arreglo).
 */
export function leerFormulario(formulario) {
  const datos = {};
  for (const campo of formulario.elements) {
    if (!campo.name || campo.disabled) {
      continue;
    }
    if (campo.type === 'checkbox' && campo.dataset.lista !== undefined) {
      datos[campo.name] = datos[campo.name] || [];
      if (campo.checked) {
        datos[campo.name].push(campo.value);
      }
    } else if (campo.type === 'checkbox') {
      datos[campo.name] = campo.checked;
    } else if (campo.type === 'file') {
      datos[campo.name] = campo.files?.[0] || null;
    } else {
      datos[campo.name] = campo.value.trim();
    }
  }
  return datos;
}

/**
 * Valida un formulario nativo y devuelve un mensaje del primer campo inválido.
 * @param {HTMLFormElement} formulario Formulario.
 * @returns {string|null} Mensaje o null si es válido.
 */
export function validarFormulario(formulario) {
  if (formulario.checkValidity()) {
    return null;
  }
  const campo = formulario.querySelector(':invalid');
  campo?.focus();
  const etiqueta = campo?.id ? formulario.querySelector(`label[for="${campo.id}"]`)?.textContent : null;
  return etiqueta ? `Revisa el campo "${etiqueta.trim()}".` : 'Revisa los datos del formulario.';
}
