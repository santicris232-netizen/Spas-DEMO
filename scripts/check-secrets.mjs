/*
  CristaSpa - revisión de secretos (amenaza T7, docs/flujos/05-seguridad.md).
  Falla si encuentra claves privilegiadas de Supabase en archivos que se publican
  o se versionan: claves secretas (sb_secret_…), JWT con rol service_role o una
  asignación literal de SUPABASE_SERVICE_ROLE_KEY. Las Edge Functions leen esa
  clave de variables de entorno, nunca de un literal.
*/
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CARPETAS_IGNORADAS = new Set(['.git', 'node_modules', '.temp', '.branches']);
const EXTENSIONES = new Set(['.js', '.mjs', '.ts', '.html', '.css', '.json', '.toml', '.sql', '.md', '.env', '.yml', '.yaml']);

const PATRON_SECRETO = /sb_secret_[A-Za-z0-9_-]{10,}/g;
const PATRON_JWT = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
const PATRON_ASIGNACION = /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*['"`][^'"`\s]{20,}/g;

/**
 * Recorre el repositorio y devuelve las rutas de archivos de texto relevantes.
 * @param {string} carpeta Carpeta inicial.
 * @returns {Promise<Array<string>>} Rutas absolutas.
 */
async function listarArchivos(carpeta) {
  const entradas = await readdir(carpeta, { withFileTypes: true });
  const rutas = [];
  for (const entrada of entradas) {
    const ruta = path.join(carpeta, entrada.name);
    if (entrada.isDirectory()) {
      if (!CARPETAS_IGNORADAS.has(entrada.name)) {
        rutas.push(...await listarArchivos(ruta));
      }
    } else if (EXTENSIONES.has(path.extname(entrada.name)) || entrada.name.startsWith('.env')) {
      rutas.push(ruta);
    }
  }
  return rutas;
}

/**
 * Indica si un JWT tiene rol service_role.
 * @param {string} token JWT.
 * @returns {boolean} Verdadero si es una clave privilegiada.
 */
function esJwtServiceRole(token) {
  try {
    const carga = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return carga.role === 'service_role';
  } catch {
    return false;
  }
}

const hallazgos = [];
for (const archivo of await listarArchivos(raiz)) {
  const contenido = await readFile(archivo, 'utf8');
  const relativo = path.relative(raiz, archivo);
  for (const coincidencia of contenido.match(PATRON_SECRETO) || []) {
    hallazgos.push(`${relativo}: clave secreta ${coincidencia.slice(0, 14)}…`);
  }
  for (const token of contenido.match(PATRON_JWT) || []) {
    if (esJwtServiceRole(token)) {
      hallazgos.push(`${relativo}: JWT con rol service_role`);
    }
  }
  for (const coincidencia of contenido.match(PATRON_ASIGNACION) || []) {
    hallazgos.push(`${relativo}: asignación literal ${coincidencia.slice(0, 32)}…`);
  }
}

if (hallazgos.length) {
  console.error('Se encontraron secretos que no deben estar en el repositorio:');
  hallazgos.forEach(hallazgo => console.error(`  - ${hallazgo}`));
  process.exit(1);
}
console.log('Sin secretos privilegiados en el repositorio.');
