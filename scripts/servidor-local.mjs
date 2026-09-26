/*
  CristaSpa - servidor estático para desarrollo local (npm run dev).
  Los módulos ES no funcionan abriendo index.html como archivo; hace falta HTTP.
  Aplica las mismas cabeceras de _headers para detectar temprano problemas de CSP.
*/
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const puerto = Number(process.env.PORT || 5173);
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon'
};
const PROHIBIDOS = ['node_modules', 'supabase', 'tests', 'scripts', 'docs', '.git', '.github'];

/** Cabeceras de _headers (bloque "/*"). */
async function leerCabeceras() {
  const texto = await readFile(path.join(raiz, '_headers'), 'utf8');
  return Object.fromEntries(texto.split('\n').slice(1).map(linea => linea.trim()).filter(Boolean)
    .map(linea => [linea.slice(0, linea.indexOf(':')), linea.slice(linea.indexOf(':') + 1).trim()])
    .filter(([nombre]) => nombre !== 'Strict-Transport-Security'));
}

const cabeceras = await leerCabeceras();

createServer(async (peticion, respuesta) => {
  const url = new URL(peticion.url, `http://localhost:${puerto}`);
  let ruta = decodeURIComponent(url.pathname);
  if (ruta.endsWith('/')) {
    ruta += 'index.html';
  }
  const archivo = path.normalize(path.join(raiz, ruta));
  const primerSegmento = path.relative(raiz, archivo).split(path.sep)[0];
  if (!archivo.startsWith(raiz) || PROHIBIDOS.includes(primerSegmento)) {
    respuesta.writeHead(404).end('No encontrado');
    return;
  }
  try {
    if (!(await stat(archivo)).isFile()) {
      throw new Error('no es archivo');
    }
    const contenido = await readFile(archivo);
    respuesta.writeHead(200, {
      ...cabeceras,
      'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    }).end(contenido);
  } catch {
    respuesta.writeHead(404).end('No encontrado');
  }
}).listen(puerto, () => {
  console.log(`CristaSpa en http://localhost:${puerto}/`);
});
