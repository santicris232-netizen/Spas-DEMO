/* Utilidades compartidas de las pruebas E2E. */
import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';

export const DOMINIO = 'demo.cristaspa.app';

/** Contraseña de los usuarios demo (generada por npm run seed:dev en .env.demo). */
export const CLAVE = (() => {
  const coincidencia = readFileSync(new URL('../../.env.demo', import.meta.url), 'utf8').match(/^DEMO_PASSWORD=(.+)$/m);
  if (!coincidencia) {
    throw new Error('Falta .env.demo: ejecuta npm run seed:dev');
  }
  return coincidencia[1].trim();
})();

/**
 * Inicia sesión desde la pantalla de acceso.
 * @param {import('@playwright/test').Page} page Página.
 * @param {string} usuario Parte local del correo demo (jefe.demo-lash).
 * @param {string|null} [slug] Empresa del enlace.
 */
export async function iniciarSesion(page, usuario, slug = null) {
  await page.goto(slug ? `/?empresa=${slug}` : '/');
  await expect(page.locator('#vista-login')).toBeVisible();
  await page.fill('#login-correo', `${usuario}@${DOMINIO}`);
  await page.fill('#login-clave', CLAVE);
  await page.click('#vista-login button[type="submit"]');
}

/**
 * Falla la prueba si la página registra errores de JavaScript o de CSP.
 * @param {import('@playwright/test').Page} page Página.
 * @returns {Array<string>} Lista de errores (se revisa al final).
 */
export function vigilarErrores(page) {
  const errores = [];
  page.on('pageerror', error => errores.push(`pageerror: ${error.message}`));
  page.on('console', mensaje => {
    if (mensaje.type() === 'error' && /Content Security Policy|Refused to|SyntaxError|is not defined|Failed to resolve module/i.test(mensaje.text())) {
      errores.push(`console: ${mensaje.text()}`);
    }
  });
  return errores;
}
