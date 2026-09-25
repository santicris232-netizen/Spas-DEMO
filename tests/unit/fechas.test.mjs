/* Pruebas de compartido/js/fechas.js (zona horaria de la empresa, hallazgo A-03). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aInstante, fechaLocal, horaLocal, rangoDias, sumarDias, duracionBonita, formatearDia, minutosEntre
} from '../../compartido/js/fechas.js';

const BOGOTA = 'America/Bogota';

test('aInstante convierte hora local de Bogotá (UTC-5) a UTC', () => {
  assert.equal(aInstante('2026-09-28', '10:00', BOGOTA), '2026-09-28T15:00:00.000Z');
  assert.equal(aInstante('2026-09-28', '21:30', BOGOTA), '2026-09-29T02:30:00.000Z');
});

test('aInstante respeta horario de verano (Madrid)', () => {
  assert.equal(aInstante('2026-07-01', '10:00', 'Europe/Madrid'), '2026-07-01T08:00:00.000Z');
  assert.equal(aInstante('2026-12-01', '10:00', 'Europe/Madrid'), '2026-12-01T09:00:00.000Z');
});

test('a las 8 p. m. en Bogotá, la fecha local sigue siendo el mismo día (bug de v1)', () => {
  const noche = '2026-09-26T01:00:00.000Z'; // 25 sept 20:00 en Bogotá
  assert.equal(fechaLocal(noche, BOGOTA), '2026-09-25');
  assert.equal(horaLocal(noche, BOGOTA), '20:00');
});

test('rangoDias cubre días completos locales', () => {
  assert.deepEqual(rangoDias('2026-09-28', '2026-09-28', BOGOTA), {
    inicio: '2026-09-28T05:00:00.000Z',
    fin: '2026-09-29T05:00:00.000Z'
  });
});

test('utilidades de días y duración', () => {
  assert.equal(sumarDias('2026-12-31', 1), '2027-01-01');
  assert.equal(sumarDias('2026-03-01', -1), '2026-02-28');
  assert.equal(duracionBonita(90), '1 h 30 min');
  assert.equal(duracionBonita(45), '45 min');
  assert.equal(duracionBonita(120), '2 h');
  assert.equal(minutosEntre('2026-09-28T15:00:00Z', '2026-09-28T16:30:00Z'), 90);
  assert.match(formatearDia('2026-09-28'), /28/);
});
