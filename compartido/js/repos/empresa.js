/* CristaSpa - repositorio de la empresa activa: datos, marca, configuración, métricas y auditoría. */
import { supabase, ejecutar, rpc, subirArchivo } from '../supabase.js';

/**
 * Datos completos de la empresa (miembros).
 * @param {string} empresaId Empresa.
 * @returns {Promise<object>} Empresa.
 */
export function obtenerEmpresa(empresaId) {
  return ejecutar(supabase.from('empresas').select('*').eq('id', empresaId).single());
}

/**
 * Actualiza marca y contacto (solo los campos que el jefe puede editar).
 * @param {string} empresaId Empresa.
 * @param {object} datos nombre, colores, contacto.
 * @param {Blob|null} [logo] Logo comprimido.
 * @returns {Promise<object>} Empresa actualizada.
 */
export async function actualizarMarca(empresaId, datos, logo = null) {
  const cambios = {
    nombre: datos.nombre.trim(),
    color_primario: datos.color_primario,
    color_secundario: datos.color_secundario,
    color_acento: datos.color_acento,
    correo_contacto: (datos.correo_contacto || '').trim() || null,
    telefono_contacto: (datos.telefono_contacto || '').trim() || null
  };
  if (logo) {
    cambios.logo_path = await subirArchivo(`${empresaId}/marca/logo-${Date.now()}.webp`, logo);
  }
  return ejecutar(supabase.from('empresas').update(cambios).eq('id', empresaId).select().single());
}

/**
 * Configuración de la empresa (WhatsApp, redes, reglas de agenda).
 * @param {string} empresaId Empresa.
 * @returns {Promise<object>} Configuración.
 */
export function obtenerConfig(empresaId) {
  return ejecutar(supabase.from('empresa_config').select('*').eq('empresa_id', empresaId).single());
}

/**
 * Guarda la configuración.
 * @param {string} empresaId Empresa.
 * @param {object} cambios Campos a cambiar.
 * @returns {Promise<object>} Configuración.
 */
export function guardarConfig(empresaId, cambios) {
  return ejecutar(supabase.from('empresa_config').update(cambios).eq('empresa_id', empresaId).select().single());
}

/**
 * Indicadores y checklist de la empresa.
 * @param {string} empresaId Empresa.
 * @param {string|null} [desde] YYYY-MM-DD.
 * @param {string|null} [hasta] YYYY-MM-DD.
 * @returns {Promise<object>} Métricas.
 */
export function metricasEmpresa(empresaId, desde = null, hasta = null) {
  return rpc('metricas_empresa', { p_empresa: empresaId, p_desde: desde, p_hasta: hasta });
}

/**
 * Auditoría (jefe: su empresa; developer: la que pida o todas).
 * @param {{empresaId?: string|null, limite?: number}} [filtros] Filtros.
 * @returns {Promise<Array<object>>} Registros.
 */
export function listarAuditoria({ empresaId = null, limite = 100 } = {}) {
  let consulta = supabase.from('auditoria').select('*').order('created_at', { ascending: false }).limit(limite);
  if (empresaId) {
    consulta = consulta.eq('empresa_id', empresaId);
  }
  return ejecutar(consulta);
}
