import { defineConfig, devices } from "@playwright/test";

// Suite de humo contra la app DESPLEGADA (no levanta servidor). BASE_URL manda; por defecto, produccion.
// Uso: BASE_URL=https://dentview.asygnuz.com npx playwright test -c playwright.produccion.config.ts
export default defineConfig({
  testDir: "./tests/produccion",
  // Suite vieja (humo-produccion + auth.setup) apunta a usuarios que ya no existen: no se corre.
  testIgnore: [/humo-produccion\.spec\.ts$/, /\/auth\.setup\.ts$/],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 12_000 },
  reporter: [["list"], ["json", { outputFile: "test-results-produccion/resultado.json" }]],
  outputDir: "./test-results-produccion",
  use: {
    baseURL: process.env.BASE_URL ?? "https://dentview.asygnuz.com",
    channel: "chrome",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // ignoreHTTPSErrors: false a proposito: el caso A comprueba que el certificado es valido.
  },
  projects: [
    { name: "setup", testMatch: /demo-auth\.setup\.ts$/ },
    {
      name: "demo",
      use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 900 } },
      dependencies: ["setup"],
      testMatch: /demo-produccion\.spec\.ts$/,
    },
    // Remisiones Lumia <-> Radia (solo lectura). Se loguea solo; usa CLAVE_DEMO y BASE_URL del entorno, sin el proyecto "setup".
    {
      name: "remision",
      use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 900 } },
      testMatch: /remision-produccion\.spec\.ts$/,
    },
  ],
});
