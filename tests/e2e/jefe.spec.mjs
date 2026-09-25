/* Módulo del jefe y modo recepción (flujo 09). */
import { test, expect } from '@playwright/test';
import { iniciarSesion, vigilarErrores } from './utilidades.mjs';

/** Próximo miércoles a 7+ días (YYYY-MM-DD), siempre dentro del horario L–S. */
function proximoMiercoles() {
  const fecha = new Date(Date.now() + 7 * 86400000);
  while (fecha.getDay() !== 3) {
    fecha.setDate(fecha.getDate() + 1);
  }
  return fecha.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

test('el jefe recorre todas las secciones sin errores', async ({ page }) => {
  const errores = vigilarErrores(page);
  await iniciarSesion(page, 'jefe.demo-lash', 'demo-lash');
  await page.waitForURL(/jefe\/html\/index\.html/);
  await expect(page.locator('#rol-kicker')).toHaveText('Jefe');
  await expect(page.locator('#checklist .checklist')).toBeVisible();

  await page.getByRole('button', { name: 'Clientes', exact: true }).click();
  await expect(page.locator('#clientes-lista .cliente-tarjeta').first()).toBeVisible();

  await page.getByRole('button', { name: 'Catálogo', exact: true }).click();
  await expect(page.locator('#catalogo-lista .management-card')).toHaveCount(10);
  await page.locator('#catalogo-pestanas [data-sub="categorias"]').click();
  await expect(page.locator('#catalogo-lista .management-card')).toHaveCount(3);

  await page.getByRole('button', { name: 'Equipo', exact: true }).click();
  await expect(page.locator('#equipo-lista .management-card')).toHaveCount(2);
  await page.locator('#equipo-pestanas [data-sub="miembros"]').click();
  await expect(page.locator('#equipo-lista .management-card')).toHaveCount(2);

  await page.getByRole('button', { name: 'Mi empresa', exact: true }).click();
  await expect(page.locator('#empresa-qr')).toHaveAttribute('src', /^data:image\/png/);
  await expect(page.locator('#empresa-enlace')).toHaveValue(/\?empresa=demo-lash/);
  await expect(page.locator('#form-horario-empresa .horario-franja')).toHaveCount(6);

  await page.getByRole('button', { name: 'Reportes', exact: true }).click();
  await expect(page.locator('#reportes-contenido .stat-tile')).toHaveCount(4);
  expect(errores).toEqual([]);
});

test('el jefe agenda una cita para un cliente y la cancela', async ({ page }) => {
  const errores = vigilarErrores(page);
  await iniciarSesion(page, 'jefe.demo-lash', 'demo-lash');
  await page.waitForURL(/jefe\/html\/index\.html/);
  await expect(page.locator('#agenda-titulo')).not.toBeEmpty();

  await page.getByRole('button', { name: '+ Nueva cita' }).click();
  await page.fill('#cita-cliente-busqueda', 'Cliente');
  await page.locator('#cita-clientes [data-cliente]').first().click();
  await page.locator('.servicios-seleccion label', { hasText: 'Henna de Cejas' }).locator('input').check();
  const fecha = proximoMiercoles();
  await page.fill('#cita-fecha', fecha);
  await page.locator('#cita-fecha').dispatchEvent('change');
  await page.locator('#cita-horas [data-inicio]').first().click();
  await page.fill('#cita-notas', 'Creada por prueba E2E');
  await page.getByRole('button', { name: 'Guardar cita' }).click();
  await expect(page.locator('#toast')).toHaveText('Cita guardada.');

  // Ir al día de la cita y cancelarla.
  for (let i = 0; i < 20 && !(await page.locator('#agenda-lista').getByText('Creada por prueba E2E').count()); i++) {
    await page.locator('#agenda-siguiente').click();
    await page.waitForTimeout(400);
  }
  const tarjeta = page.locator('#agenda-lista .management-card').filter({ hasText: 'Creada por prueba E2E' });
  await expect(tarjeta).toBeVisible();
  await expect(tarjeta.locator('.status-pill')).toHaveText('Confirmada');
  page.on('dialog', dialogo => dialogo.accept(dialogo.type() === 'prompt' ? 'Limpieza E2E' : undefined));
  await tarjeta.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.locator('#toast')).toHaveText('Cita cancelada.');
  expect(errores).toEqual([]);
});

test('recepción solo ve Agenda y Clientes', async ({ page }) => {
  const errores = vigilarErrores(page);
  await iniciarSesion(page, 'recepcion.demo-lash', 'demo-lash');
  await page.waitForURL(/jefe\/html\/index\.html/);
  await expect(page.locator('#rol-kicker')).toHaveText('Recepción');
  await expect(page.getByRole('button', { name: 'Agenda', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clientes', exact: true })).toBeVisible();
  for (const seccion of ['Catálogo', 'Equipo', 'Mi empresa', 'Reportes']) {
    await expect(page.getByRole('button', { name: seccion, exact: true })).toBeHidden();
  }
  await expect(page.locator('#checklist')).toBeHidden();
  await page.getByRole('button', { name: 'Clientes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Exportar CSV' })).toBeHidden();
  expect(errores).toEqual([]);
});
