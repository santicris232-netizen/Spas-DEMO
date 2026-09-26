/* CristaSpa - repositorio de plataforma (solo developer): empresas, usuarios y plantillas. */
import { supabase, ejecutar, rpc } from '../supabase.js';
import { ErrorApp, traducirError } from '../errores.js';

/** Métricas globales. */
export function metricasPlataforma() {
  return rpc('metricas_plataforma');
}

/** Empresas con conteos y jefes. */
export function resumenEmpresas() {
  return rpc('resumen_empresas');
}

/**
 * Crea una empresa e invita a su jefe (Edge Function crear-empresa).
 * @param {object} datos Datos del asistente (empresa + jefe).
 * @returns {Promise<{empresa_id: string, slug: string, invitacion: string}>} Resultado.
 */
export async function crearEmpresa(datos) {
  const { data, error } = await supabase.functions.invoke('crear-empresa', { body: datos });
  if (error) {
    let detalle = null;
    try {
      detalle = await error.context?.json?.();
    } catch {
      detalle = null;
    }
    if (detalle?.mensaje) {
      throw new ErrorApp(detalle.codigo || 'crear_empresa', detalle.mensaje, error);
    }
    throw traducirError(error);
  }
  return data;
}

/**
 * ¿Está libre un slug? (consulta la vista pública y la tabla completa del developer).
 * @param {string} slug Slug.
 * @returns {Promise<boolean>} Disponible.
 */
export async function slugDisponible(slug) {
  const fila = await ejecutar(supabase.from('empresas').select('id').eq('slug', slug).maybeSingle());
  return !fila;
}

/** Cambia el estado de una empresa. */
export function cambiarEstadoEmpresa(empresaId, estado, motivo = null) {
  return rpc('cambiar_estado_empresa', { p_empresa: empresaId, p_estado: estado, p_motivo: motivo });
}

/**
 * Actualiza plan, límites y fin de prueba (el developer puede escribir todas las columnas vía RPC futura;
 * por ahora usa los campos de marca y contacto como el jefe).
 */
export function obtenerEmpresaCompleta(empresaId) {
  return ejecutar(supabase.from('empresas').select('*').eq('id', empresaId).single());
}

/** Busca usuarios por correo o nombre. */
export function buscarUsuarios(texto) {
  return rpc('buscar_usuarios', { p_texto: texto });
}

/** Otorga o quita el rol developer. */
export function asignarDeveloper(usuarioId, valor) {
  return rpc('asignar_developer', { p_usuario: usuarioId, p_valor: valor });
}

/** Registra la entrada en modo soporte. */
export function registrarSoporte(empresaId, edicion = false) {
  return rpc('registrar_soporte', { p_empresa: empresaId, p_edicion: edicion });
}

/** Plantillas de catálogo. */
export function listarPlantillas() {
  return ejecutar(supabase.from('plantillas').select('*').order('nombre'));
}

/** Guarda una plantilla. */
export function guardarPlantilla(datos) {
  const fila = { clave: datos.clave, nombre: datos.nombre, descripcion: datos.descripcion || '', contenido: datos.contenido, activo: datos.activo ?? true };
  const consulta = datos.id
    ? supabase.from('plantillas').update(fila).eq('id', datos.id)
    : supabase.from('plantillas').insert(fila);
  return ejecutar(consulta.select().single());
}
