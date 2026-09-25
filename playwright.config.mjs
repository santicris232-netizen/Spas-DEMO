/*
  CristaSpa - pruebas E2E en navegador (npm run test:e2e).
  Corren contra el proyecto Supabase de desarrollo con los usuarios de npm run seed:dev.
*/
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    ...devices['Pixel 7'],
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173/',
    reuseExistingServer: true,
    timeout: 20_000
  }
});
