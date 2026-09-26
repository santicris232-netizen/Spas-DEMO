/* CristaSpa - repositorio de clientes (jefe/recepción) y ficha propia (cliente). */
import { supabase, ejecutar, rpc } from '../supabase.js';

/**
 * Clientes de la empresa con búsqueda por nombre, correo o celular.
 * @param {string} empresaId Empresa.
 * @param {string} [busqueda] Texto.
 * @param {number} [limite] Máximo de filas (200 en pantalla; más para exportar).
 * @returns {Promise<Array<object>>} Clientes.
 */
export function listarClientes(empresaId, busqueda = '', limite = 200) {
  let consulta = supabase.from('clientes').select('*').eq('empresa_id', empresaId)
    .is('anonimizado_at', null).order('nombre').limit(limite);
  const texto = busqueda.trim().replace(/[%,()]/g, ' ');
  if (texto) {
    consulta = consulta.or(`nombre.ilike.%${texto}%,apellido.ilike.%${texto}%,correo.ilike.%${texto}%,telefono.ilike.%${texto}%`);
  }
  return ejecutar(consulta);
}

/**
 * Crea o actualiza un cliente (jefe o recepción).
 * @param {string} empresaId Empresa.
 * @param {object} datos Campos.
 * @returns {Promise<object>} Cliente guardado.
 */
export function guardarCliente(empresaId, datos) {
  const fila = {
    empresa_id: empresaId,
    nombre: datos.nombre.trim(),
    apellido: (datos.apellido || '').trim(),
    telefono: (datos.telefono || '').trim() || null,
    correo: (datos.correo || '').trim().toLowerCase() || null,
    fecha_nacimiento: datos.fecha_nacimiento || null,
    notas_internas: (datos.notas_internas || '').trim() || null
  };
  const consulta = datos.id
    ? supabase.from('clientes').update(fila).eq('id', datos.id)
    : supabase.from('clientes').insert({ ...fila, acepta_datos: true, acepta_datos_at: new Date().toISOString() });
  return ejecutar(consulta.select().single());
}

/**
 * Ficha propia del cliente autenticado (sin notas internas).
 * @param {string} empresaId Empresa.
 * @returns {Promise<object|null>} Ficha.
 */
export function miFicha(empresaId) {
  return ejecutar(supabase.from('mi_ficha_cliente').select('*').eq('empresa_id', empresaId).maybeSingle());
}

/** El cliente actualiza sus datos. */
export function actualizarMiFicha(empresaId, datos) {
  return rpc('actualizar_mi_cliente', {
    p_empresa: empresaId,
    p_nombre: datos.nombre,
    p_apellido: datos.apellido,
    p_telefono: datos.telefono || null,
    p_fecha_nacimiento: datos.fecha_nacimiento || null
  });
}

/** Derecho de supresión: el cliente elimina su cuenta en la empresa. */
export function eliminarMiCuenta(empresaId) {
  return rpc('anonimizar_mi_cliente', { p_empresa: empresaId });
}
