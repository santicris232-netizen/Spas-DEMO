/*
  CristaSpa - configuración por entorno.
  Elige el proyecto Supabase según el dominio en el que corre la app, para que la
  misma versión funcione en desarrollo y en producción sin tocar código.

  Solo contiene la clave PÚBLICA (anon/publishable). La service_role nunca va aquí:
  vive únicamente en las Edge Functions (docs/flujos/02-arquitectura.md#adr-005).
*/

/** @typedef {{ nombre: 'dev'|'prod', supabaseUrl: string, supabaseAnonKey: string }} Entorno */

/** @type {Record<'dev'|'prod', Entorno>} */
const ENTORNOS = {
  dev: {
    nombre: 'dev',
    // Proyecto Supabase "cristaspa-dev" (ref sgtrclofajcbnswvtdip).
    supabaseUrl: 'https://sgtrclofajcbnswvtdip.supabase.co',
    supabaseAnonKey: 'sb_publishable_dU9wQq1Jbq3RmjozbTshXw_SZu4bacx'
  },
  prod: {
    nombre: 'prod',
    // TODO(F10): completar con el proyecto Supabase "cristaspa-prod".
    supabaseUrl: 'https://CRISTASPA-PROD.supabase.co',
    supabaseAnonKey: 'PENDIENTE_CLAVE_PUBLICA_PROD'
  }
};

/** Dominios que usan producción. Todo lo demás (localhost, previews) usa dev. */
const DOMINIOS_PROD = ['cristaspa.app'];

/**
 * Determina el entorno a partir del dominio.
 * @param {string} hostname Dominio actual (window.location.hostname).
 * @returns {Entorno} Configuración del entorno.
 */
export function resolverEntorno(hostname) {
  const esProd = DOMINIOS_PROD.some(dominio => hostname === dominio || hostname.endsWith(`.${dominio}`));
  return esProd ? ENTORNOS.prod : ENTORNOS.dev;
}

/** Entorno activo en esta carga de página. */
export const entorno = resolverEntorno(globalThis.location?.hostname || 'localhost');
