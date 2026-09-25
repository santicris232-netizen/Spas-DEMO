/*
  CristaSpa - fechas en la zona horaria de la empresa.
  Toda la app muestra y calcula fechas en empresa.zona_horaria, nunca en UTC ni en la
  zona del dispositivo (corrige el hallazgo A-03 de v1).
*/

/**
 * Fecha YYYY-MM-DD de un instante en una zona horaria.
 * @param {Date|string} instante Fecha.
 * @param {string} zona Zona IANA (America/Bogota).
 * @returns {string} Fecha local.
 */
export function fechaLocal(instante, zona) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(instante));
}

/**
 * Hoy (YYYY-MM-DD) en la zona indicada.
 * @param {string} zona Zona IANA.
 * @returns {string} Fecha local de hoy.
 */
export function hoy(zona) {
  return fechaLocal(new Date(), zona);
}

/**
 * Hora HH:MM (24 h) de un instante en una zona.
 * @param {Date|string} instante Fecha.
 * @param {string} zona Zona IANA.
 * @returns {string} Hora local.
 */
export function horaLocal(instante, zona) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(new Date(instante));
}

/**
 * Hora legible (3:00 p. m.) de un instante en una zona.
 * @param {Date|string} instante Fecha.
 * @param {string} zona Zona IANA.
 * @returns {string} Hora para mostrar.
 */
export function horaBonita(instante, zona) {
  return new Intl.DateTimeFormat('es-CO', { timeZone: zona, hour: 'numeric', minute: '2-digit' }).format(new Date(instante));
}

/**
 * Fecha legible de un instante (vie, 26 sept).
 * @param {Date|string} instante Fecha.
 * @param {string} zona Zona IANA.
 * @param {Intl.DateTimeFormatOptions} [opciones] Formato.
 * @returns {string} Fecha para mostrar.
 */
export function fechaBonita(instante, zona, opciones = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Intl.DateTimeFormat('es-CO', { timeZone: zona, ...opciones }).format(new Date(instante));
}

/**
 * Formatea una fecha local YYYY-MM-DD sin conversión de zona.
 * @param {string} fecha Fecha local.
 * @param {Intl.DateTimeFormatOptions} [opciones] Formato.
 * @returns {string} Fecha para mostrar.
 */
export function formatearDia(fecha, opciones = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', ...opciones }).format(new Date(`${fecha}T12:00:00Z`));
}

/**
 * Suma días a una fecha local YYYY-MM-DD.
 * @param {string} fecha Fecha local.
 * @param {number} dias Días (negativos restan).
 * @returns {string} Nueva fecha local.
 */
export function sumarDias(fecha, dias) {
  const base = new Date(`${fecha}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

/**
 * Diferencia en minutos entre la hora local de una zona y UTC en un instante.
 * @param {Date} instante Instante.
 * @param {string} zona Zona IANA.
 * @returns {number} Minutos a sumar a UTC para obtener la hora local.
 */
function desfaseMinutos(instante, zona) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(instante).map(parte => [parte.type, parte.value]));
  const comoUtc = Date.UTC(partes.year, partes.month - 1, partes.day, partes.hour, partes.minute, partes.second);
  return Math.round((comoUtc - instante.getTime()) / 60000);
}

/**
 * Convierte una fecha y hora locales de una zona a instante ISO (UTC).
 * @param {string} fecha YYYY-MM-DD.
 * @param {string} hora HH:MM.
 * @param {string} zona Zona IANA.
 * @returns {string} Instante ISO.
 */
export function aInstante(fecha, hora, zona) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const [horas, minutos] = hora.split(':').map(Number);
  const supuesto = Date.UTC(anio, mes - 1, dia, horas, minutos);
  let instante = supuesto - desfaseMinutos(new Date(supuesto), zona) * 60000;
  instante = supuesto - desfaseMinutos(new Date(instante), zona) * 60000;
  return new Date(instante).toISOString();
}

/**
 * Rango [inicio, fin) en instantes ISO que cubre los días locales dados.
 * @param {string} desde YYYY-MM-DD.
 * @param {string} hasta YYYY-MM-DD (incluido).
 * @param {string} zona Zona IANA.
 * @returns {{inicio: string, fin: string}} Rango.
 */
export function rangoDias(desde, hasta, zona) {
  return { inicio: aInstante(desde, '00:00', zona), fin: aInstante(sumarDias(hasta, 1), '00:00', zona) };
}

/**
 * Días de calendario entre hoy y la fecha de un instante, en la zona.
 * @param {Date|string} instante Fecha objetivo.
 * @param {string} zona Zona IANA.
 * @returns {number} Días (0 = hoy, negativo = pasado).
 */
export function diasHasta(instante, zona) {
  const objetivo = new Date(`${fechaLocal(instante, zona)}T12:00:00Z`);
  const actual = new Date(`${hoy(zona)}T12:00:00Z`);
  return Math.round((objetivo - actual) / 86400000);
}

/**
 * Minutos entre dos instantes.
 * @param {Date|string} inicio Inicio.
 * @param {Date|string} fin Fin.
 * @returns {number} Minutos.
 */
export function minutosEntre(inicio, fin) {
  return Math.round((new Date(fin) - new Date(inicio)) / 60000);
}

/**
 * Duración legible (1 h 30 min).
 * @param {number} minutos Minutos.
 * @returns {string} Texto.
 */
export function duracionBonita(minutos) {
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (!horas) {
    return `${resto} min`;
  }
  return resto ? `${horas} h ${resto} min` : `${horas} h`;
}
