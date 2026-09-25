/* CristaSpa - repositorio de equipo: especialistas, miembros, invitaciones, horarios y bloqueos. */
import { supabase, ejecutar, rpc, subirArchivo } from '../supabase.js';
import { ErrorApp, traducirError } from '../errores.js';

/**
 * Especialistas de la empresa con los ids de servicios que atienden (jefe, recepción, empleado).
 * @param {string} empresaId Empresa.
 * @returns {Promise<Array<object>>} Especialistas.
 */
export async function listarEmpleados(empresaId) {
  const filas = await ejecutar(supabase.from('empleados')
    .select('*, empleado_servicios(servicio_id)')
    .eq('empresa_id', empresaId).order('activo', { ascending: false }).order('nombre'));
  return filas.map(fila => ({ ...fila, servicio_ids: fila.empleado_servicios.map(item => item.servicio_id) }));
}

/**
 * Especialistas activos visibles para clientes (sin datos de contacto).
 * @param {string} empresaId Empresa.
 * @returns {Promise<Array<object>>} Especialistas.
 */
export function listarEspecialistas(empresaId) {
  return ejecutar(supabase.from('especialistas_publicos').select('*').eq('empresa_id', empresaId).order('nombre'));
}

/**
 * Crea o actualiza un especialista, sus servicios y su foto.
 * @param {string} empresaId Empresa.
 * @param {object} datos Campos (id?, nombre, correo, telefono, cargo, color_agenda).
 * @param {Array<string>} servicioIds Servicios que atiende.
 * @param {Blob|null} [foto] Foto comprimida.
 * @returns {Promise<object>} Especialista guardado.
 */
export async function guardarEmpleado(empresaId, datos, servicioIds, foto = null) {
  const fila = {
    empresa_id: empresaId,
    nombre: datos.nombre.trim(),
    correo: datos.correo.trim().toLowerCase(),
    telefono: (datos.telefono || '').trim() || null,
    cargo: (datos.cargo || 'Especialista').trim(),
    color_agenda: datos.color_agenda
  };
  const consulta = datos.id
    ? supabase.from('empleados').update(fila).eq('id', datos.id)
    : supabase.from('empleados').insert(fila);
  let empleado = await ejecutar(consulta.select().single());

  const actuales = await ejecutar(supabase.from('empleado_servicios').select('servicio_id').eq('empleado_id', empleado.id));
  const idsActuales = actuales.map(item => item.servicio_id);
  const quitar = idsActuales.filter(id => !servicioIds.includes(id));
  const agregar = servicioIds.filter(id => !idsActuales.includes(id));
  if (quitar.length) {
    await ejecutar(supabase.from('empleado_servicios').delete().eq('empleado_id', empleado.id).in('servicio_id', quitar));
  }
  if (agregar.length) {
    await ejecutar(supabase.from('empleado_servicios')
      .insert(agregar.map(servicioId => ({ empresa_id: empresaId, empleado_id: empleado.id, servicio_id: servicioId }))));
  }
  if (foto) {
    const ruta = await subirArchivo(`${empresaId}/empleados/${empleado.id}.webp`, foto);
    empleado = await ejecutar(supabase.from('empleados').update({ foto_path: ruta }).eq('id', empleado.id).select().single());
  }
  return empleado;
}

/**
 * Desactiva un especialista, reasignando sus citas futuras cuando se puede.
 * @param {string} empleadoId Especialista.
 * @param {string|null} reasignarA Especialista que recibe las citas.
 * @returns {Promise<{reasignadas: number, sin_asignar: number}>} Resultado.
 */
export function desactivarEmpleado(empleadoId, reasignarA) {
  return rpc('desactivar_empleado', { p_empleado: empleadoId, p_reasignar_a: reasignarA || null });
}

/** Reactiva un especialista. */
export function reactivarEmpleado(empleadoId) {
  return rpc('reactivar_empleado', { p_empleado: empleadoId });
}

/**
 * Miembros del equipo (jefes y recepción) con su perfil.
 * @param {string} empresaId Empresa.
 * @returns {Promise<Array<object>>} Membresías.
 */
export function listarMiembros(empresaId) {
  return ejecutar(supabase.from('membresias')
    .select('usuario_id, rol, activo, created_at, perfil:perfiles!membresias_usuario_id_fkey(nombre, apellido, telefono)')
    .eq('empresa_id', empresaId).in('rol', ['boss', 'receptionist']).order('rol'));
}

/** Activa o desactiva el acceso de un jefe o recepcionista. */
export function cambiarAccesoMiembro(empresaId, usuarioId, activo) {
  return rpc('cambiar_acceso_miembro', { p_empresa: empresaId, p_usuario: usuarioId, p_activo: activo });
}

/**
 * Invita a una persona por correo (Edge Function invitar-usuario).
 * @param {{empresaId: string, correo: string, nombre: string, rol: 'boss'|'receptionist'|'employee', empleadoId?: string}} datos Datos.
 * @returns {Promise<{estado: string}>} Resultado de la invitación.
 */
export async function invitarUsuario(datos) {
  const { data, error } = await supabase.functions.invoke('invitar-usuario', {
    body: {
      empresa_id: datos.empresaId,
      correo: datos.correo.trim().toLowerCase(),
      nombre: datos.nombre.trim(),
      rol: datos.rol,
      empleado_id: datos.empleadoId || null,
      url_app: window.location.origin + window.location.pathname.replace(/(jefe|desarrollador)\/html\/.*$/, '')
    }
  });
  if (error) {
    let detalle = null;
    try {
      detalle = await error.context?.json?.();
    } catch {
      detalle = null;
    }
    if (detalle?.mensaje) {
      throw new ErrorApp(detalle.codigo || 'invitacion', detalle.mensaje, error);
    }
    throw traducirError(error);
  }
  return data;
}

/**
 * Horarios de la empresa y de los especialistas.
 * @param {string} empresaId Empresa.
 * @returns {Promise<Array<object>>} Franjas.
 */
export function listarHorarios(empresaId) {
  return ejecutar(supabase.from('horarios_atencion').select('*').eq('empresa_id', empresaId)
    .order('dia_semana').order('hora_inicio'));
}

/**
 * Reemplaza los horarios de la empresa (empleadoId null) o de un especialista.
 * @param {string} empresaId Empresa.
 * @param {string|null} empleadoId Especialista.
 * @param {Array<{dia_semana: number, hora_inicio: string, hora_fin: string}>} franjas Franjas.
 */
export function guardarHorarios(empresaId, empleadoId, franjas) {
  return rpc('guardar_horarios', { p_empresa: empresaId, p_empleado: empleadoId, p_franjas: franjas });
}

/**
 * Bloqueos de agenda desde un instante.
 * @param {string} empresaId Empresa.
 * @param {string} desde Instante ISO.
 * @returns {Promise<Array<object>>} Bloqueos.
 */
export function listarBloqueos(empresaId, desde) {
  return ejecutar(supabase.from('bloqueos_agenda').select('*, empleado:empleados(nombre)')
    .eq('empresa_id', empresaId).gte('fin', desde).order('inicio'));
}

/**
 * Crea un bloqueo (ausencia, festivo, cierre).
 * @param {string} empresaId Empresa.
 * @param {{empleadoId: string|null, inicio: string, fin: string, motivo: string}} datos Datos.
 * @returns {Promise<object>} Bloqueo.
 */
export function crearBloqueo(empresaId, datos) {
  return ejecutar(supabase.from('bloqueos_agenda').insert({
    empresa_id: empresaId, empleado_id: datos.empleadoId || null, inicio: datos.inicio, fin: datos.fin, motivo: datos.motivo
  }).select().single());
}

/** Elimina un bloqueo. */
export function eliminarBloqueo(bloqueoId) {
  return ejecutar(supabase.from('bloqueos_agenda').delete().eq('id', bloqueoId));
}
