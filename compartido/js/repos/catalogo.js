/* CristaSpa - repositorio de catálogo: categorías, servicios y productos. */
import { supabase, ejecutar, subirArchivo } from '../supabase.js';

/**
 * Categorías de la empresa ordenadas.
 * @param {string} empresaId Empresa.
 * @param {{soloActivas?: boolean}} [opciones] Filtros.
 * @returns {Promise<Array<object>>} Categorías.
 */
export function listarCategorias(empresaId, { soloActivas = false } = {}) {
  let consulta = supabase.from('categorias').select('*').eq('empresa_id', empresaId).order('orden').order('nombre');
  if (soloActivas) {
    consulta = consulta.eq('activo', true);
  }
  return ejecutar(consulta);
}

/**
 * Crea o actualiza una categoría.
 * @param {string} empresaId Empresa.
 * @param {{id?: string, nombre: string, color: string, orden?: number, activo?: boolean}} datos Datos.
 * @returns {Promise<object>} Categoría guardada.
 */
export function guardarCategoria(empresaId, datos) {
  const fila = {
    empresa_id: empresaId,
    nombre: datos.nombre.trim(),
    slug: slugDe(datos.nombre),
    color: datos.color,
    orden: datos.orden ?? 0,
    activo: datos.activo ?? true
  };
  const consulta = datos.id
    ? supabase.from('categorias').update(fila).eq('id', datos.id)
    : supabase.from('categorias').insert(fila);
  return ejecutar(consulta.select().single());
}

/**
 * Servicios con su categoría.
 * @param {string} empresaId Empresa.
 * @param {{soloActivos?: boolean}} [opciones] Filtros.
 * @returns {Promise<Array<object>>} Servicios.
 */
export function listarServicios(empresaId, { soloActivos = false } = {}) {
  let consulta = supabase.from('servicios')
    .select('*, categoria:categorias(id, nombre, color, activo)')
    .eq('empresa_id', empresaId)
    .order('orden').order('nombre');
  if (soloActivos) {
    consulta = consulta.eq('activo', true);
  }
  return ejecutar(consulta);
}

/**
 * Crea o actualiza un servicio y, si se envía, su imagen.
 * @param {string} empresaId Empresa.
 * @param {object} datos Campos del servicio.
 * @param {Blob|null} [imagen] Imagen comprimida.
 * @returns {Promise<object>} Servicio guardado.
 */
export async function guardarServicio(empresaId, datos, imagen = null) {
  const fila = {
    empresa_id: empresaId,
    categoria_id: datos.categoria_id,
    nombre: datos.nombre.trim(),
    descripcion: (datos.descripcion || '').trim(),
    precio: datos.precio ?? 0,
    duracion_min: datos.duracion_min,
    activo: datos.activo ?? true,
    orden: datos.orden ?? 0
  };
  const consulta = datos.id
    ? supabase.from('servicios').update(fila).eq('id', datos.id)
    : supabase.from('servicios').insert(fila);
  let servicio = await ejecutar(consulta.select().single());
  if (imagen) {
    const ruta = await subirArchivo(`${empresaId}/servicios/${servicio.id}.webp`, imagen);
    servicio = await ejecutar(supabase.from('servicios').update({ imagen_path: ruta }).eq('id', servicio.id).select().single());
  }
  return servicio;
}

/**
 * Productos de vitrina.
 * @param {string} empresaId Empresa.
 * @param {{soloActivos?: boolean}} [opciones] Filtros.
 * @returns {Promise<Array<object>>} Productos.
 */
export function listarProductos(empresaId, { soloActivos = false } = {}) {
  let consulta = supabase.from('productos')
    .select('*, categoria:categorias(id, nombre, color)')
    .eq('empresa_id', empresaId)
    .order('orden').order('nombre');
  if (soloActivos) {
    consulta = consulta.eq('activo', true);
  }
  return ejecutar(consulta);
}

/**
 * Crea o actualiza un producto y su imagen.
 * @param {string} empresaId Empresa.
 * @param {object} datos Campos.
 * @param {Blob|null} [imagen] Imagen comprimida.
 * @returns {Promise<object>} Producto guardado.
 */
export async function guardarProducto(empresaId, datos, imagen = null) {
  const fila = {
    empresa_id: empresaId,
    categoria_id: datos.categoria_id || null,
    nombre: datos.nombre.trim(),
    descripcion: (datos.descripcion || '').trim(),
    precio: datos.precio,
    activo: datos.activo ?? true
  };
  const consulta = datos.id
    ? supabase.from('productos').update(fila).eq('id', datos.id)
    : supabase.from('productos').insert(fila);
  let producto = await ejecutar(consulta.select().single());
  if (imagen) {
    const ruta = await subirArchivo(`${empresaId}/productos/${producto.id}.webp`, imagen);
    producto = await ejecutar(supabase.from('productos').update({ imagen_path: ruta }).eq('id', producto.id).select().single());
  }
  return producto;
}

/**
 * Slug a partir de un nombre (sin tildes, en minúsculas, con guiones).
 * @param {string} texto Nombre.
 * @returns {string} Slug.
 */
export function slugDe(texto) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'categoria';
}
