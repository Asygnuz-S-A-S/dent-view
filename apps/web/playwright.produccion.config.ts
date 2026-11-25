import { defineConfig, devices } from "@playwright/test";

// Suite de humo contra la app DESPLEGADA (no levanta servidor). BASE_URL manda; por defecto, produccion.
// Uso: BASE_URL=https://dentview.asygnuz.com npx playwright test -c playwright.produccion.config.ts
export default defineConfig({
  testDir: "./tests/produccion",
  fullyParallel: false,
  workers: 1,
  retries: 1,
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
    { name: "setup", testMatch: /auth\.setup\.ts$/ },
    {
      name: "chrome",
      use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 900 } },
      dependencies: ["setup"],
      testMatch: /humo-produccion\.spec\.ts$/,
      grepInvert: /@movil/,
    },
    {
      name: "movil",
      use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
      dependencies: ["setup"],
      testMatch: /humo-produccion\.spec\.ts$/,
      grep: /@movil/,
    },
  ],
});
