/*
  CristaSpa - módulo del jefe y de recepción (docs/flujos/09-modulo-jefe.md).
  Arranque: valida el rol, aplica el modo recepción o soporte y carga cada sección.
*/
import { protegerPagina, cerrarSesion } from '../../compartido/js/auth.js';
import { activarPestanas, mostrarError, prepararHoja } from '../../compartido/js/ui.js';
import { app, recargarCatalogos, recargarConfig } from './estado.js';
import { iniciarAgenda } from './agenda.js';
import { iniciarClientes } from './clientes.js';
import { iniciarCatalogo } from './catalogo.js';
import { iniciarEquipo } from './equipo.js';
import { iniciarEmpresa } from './empresa.js';
import { iniciarReportes } from './reportes.js';

const SECCIONES = {
  'vista-clientes': iniciarClientes,
  'vista-catalogo': iniciarCatalogo,
  'vista-equipo': iniciarEquipo,
  'vista-empresa': iniciarEmpresa,
  'vista-reportes': iniciarReportes
};
const iniciadas = new Set();

document.addEventListener('DOMContentLoaded', iniciar);

async function iniciar() {
  prepararHoja('hoja');
  activarPestanas(document.getElementById('navegacion'), vista => {
    if (app.empresa) {
      abrirSeccion(vista);
    }
  });
  document.getElementById('cerrar-sesion').addEventListener('click', cerrarSesion);

  const sesion = await protegerPagina({ roles: ['boss', 'receptionist'], titulo: 'Panel' });
  if (!sesion) {
    return;
  }
  Object.assign(app, {
    empresa: sesion.empresa,
    zona: sesion.empresa.zona_horaria,
    moneda: sesion.empresa.moneda,
    rol: sesion.rol,
    esJefe: sesion.rol === 'boss',
    soporte: sesion.soporte
  });
  document.body.classList.toggle('modo-recepcion', !app.esJefe);
  document.getElementById('rol-kicker').textContent = app.soporte ? 'Soporte' : app.esJefe ? 'Jefe' : 'Recepción';

  try {
    await Promise.all([recargarCatalogos(), recargarConfig()]);
    await iniciarAgenda();
    const activa = document.querySelector('.view.active')?.id;
    if (activa && activa !== 'vista-agenda') {
      abrirSeccion(activa);
    }
  } catch (error) {
    mostrarError(error);
  }
}

/** Inicializa una sección la primera vez que se abre. */
function abrirSeccion(vista) {
  const iniciarSeccion = SECCIONES[vista];
  if (!iniciarSeccion || iniciadas.has(vista)) {
    return;
  }
  iniciadas.add(vista);
  iniciarSeccion().catch(mostrarError);
}
