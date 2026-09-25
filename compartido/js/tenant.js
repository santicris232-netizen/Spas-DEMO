/*
  CristaSpa - resolución de empresa (tenant) y marca dinámica.
  El slug de la URL solo decide qué marca mostrar; el acceso a datos lo decide la
  membresía en la base de datos (docs/flujos/06-flujo-acceso-y-empresa.md).
*/
import { supabase, ejecutar, urlPublica } from './supabase.js';

const CLAVE_EMPRESA = 'cristaspa_empresa';
const DOMINIO_BASE = 'cristaspa.app';
const SUBDOMINIOS_RESERVADOS = ['www', 'app'];

export const MARCA_CRISTASPA = Object.freeze({
  slug: null,
  nombre: 'CristaSpa',
  logo_path: null,
  color_primario: '#175050',
  color_secundario: '#faf6ee',
  color_acento: '#c9a020'
});

/**
 * Slug indicado en la URL (subdominio o ?empresa=).
 * @param {Location} ubicacion window.location.
 * @returns {string|null} Slug en minúsculas.
 */
export function slugDeUrl(ubicacion = window.location) {
  const host = ubicacion.hostname;
  if (host.endsWith(`.${DOMINIO_BASE}`)) {
    const sub = host.slice(0, -(DOMINIO_BASE.length + 1));
    if (sub && !sub.includes('.') && !SUBDOMINIOS_RESERVADOS.includes(sub)) {
      return sub.toLowerCase();
    }
  }
  const parametro = new URLSearchParams(ubicacion.search).get('empresa');
  return parametro ? parametro.trim().toLowerCase() : null;
}

/**
 * Empresa guardada en esta pestaña del navegador.
 * @returns {object|null} Empresa pública.
 */
export function empresaGuardada() {
  try {
    return JSON.parse(sessionStorage.getItem(CLAVE_EMPRESA) || 'null');
  } catch {
    return null;
  }
}

/**
 * Guarda la empresa activa para las páginas internas.
 * @param {object|null} empresa Empresa pública o null para olvidarla.
 */
export function guardarEmpresa(empresa) {
  if (empresa) {
    sessionStorage.setItem(CLAVE_EMPRESA, JSON.stringify(empresa));
  } else {
    sessionStorage.removeItem(CLAVE_EMPRESA);
  }
}

/**
 * Consulta la marca pública de una empresa operativa.
 * @param {string} slug Slug.
 * @returns {Promise<object|null>} Empresa pública o null si no existe o no está disponible.
 */
export async function buscarEmpresaPublica(slug) {
  return ejecutar(supabase.from('empresas_publicas').select('*').eq('slug', slug).maybeSingle());
}

/**
 * Resuelve la empresa de la URL (o la guardada) y la guarda.
 * @returns {Promise<{estado: 'plataforma'|'ok'|'no_disponible', empresa: object|null, slug: string|null}>}
 */
export async function resolverEmpresa() {
  const slug = slugDeUrl() || empresaGuardada()?.slug || null;
  if (!slug) {
    return { estado: 'plataforma', empresa: null, slug: null };
  }
  const guardada = empresaGuardada();
  if (guardada?.slug === slug && !slugDeUrl()) {
    return { estado: 'ok', empresa: guardada, slug };
  }
  const empresa = await buscarEmpresaPublica(slug);
  if (!empresa) {
    guardarEmpresa(null);
    return { estado: 'no_disponible', empresa: null, slug };
  }
  guardarEmpresa(empresa);
  return { estado: 'ok', empresa, slug };
}

/**
 * Luminancia relativa de un color hex (WCAG).
 * @param {string} hex #RRGGBB.
 * @returns {number} 0 a 1.
 */
export function luminancia(hex) {
  const canales = [1, 3, 5].map(inicio => parseInt(hex.slice(inicio, inicio + 2), 16) / 255)
    .map(canal => (canal <= 0.03928 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4));
  return 0.2126 * canales[0] + 0.7152 * canales[1] + 0.0722 * canales[2];
}

/**
 * Relación de contraste entre dos colores (WCAG).
 * @param {string} a #RRGGBB.
 * @param {string} b #RRGGBB.
 * @returns {number} 1 a 21.
 */
export function contraste(a, b) {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
}

/**
 * Color de texto legible (blanco o casi negro) sobre un fondo.
 * @param {string} fondo #RRGGBB.
 * @returns {string} Color de texto.
 */
export function textoSobre(fondo) {
  return contraste(fondo, '#ffffff') >= contraste(fondo, '#111111') ? '#ffffff' : '#111111';
}

/**
 * Aplica la marca de una empresa (o la de CristaSpa) a la página.
 * @param {object|null} empresa Empresa pública.
 * @param {{titulo?: string}} [opciones] Título de la sección para la pestaña del navegador.
 */
export function aplicarMarca(empresa, opciones = {}) {
  const marca = { ...MARCA_CRISTASPA, ...(empresa || {}) };
  const raiz = document.documentElement.style;
  raiz.setProperty('--brand-primary', marca.color_primario);
  raiz.setProperty('--brand-secondary', marca.color_secundario);
  raiz.setProperty('--brand-accent', marca.color_acento);
  raiz.setProperty('--brand-on-primary', textoSobre(marca.color_primario));
  raiz.setProperty('--brand-on-accent', textoSobre(marca.color_acento));

  const partes = [opciones.titulo, marca.nombre, empresa ? 'CristaSpa' : null].filter(Boolean);
  document.title = [...new Set(partes)].join(' · ');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', marca.color_primario);

  document.querySelectorAll('[data-marca-nombre]').forEach(elemento => {
    elemento.textContent = marca.nombre;
  });
  document.querySelectorAll('[data-marca-logo]').forEach(elemento => {
    const url = urlPublica(marca.logo_path);
    if (url) {
      elemento.innerHTML = '';
      const img = document.createElement('img');
      img.className = 'brand-logo';
      img.src = url;
      img.alt = `Logo de ${marca.nombre}`;
      elemento.append(img);
    } else {
      elemento.innerHTML = '';
      const sigla = document.createElement('span');
      sigla.className = 'brand-logo brand-logo-fallback';
      sigla.textContent = marca.nombre.split(/\s+/).slice(0, 2).map(palabra => palabra[0]).join('').toUpperCase();
      elemento.append(sigla);
    }
  });
}

/**
 * URL raíz de la app con la empresa en la query (para enlaces y redirecciones de correo).
 * @param {string|null} slug Slug.
 * @param {string} [hash] Fragmento (#nueva-clave).
 * @returns {string} URL absoluta.
 */
export function urlDeEmpresa(slug, hash = '') {
  const url = new URL(raizApp());
  if (slug) {
    url.searchParams.set('empresa', slug);
  }
  url.hash = hash;
  return url.toString();
}

/**
 * URL de la raíz de la app (donde está index.html), sin importar la página actual.
 * @returns {string} URL absoluta terminada en /.
 */
export function raizApp() {
  const actual = new URL(window.location.href);
  const ruta = actual.pathname.replace(/(usuarios|jefe|empleado|desarrollador)\/html\/.*$/, '').replace(/index\.html$/, '');
  return `${actual.origin}${ruta.endsWith('/') ? ruta : `${ruta}/`}`;
}
