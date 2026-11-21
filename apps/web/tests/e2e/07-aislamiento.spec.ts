import { expect, test } from "@playwright/test";
import { authFile, leerEstado } from "./helpers";

test.describe("admin de otro centro (admin2) no ve datos de Radex", () => {
  test.use({ storageState: authFile("admin2") });

  for (const [nombre, ruta] of [
    ["ficha de paciente", (e: ReturnType<typeof leerEstado>) => `/pacientes/${e.pacienteId}`],
    ["orden", (e: ReturnType<typeof leerEstado>) => `/ordenes/${e.ordenId}`],
    ["informe", (e: ReturnType<typeof leerEstado>) => `/informes/${e.informeId}`],
    ["cuenta de cobro", (e: ReturnType<typeof leerEstado>) => `/facturacion/${e.facturaId}`],
  ] as const) {
    test(`${nombre} ajena responde 404`, async ({ page }) => {
      const r = await page.goto(ruta(leerEstado()));
      expect(r?.status()).toBe(404);
    });
  }

  test("PDF del informe ajeno no se descarga", async ({ page }) => {
    const r = await page.request.get(`/api/informes/${leerEstado().informeId}/pdf`);
    expect([401, 403, 404]).toContain(r.status());
    expect(r.headers()["content-type"] ?? "").not.toContain("application/pdf");
  });

  test("el paciente y la orden de Radex no aparecen en los listados", async ({ page }) => {
    const { doc, ordenNumero } = leerEstado();
    await page.goto(`/pacientes?q=${doc}`);
    await expect(page.getByRole("heading", { level: 1, name: "Pacientes" })).toBeVisible();
    await expect(page.getByText(doc!)).toHaveCount(0);
    await page.goto(`/ordenes?q=${doc}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(doc!)).toHaveCount(0);
    await page.goto("/ordenes");
    await expect(page.getByRole("link", { name: ordenNumero!, exact: true })).toHaveCount(0);
  });
});

test.describe("doctor remitente", () => {
  test.use({ storageState: authFile("doctor") });

  test("no accede a /pacientes (404)", async ({ page }) => {
    const r = await page.goto("/pacientes");
    expect(r?.status()).toBe(404);
  });

  test("no ve la ficha de un paciente", async ({ page }) => {
    const r = await page.goto(`/pacientes/${leerEstado().pacienteId}`);
    expect(r?.status()).toBe(404);
  });

  test("no ve órdenes ajenas (sin su remisión)", async ({ page }) => {
    const r = await page.goto(`/ordenes/${leerEstado().ordenId}`);
    expect(r?.status()).toBe(404);
    await page.goto("/ordenes");
    await expect(page.getByText(leerEstado().ordenNumero!, { exact: true })).toHaveCount(0);
  });

  test("no ve el informe ajeno ni su PDF", async ({ page }) => {
    const r = await page.goto(`/informes/${leerEstado().informeId}`);
    expect(r?.status()).toBe(404);
    const pdf = await page.request.get(`/api/informes/${leerEstado().informeId}/pdf`);
    expect([401, 403, 404]).toContain(pdf.status());
  });

  test("no accede a módulos de gestión (facturación, cartera, usuarios)", async ({ page }) => {
    for (const ruta of ["/facturacion", "/cartera", "/usuarios", "/catalogo"]) {
      const r = await page.goto(ruta);
      expect(r?.status(), ruta).not.toBe(200);
    }
  });
});
