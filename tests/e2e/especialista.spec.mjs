/* Módulo del especialista: agenda semanal, precios ocultos y ausencias (flujo 10). */
import { test, expect } from '@playwright/test';
import { iniciarSesion, vigilarErrores } from './utilidades.mjs';

test('el especialista ve sus citas de la próxima semana sin precios', async ({ page }) => {
  const errores = vigilarErrores(page);
  await iniciarSesion(page, 'especialista1.demo-lash', 'demo-lash');
  await page.waitForURL(/empleado\/html\/index\.html/);
  await expect(page.locator('#empleado-nombre')).toHaveText('Valentina Ríos');
  await expect(page.locator('#resumen .summary-item')).toHaveCount(3);

  await page.locator('[data-rango="semana"]').click();
  await page.locator('#dia-siguiente').click();
  const tarjetas = page.locator('#lista-citas .employee-appointment-card');
  await expect(tarjetas.first()).toBeVisible();
  await expect(page.locator('#lista-citas')).not.toContainText('$');
  expect(errores).toEqual([]);
});

test('el especialista crea y elimina una ausencia', async ({ page }) => {
  await iniciarSesion(page, 'especialista2.demo-lash', 'demo-lash');
  await page.waitForURL(/empleado\/html\/index\.html/);
  await expect(page.locator('#resumen .summary-item')).toHaveCount(3);
  await page.getByRole('button', { name: 'Ausencias' }).click();

  const fecha = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  await page.fill('#ausencia-desde', fecha);
  await page.fill('#ausencia-hasta', fecha);
  await page.fill('#ausencia-motivo', 'Prueba E2E');
  await page.getByRole('button', { name: 'Bloquear agenda' }).click();
  await expect(page.locator('#toast')).toHaveText('Agenda bloqueada.');

  const ausencia = page.locator('#lista-ausencias .card').filter({ hasText: 'Prueba E2E' });
  await expect(ausencia).toBeVisible();
  page.on('dialog', dialogo => dialogo.accept());
  await ausencia.getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.locator('#toast')).toHaveText('Ausencia eliminada.');
  await expect(ausencia).toHaveCount(0);
});
