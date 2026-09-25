/* Pantalla de acceso: marca por empresa, login, errores y decisión de destino (flujo 06). */
import { test, expect } from '@playwright/test';
import { CLAVE, DOMINIO, iniciarSesion, vigilarErrores } from './utilidades.mjs';

test('sin empresa muestra la marca CristaSpa y no ofrece registro', async ({ page }) => {
  const errores = vigilarErrores(page);
  await page.goto('/');
  await expect(page.locator('#auth-title')).toHaveText('CristaSpa');
  await expect(page.getByRole('button', { name: 'Crear cuenta' })).toBeHidden();
  await expect(page.getByText('Ingresa con el enlace que te compartió tu negocio')).toBeVisible();
  expect(errores).toEqual([]);
});

test('con el enlace de la empresa aplica su nombre y colores', async ({ page }) => {
  const errores = vigilarErrores(page);
  await page.goto('/?empresa=demo-spa');
  await expect(page.locator('#auth-title')).toHaveText('Demo Spa Bienestar');
  await expect(page).toHaveTitle(/Demo Spa Bienestar/);
  const primario = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim());
  expect(primario).toBe('#4a3b6b');
  await expect(page.getByRole('button', { name: 'Crear cuenta' })).toBeVisible();
  expect(errores).toEqual([]);
});

test('una empresa inexistente muestra un mensaje neutro', async ({ page }) => {
  await page.goto('/?empresa=no-existe-123');
  await expect(page.getByText('Esta empresa no está disponible')).toBeVisible();
});

test('credenciales incorrectas muestran un error genérico', async ({ page }) => {
  await page.goto('/?empresa=demo-lash');
  await page.fill('#login-correo', `jefe.demo-lash@${DOMINIO}`);
  await page.fill('#login-clave', 'ClaveIncorrecta123');
  await page.click('#vista-login button[type="submit"]');
  await expect(page.locator('#vista-login .form-error')).toHaveText('Correo o contraseña incorrectos.');
});

test('el jefe entra a su módulo', async ({ page }) => {
  await iniciarSesion(page, 'jefe.demo-lash', 'demo-lash');
  await page.waitForURL(/jefe\/html\/index\.html/);
});

test('un miembro de otra empresa ve que no pertenece y puede registrarse como cliente', async ({ page }) => {
  await iniciarSesion(page, 'especialista1.demo-spa', 'demo-lash');
  await expect(page.getByText('Tu cuenta aún no está registrada en Demo Lash Studio')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrarme en Demo Lash Studio' })).toBeVisible();
});

test('un cliente de dos empresas elige a cuál entrar', async ({ page }) => {
  await iniciarSesion(page, 'cliente.multi');
  await expect(page.locator('#vista-selector')).toBeVisible();
  await expect(page.locator('.empresa-opcion')).toHaveCount(2);
  await page.locator('.empresa-opcion', { hasText: 'Demo Spa Bienestar' }).click();
  await page.waitForURL(/usuarios\/html\/index\.html/);
});

test('el developer entra al módulo desarrollador', async ({ page }) => {
  await iniciarSesion(page, 'developer');
  await page.waitForURL(/desarrollador\/html\/index\.html/);
});

test('el registro valida la aceptación de datos antes de enviar', async ({ page }) => {
  await page.goto('/?empresa=demo-lash');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await page.fill('#registro-nombre', 'Prueba');
  await page.fill('#registro-apellido', 'E2E');
  await page.fill('#registro-telefono', '3001234567');
  await page.fill('#registro-correo', `nuevo@${DOMINIO}`);
  await page.fill('#registro-clave', CLAVE);
  await page.click('#vista-registro button[type="submit"]');
  await expect(page.locator('#vista-registro .form-error')).toHaveText('Debes aceptar el tratamiento de datos personales.');
});
