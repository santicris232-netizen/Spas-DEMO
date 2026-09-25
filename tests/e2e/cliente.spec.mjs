/* Módulo del cliente: reservar, ver y cancelar una cita (flujo 11). */
import { test, expect } from '@playwright/test';
import { iniciarSesion, vigilarErrores } from './utilidades.mjs';

test('el cliente reserva una cita, la ve en "Mis citas" y la cancela', async ({ page }) => {
  const errores = vigilarErrores(page);
  await iniciarSesion(page, 'cliente.demo-lash', 'demo-lash');
  await page.waitForURL(/usuarios\/html\/index\.html/);
  await expect(page.locator('.brand-name')).toHaveText('Demo Lash Studio');
  await expect(page.locator('#saludo')).toContainText('Hola');

  await page.getByRole('button', { name: 'Reservar', exact: true }).click();
  const servicio = page.locator('#lista-servicios .service-card').filter({ hasText: 'Tinte de Pestañas' });
  await servicio.getByRole('button', { name: 'Agregar' }).click();
  await expect(page.locator('#seleccion-barra')).toBeVisible();
  await expect(page.locator('#seleccion-resumen')).toContainText('1 servicio');

  await page.getByRole('button', { name: 'Elegir horario' }).click();
  await expect(page.locator('#hoja-reserva')).toHaveClass(/active/);
  // Un día con más de 24 h de margen, para que el cliente pueda cancelar.
  await page.locator('#reserva-dias .day-pill:not([disabled])').nth(3).click();
  const hora = page.locator('#reserva-horas .availability-slot').first();
  await expect(hora).toBeVisible();
  const textoHora = (await hora.textContent()).trim();
  await hora.click();
  await page.getByRole('button', { name: 'Confirmar cita' }).click();
  await expect(page.locator('#reserva-titulo')).toHaveText('¡Cita reservada!');
  await expect(page.getByRole('link', { name: 'Avisar por WhatsApp' })).toHaveAttribute('href', /wa\.me\/573000000000\?text=/);

  await page.getByRole('button', { name: 'Ver mis citas' }).click();
  const tarjeta = page.locator('#lista-citas .user-appointment-card').filter({ hasText: 'Tinte de Pestañas' }).filter({ hasText: textoHora });
  await expect(tarjeta).toBeVisible();
  await expect(tarjeta.locator('.status-pill')).toHaveText('Pendiente');

  page.on('dialog', dialogo => dialogo.accept(dialogo.type() === 'prompt' ? 'Prueba automática' : undefined));
  await tarjeta.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.locator('#toast')).toHaveText('Cita cancelada.');

  await page.locator('#pestanas-citas [data-grupo="historial"]').click();
  await expect(page.locator('#lista-citas').getByText('Motivo: Prueba automática').first()).toBeVisible();
  expect(errores).toEqual([]);
});

test('un cliente no puede abrir el módulo del jefe', async ({ page }) => {
  await iniciarSesion(page, 'cliente.demo-lash', 'demo-lash');
  await page.waitForURL(/usuarios\/html\/index\.html/);
  await page.goto('/jefe/html/index.html');
  await page.waitForURL(/usuarios\/html\/index\.html/);
});
