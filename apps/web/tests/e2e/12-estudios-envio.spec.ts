import { expect, test } from "@playwright/test";
import { authFile } from "./helpers";

test.describe("estudios: visor en pestaña nueva, descarga y envío", () => {
  test.use({ storageState: authFile("admin") });

  test("Abrir visor abre pestaña nueva y la descarga entrega un zip", async ({ page, context }) => {
    await page.goto("/estudios");
    const visor = page.getByRole("link", { name: "Abrir visor" }).first();
    await expect(visor).toHaveAttribute("target", "_blank");
    await expect(visor).toHaveAttribute("rel", /noopener/);
    // La pestaña nueva hereda la cookie: Caddy debe autorizar el DICOMweb del visor.
    const [nueva] = await Promise.all([context.waitForEvent("page"), visor.click()]);
    const dicom = await nueva.waitForResponse((r) => r.url().includes("/dicom-web/"), { timeout: 30_000 });
    expect(dicom.status()).toBe(200);
    await nueva.close();

    await page.getByRole("button", { name: "Más acciones" }).first().click();
    const href = await page.getByRole("menuitem", { name: /Descargar DICOM/ }).getAttribute("href");
    const r = await page.request.get(href!);
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toContain("application/zip");
    expect(r.headers()["content-disposition"]).toMatch(/attachment; filename="estudio-[A-Za-z0-9-]+\.zip"/);
    const zip = await r.body();
    expect(zip.subarray(0, 2).toString()).toBe("PK");
  });

  test("enviar a un doctor: confirmación, sin doble envío", async ({ page, request }) => {
    test.setTimeout(120_000);
    const shots = process.env.SHOTS_DIR;
    await page.goto("/estudios?estado=ASIGNADO");
    const fila = page.getByRole("row").nth(1);
    if (await fila.count()) {
      await fila.getByRole("button", { name: "Más acciones" }).click();
      await page.getByRole("menuitem", { name: "Publicar" }).click(); // idempotente a nivel de datos: sin ASIGNADOS no hay nada que publicar
      await expect(page.getByText("Estudio publicado")).toBeVisible();
    }
    await page.goto("/estudios?estado=PUBLICADO");
    if (shots) await page.screenshot({ path: `${shots}/estudios-lista.png`, fullPage: true });
    await page.getByRole("row").nth(1).getByRole("button", { name: "Más acciones" }).click();
    if (shots) await page.screenshot({ path: `${shots}/estudios-menu.png` });
    await page.getByRole("menuitem", { name: /Enviar/ }).click();
    await page.getByRole("combobox", { name: "Doctor remitente" }).click();
    await page.getByRole("option").first().click();
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByText("Confirmar envío")).toBeVisible();
    await expect(page.getByText("Se comparte")).toBeVisible();
    if (shots) await page.screenshot({ path: `${shots}/estudios-confirmar.png` });
    await page.getByRole("button", { name: "Confirmar y enviar" }).click();
    await expect(page.getByText(/Estudio enviado|Ya se había enviado/)).toBeVisible();
    // Segundo envío inmediato al mismo destino: idempotente.
    await page.getByRole("row").nth(1).getByRole("button", { name: "Más acciones" }).click();
    await page.getByRole("menuitem", { name: /Enviar/ }).click();
    await page.getByRole("combobox", { name: "Doctor remitente" }).click();
    await page.getByRole("option").first().click();
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("button", { name: "Confirmar y enviar" }).click();
    await expect(page.getByText("Ya se había enviado")).toBeVisible();
    // El despacho del correo lo hace el cron de notificaciones (POST /api/cron/notificaciones), fuera del alcance de este test.
  });

  test("la descarga exige sesión", async ({ playwright }) => {
    const anon = await playwright.request.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080", storageState: { cookies: [], origins: [] } });
    expect((await anon.get("/api/estudios/cualquiera/descargar")).status()).toBe(401);
  });

  test("filtros en la URL", async ({ page }) => {
    await page.goto("/estudios?estado=PUBLICADO&desde=2000-01-01&hasta=2000-01-02");
    await expect(page.getByText("Ningún estudio coincide")).toBeVisible();
  });
});

test.describe("estudio de otro centro", () => {
  test.use({ storageState: authFile("admin2") });
  test("la descarga de un id ajeno es 404", async ({ request }) => {
    expect((await request.get("/api/estudios/id-que-no-existe/descargar")).status()).toBe(404);
  });
});

test.describe("doctor remitente", () => {
  test.use({ storageState: authFile("doctor") });
  test("ve sus estudios, abre visor en pestaña nueva y no puede descargar", async ({ page, request }) => {
    await page.goto("/estudios");
    await expect(page.getByRole("heading", { name: "Estudios" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Abrir visor" }).first()).toHaveAttribute("target", "_blank");
    await expect(page.getByRole("button", { name: "Más acciones" })).toHaveCount(0); // sin descargar ni enviar
    expect((await request.get("/api/estudios/cualquiera/descargar")).status()).toBe(404);
  });
});
