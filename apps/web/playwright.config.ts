import { defineConfig, devices } from "@playwright/test";

// Los tests comparten una base de datos con estado mutable (flujo paciente -> orden -> informe -> cobro): workers: 1.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "./test-results",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080",
    channel: "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts$/ },
    {
      name: "chrome",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
      dependencies: ["setup"],
      testIgnore: [/auth\.setup\.ts$/, /responsive\.spec\.ts$/],
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium", channel: "chrome" }, // Chrome instalado: emula viewport/UA de iPhone 13, no WebKit
      dependencies: ["setup"],
      testMatch: /responsive\.spec\.ts$/,
    },
  ],
});
