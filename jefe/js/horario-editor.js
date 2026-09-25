/* CristaSpa - editor de horarios semanales (empresa o especialista). Varias franjas por día. */
import { crudo, html } from '../../compartido/js/ui.js';
import { DIAS_SEMANA } from './estado.js';

const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];

/**
 * HTML del editor.
 * @param {Array<{dia_semana: number, hora_inicio: string, hora_fin: string}>} franjas Franjas actuales.
 * @returns {string} HTML.
 */
export function editorHorario(franjas) {
  return html`<div class="stack-list editor-horario">${crudo(ORDEN_DIAS.map(dia => {
    const delDia = franjas.filter(franja => franja.dia_semana === dia);
    return html`
      <div class="horario-dia" data-dia="${dia}">
        <header><span>${DIAS_SEMANA[dia]}</span><button class="secondary-button" type="button" data-agregar-franja>+ Franja</button></header>
        <div class="franjas">${crudo(delDia.map(franja => filaFranja(franja.hora_inicio, franja.hora_fin)).join(''))}</div>
        ${delDia.length ? '' : crudo('<small class="muted-text sin-franjas">Cerrado</small>')}
      </div>`;
  }).join(''))}</div>`;
}

function filaFranja(inicio = '09:00', fin = '18:00') {
  return html`
    <div class="horario-franja">
      <input type="time" value="${inicio.slice(0, 5)}" aria-label="Desde" data-inicio required>
      <input type="time" value="${fin.slice(0, 5)}" aria-label="Hasta" data-fin required>
      <button class="danger-button" type="button" data-quitar-franja aria-label="Quitar franja">✕</button>
    </div>`;
}

/**
 * Conecta los botones de agregar y quitar franjas.
 * @param {HTMLElement} contenedor Contenedor del editor.
 */
export function conectarEditorHorario(contenedor) {
  contenedor.addEventListener('click', evento => {
    const agregar = evento.target.closest('[data-agregar-franja]');
    const quitar = evento.target.closest('[data-quitar-franja]');
    if (agregar) {
      const dia = agregar.closest('.horario-dia');
      const franjas = dia.querySelector('.franjas');
      const ultima = franjas.querySelector('.horario-franja:last-child [data-fin]')?.value;
      franjas.insertAdjacentHTML('beforeend', ultima ? filaFranja(ultima, '18:00') : filaFranja());
      dia.querySelector('.sin-franjas')?.remove();
    }
    if (quitar) {
      const dia = quitar.closest('.horario-dia');
      quitar.closest('.horario-franja').remove();
      if (!dia.querySelector('.horario-franja')) {
        dia.insertAdjacentHTML('beforeend', '<small class="muted-text sin-franjas">Cerrado</small>');
      }
    }
  });
}

/**
 * Lee las franjas del editor.
 * @param {HTMLElement} contenedor Contenedor.
 * @returns {Array<{dia_semana: number, hora_inicio: string, hora_fin: string}>} Franjas.
 */
export function leerEditorHorario(contenedor) {
  return [...contenedor.querySelectorAll('.horario-dia')].flatMap(dia => [...dia.querySelectorAll('.horario-franja')].map(fila => ({
    dia_semana: Number(dia.dataset.dia),
    hora_inicio: fila.querySelector('[data-inicio]').value,
    hora_fin: fila.querySelector('[data-fin]').value
  })));
}
