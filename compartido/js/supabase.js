/*
  CristaSpa - cliente único de Supabase y utilidades de acceso a datos.
  Solo los módulos de compartido/js/repos/ y auth.js deben importar este archivo:
  las páginas nunca llaman a Supabase directamente (docs/flujos/02-arquitectura.md#capas-y-responsabilidades).
*/
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
import { entorno } from './config.js';
import { ErrorApp, traducirError } from './errores.js';

export const supabase = createClient(entorno.supabaseUrl, entorno.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'cristaspa-auth'
  }
});

/**
 * Ejecuta una consulta de supabase-js y devuelve sus datos, o lanza un ErrorApp.
 * @param {PromiseLike<{data: T, error: object|null}>} consulta Consulta de supabase-js.
 * @returns {Promise<T>} Datos.
 * @template T
 */
export async function ejecutar(consulta) {
  let respuesta;
  try {
    respuesta = await consulta;
  } catch (error) {
    throw traducirError(error);
  }
  if (respuesta.error) {
    throw traducirError(respuesta.error);
  }
  return respuesta.data;
}

/**
 * Llama a una función RPC de Postgres.
 * @param {string} nombre Nombre de la función.
 * @param {object} [parametros] Parámetros con prefijo p_.
 * @returns {Promise<unknown>} Resultado de la función.
 */
export function rpc(nombre, parametros = {}) {
  return ejecutar(supabase.rpc(nombre, parametros));
}

/**
 * URL pública de un archivo del bucket "empresas".
 * @param {string|null|undefined} ruta Ruta dentro del bucket.
 * @returns {string} URL, o cadena vacía si no hay ruta.
 */
export function urlPublica(ruta) {
  if (!ruta) {
    return '';
  }
  return supabase.storage.from('empresas').getPublicUrl(ruta).data.publicUrl;
}

/**
 * Sube (o reemplaza) un archivo en el bucket "empresas".
 * @param {string} ruta Ruta: <empresa_id>/<carpeta>/<archivo>.
 * @param {Blob} archivo Contenido.
 * @returns {Promise<string>} Ruta guardada.
 */
export async function subirArchivo(ruta, archivo) {
  await ejecutar(supabase.storage.from('empresas').upload(ruta, archivo, {
    upsert: true,
    contentType: archivo.type || 'image/webp',
    cacheControl: '3600'
  }));
  return ruta;
}

export { ErrorApp };
