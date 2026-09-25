/* CristaSpa - reportes del jefe: indicadores del mes, exportación de citas y auditoría. */
import { listarCitas } from '../../compartido/js/repos/citas.js';
import { listarAuditoria, metricasEmpresa } from '../../compartido/js/repos/empresa.js';
import { conCarga, crudo, descargarCsv, dinero, esqueletos, html, mostrarError, vacio } from '../../compartido/js/ui.js';
import { fechaBonita, fechaLocal, horaBonita, hoy, rangoDias, sumarDias } from '../../compartido/js/fechas.js';
import { app, ESTADOS_CITA } from './estado.js';

const ACCIONES = {
  crear: 'Creó', actualizar: 'Actualizó', eliminar: 'Eliminó', ver_como_empresa: 'Entró en modo soporte',
  soporte_edicion: 'Habilitó edición en soporte', invitar: 'Invitó'
};
const ENTIDADES = { empresas: 'empresa', membresias: 'miembro', empleados: 'especialista', servicios: 'servicio', citas: 'cita' };

export async function iniciarReportes() {
  const campo = document.getElementById('reportes-mes');
  campo.value = hoy(app.zona).slice(0, 7);
  campo.addEventListener('change', () => cargar().catch(mostrarError));
  await cargar();
}

/** Primer y último día (YYYY-MM-DD) del mes elegido. */
function mesElegido() {
  const mes = document.getElementById('reportes-mes').value || hoy(app.zona).slice(0, 7);
  const desde = `${mes}-01`;
  const siguiente = sumarDias(`${mes}-28`, 4).slice(0, 7);
  return { desde, hasta: sumarDias(`${siguiente}-01`, -1) };
}

async function cargar() {
  const contenedor = document.getElementById('reportes-contenido');
  contenedor.innerHTML = esqueletos(3);
  const { desde, hasta } = mesElegido();
  const [metricas, auditoria] = await Promise.all([
    metricasEmpresa(app.empresa.id, desde, hasta),
    listarAuditoria({ empresaId: app.empresa.id, limite: 30 })
  ]);
  const porEstado = metricas.por_estado;
  const total = Object.values(porEstado).reduce((suma, n) => suma + n, 0);
  const cerradas = (porEstado.completada || 0) + (porEstado.no_asistio || 0);
  const inasistencia = cerradas ? Math.round(((porEstado.no_asistio || 0) / cerradas) * 100) : 0;
  const maxServicio = Math.max(1, ...metricas.servicios_top.map(item => item.cantidad));
  const maxEspecialista = Math.max(1, ...metricas.por_especialista.map(item => item.citas));

  contenedor.innerHTML = html`
    <div class="summary-grid">
      <div class="stat-tile"><strong>${total}</strong><span>Citas</span></div>
      <div class="stat-tile"><strong>${porEstado.completada || 0}</strong><span>Realizadas</span></div>
      <div class="stat-tile"><strong>${dinero(metricas.ingresos_completadas, app.moneda)}</strong><span>Ingresos estimados</span></div>
      <div class="stat-tile"><strong>${inasistencia}%</strong><span>Inasistencia</span></div>
    </div>

    <section class="form-card">
      <h3 class="form-title">Citas por estado</h3>
      ${crudo(Object.keys(ESTADOS_CITA).map(clave => barra(ESTADOS_CITA[clave], porEstado[clave] || 0, Math.max(1, total))).join(''))}
    </section>

    <section class="form-card">
      <h3 class="form-title">Servicios más pedidos</h3>
      ${crudo(metricas.servicios_top.map(item => barra(item.nombre, item.cantidad, maxServicio)).join('') || vacio('Sin datos este mes.'))}
    </section>

    <section class="form-card">
      <h3 class="form-title">Citas por especialista</h3>
      ${crudo(metricas.por_especialista.map(item => barra(`${item.nombre} · ${Math.round(item.minutos / 60)} h`, item.citas, maxEspecialista)).join('') || vacio('Sin datos este mes.'))}
    </section>

    <section class="form-card">
      <h3 class="form-title">Exportar</h3>
      <button class="secondary-button" type="button" id="exportar-citas">Citas del mes (CSV)</button>
    </section>

    <section class="form-card">
      <h3 class="form-title">Actividad reciente</h3>
      ${crudo(auditoria.map(registro => html`
        <div class="auditoria-item">
          <strong>${ACCIONES[registro.accion] || registro.accion} ${ENTIDADES[registro.entidad] || registro.entidad}</strong>
          <div class="muted-text">${fechaBonita(registro.created_at, app.zona)} ${horaBonita(registro.created_at, app.zona)} · ${descripcion(registro)}</div>
        </div>`).join('') || vacio('Sin actividad registrada.'))}
    </section>`;

  document.getElementById('exportar-citas').addEventListener('click', evento => exportarCitas(evento.currentTarget, desde, hasta));
}

function barra(etiqueta, valor, maximo) {
  return html`
    <div class="barra-metrica">
      <span>${etiqueta}</span><strong>${valor}</strong>
      <div class="barra" role="presentation"><span style="width: ${Math.round((valor / maximo) * 100)}%"></span></div>
    </div>`;
}

/** Resumen legible de un registro de auditoría. */
function descripcion(registro) {
  const fila = registro.despues || registro.antes || {};
  if (registro.entidad === 'citas' && registro.accion === 'actualizar' && registro.antes?.estado !== registro.despues?.estado) {
    return `Estado: ${ESTADOS_CITA[registro.antes?.estado] || '—'} → ${ESTADOS_CITA[registro.despues?.estado] || '—'}`;
  }
  return fila.nombre || fila.rol || '';
}

async function exportarCitas(boton, desde, hasta) {
  await conCarga(boton, async () => {
    const rango = rangoDias(desde, hasta, app.zona);
    const citas = await listarCitas(app.empresa.id, { desde: rango.inicio, hasta: rango.fin });
    descargarCsv(`${app.empresa.slug}-citas-${desde.slice(0, 7)}.csv`, [
      ['Fecha', 'Hora', 'Cliente', 'Celular', 'Correo', 'Servicios', 'Especialista', 'Estado', 'Total', 'Origen'],
      ...citas.map(cita => [
        fechaLocal(cita.inicio, app.zona), horaBonita(cita.inicio, app.zona),
        `${cita.cliente_nombre} ${cita.cliente_apellido}`.trim(), cita.cliente_telefono, cita.cliente_correo,
        cita.servicios.map(item => item.nombre).join(' + '), cita.empleado_nombre, ESTADOS_CITA[cita.estado], cita.total, cita.origen
      ])
    ]);
  });
}
