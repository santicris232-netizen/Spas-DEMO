/* CristaSpa - repositorio de agenda: citas, disponibilidad y tiempo real. */
import { supabase, ejecutar, rpc } from '../supabase.js';

/**
 * Citas con detalle (cliente, especialista, servicios). Cada rol ve lo que RLS le permite.
 * @param {string} empresaId Empresa.
 * @param {{desde?: string, hasta?: string, empleadoId?: string|null, estados?: Array<string>,
 *          clienteId?: string, orden?: 'asc'|'desc', limite?: number}} [filtros] Instantes ISO y filtros.
 * @returns {Promise<Array<object>>} Citas.
 */
export function listarCitas(empresaId, filtros = {}) {
  let consulta = supabase.from('citas_detalle').select('*').eq('empresa_id', empresaId)
    .order('inicio', { ascending: filtros.orden !== 'desc' });
  if (filtros.desde) {
    consulta = consulta.gte('inicio', filtros.desde);
  }
  if (filtros.hasta) {
    consulta = consulta.lt('inicio', filtros.hasta);
  }
  if (filtros.empleadoId === null) {
    consulta = consulta.is('empleado_id', null);
  } else if (filtros.empleadoId) {
    consulta = consulta.eq('empleado_id', filtros.empleadoId);
  }
  if (filtros.estados?.length) {
    consulta = consulta.in('estado', filtros.estados);
  }
  if (filtros.clienteId) {
    consulta = consulta.eq('cliente_id', filtros.clienteId);
  }
  if (filtros.limite) {
    consulta = consulta.limit(filtros.limite);
  }
  return ejecutar(consulta);
}

/**
 * Horarios libres para servicios entre dos fechas locales.
 * @param {string} empresaId Empresa.
 * @param {Array<string>} servicios Ids de servicio.
 * @param {string} desde YYYY-MM-DD.
 * @param {string} hasta YYYY-MM-DD.
 * @param {string|null} [empleadoId] Especialista o null para todos.
 * @returns {Promise<Array<{inicio: string, empleado_id: string}>>} Inicios libres.
 */
export function disponibilidad(empresaId, servicios, desde, hasta, empleadoId = null) {
  return rpc('disponibilidad', {
    p_empresa: empresaId, p_servicios: servicios, p_desde: desde, p_hasta: hasta, p_empleado: empleadoId
  });
}

/**
 * Crea una cita (el servidor calcula fin, total y valida el horario).
 * @param {{empresaId: string, servicios: Array<string>, inicio: string, empleadoId?: string|null,
 *          clienteId?: string|null, notas?: string, estado?: string|null}} datos Datos.
 * @returns {Promise<string>} Id de la cita.
 */
export function reservarCita(datos) {
  return rpc('reservar_cita', {
    p_empresa: datos.empresaId,
    p_servicios: datos.servicios,
    p_inicio: datos.inicio,
    p_empleado: datos.empleadoId || null,
    p_cliente: datos.clienteId || null,
    p_notas: datos.notas || '',
    p_estado: datos.estado || null
  });
}

/**
 * Cambia el estado de una cita.
 * @param {string} citaId Cita.
 * @param {'confirmada'|'cancelada'|'completada'|'no_asistio'|'pendiente'} estado Estado nuevo.
 * @param {string|null} [motivo] Motivo de cancelación.
 */
export function cambiarEstadoCita(citaId, estado, motivo = null) {
  return rpc('cambiar_estado_cita', { p_cita: citaId, p_estado: estado, p_motivo: motivo });
}

/**
 * Mueve una cita a otro horario y/o especialista.
 * @param {string} citaId Cita.
 * @param {string} inicio Instante ISO.
 * @param {string|null} [empleadoId] Especialista nuevo (null = el mismo).
 */
export function reprogramarCita(citaId, inicio, empleadoId = null) {
  return rpc('reprogramar_cita', { p_cita: citaId, p_nuevo_inicio: inicio, p_empleado: empleadoId });
}

/**
 * Escucha cambios de citas de la empresa en tiempo real.
 * Supabase solo envía los cambios que el usuario puede ver (RLS).
 * @param {string} empresaId Empresa.
 * @param {(cambio: object) => void} alCambiar Callback.
 * @returns {() => void} Función para dejar de escuchar.
 */
export function escucharCitas(empresaId, alCambiar) {
  const canal = supabase.channel(`citas-${empresaId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'citas', filter: `empresa_id=eq.${empresaId}` }, alCambiar)
    .subscribe();
  return () => supabase.removeChannel(canal);
}
