import { expect, test } from "@playwright/test";
import { authFile, guardarEstado, leerEstado } from "./helpers";

test.use({ storageState: authFile("admin") });
test.describe.configure({ mode: "serial" });

test("crear orden con 2 servicios y entrega digital; el total suma los precios", async ({ page }) => {
  const { nombre } = leerEstado();
  await page.goto("/ordenes/nueva");
  await page.getByRole("combobox", { name: "Paciente" }).click();
  await page.getByPlaceholder("Nombre o documento").fill(leerEstado().doc!);
  await page.getByRole("option").filter({ hasText: leerEstado().doc! }).click();
  await expect(page.getByRole("radio", { name: "Digital" })).toBeChecked();
  await page.getByRole("checkbox", { name: "Panorámica", exact: true }).check();
  await page.getByRole("checkbox", { name: "Tomografía 1 zona", exact: true }).check();
  await expect(page.getByRole("complementary")).toContainText("$ 190.000");
  await page.getByRole("button", { name: "Crear orden" }).click();
  await expect(page).toHaveURL(/\/ordenes\/(?!nueva)[^/]+$/);
  guardarEstado({ ordenId: page.url().split("/").pop() });
  const titulo = await page.getByRole("heading", { level: 1, name: /Orden #/ }).innerText();
  guardarEstado({ ordenNumero: titulo.match(/#\d+/)![0] });
  await expect(page.getByText("Solicitada").first()).toBeVisible();
  await expect(page.getByText("Digital", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("row", { name: /Total/ })).toContainText("$ 190.000");
  await expect(page.getByRole("link", { name: nombre!.toLowerCase(), exact: false })).toBeVisible();
});

test("avanzar estados hasta Tomada", async ({ page }) => {
  await page.goto(`/ordenes/${leerEstado().ordenId}`);
  await page.getByRole("button", { name: "Marcar como agendada" }).click();
  await expect(page.getByText("Agendada", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Marcar como tomada" })).toBeVisible();
  await page.getByRole("button", { name: "Marcar como tomada" }).click();
  await expect(page.getByText("Tomada", { exact: true })).toBeVisible();
  await expect(page.getByText("Orden tomada")).toBeVisible();
});

test("redactar y emitir el informe", async ({ page }) => {
  await page.goto(`/ordenes/${leerEstado().ordenId}`);
  await page.getByRole("button", { name: "Redactar informe" }).click();
  await expect(page).toHaveURL(/\/informes\/[^/]+$/);
  await expect(page.getByRole("heading", { level: 1, name: /Informe #/ })).toBeVisible();
  guardarEstado({ informeId: page.url().split("/").pop() });
  await expect(page.getByText("Borrador", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Motivo de la remisión" }).fill("Evaluación QA automatizada");
  await page.getByRole("textbox", { name: "Hallazgos" }).fill("Hallazgos de prueba E2E sin alteraciones.");
  await page.getByRole("textbox", { name: "Impresión diagnóstica" }).fill("Estudio dentro de límites normales (QA).");
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  // Confirmación obligatoria: "Seguir editando" no emite; "Firmar y emitir" sí.
  await page.getByRole("button", { name: "Firmar y emitir" }).click();
  const confirmacion = page.getByRole("alertdialog", { name: "¿Firmar y emitir el informe?" });
  await expect(confirmacion).toBeVisible();
  await confirmacion.getByRole("button", { name: "Seguir editando" }).click();
  await expect(confirmacion).toBeHidden();
  await expect(page.getByText("Borrador", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Firmar y emitir" }).click();
  await confirmacion.getByRole("button", { name: "Firmar y emitir" }).click();
  await expect(page.getByText("Emitido", { exact: true })).toBeVisible();
  const cod = await page.getByText(/código [A-Z0-9]{10}/).innerText();
  guardarEstado({ codigo: cod.match(/código ([A-Z0-9]{10})/)![1] });
});

test("descargar PDF del informe emitido", async ({ page }) => {
  const { informeId } = leerEstado();
  const r = await page.request.get(`/api/informes/${informeId}/pdf`);
  expect(r.status()).toBe(200);
  expect(r.headers()["content-type"]).toContain("application/pdf");
  expect((await r.body()).subarray(0, 4).toString()).toBe("%PDF");
  await page.goto(`/informes/${informeId}`);
  await expect(page.getByRole("link", { name: "Descargar PDF" })).toHaveAttribute("href", `/api/informes/${informeId}/pdf`);
});

test("verificación pública /verificar/<código> sin sesión", async ({ browser }) => {
  // El enlace usa el origen HTTPS local (BETTER_AUTH_URL) con la CA interna de Caddy: el navegador de prueba no la conoce.
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const r = await page.goto(`/verificar/${leerEstado().codigo}`);
  expect(r?.status()).toBe(200);
  await expect(page.getByText(/Application error/i)).toHaveCount(0);
  await expect(page.getByText("Informe auténtico")).toBeVisible();
  await expect(page.getByText("Admin Radex")).toBeVisible();
  await page.screenshot({ path: "../../docs/qa/evidencias/verificar-codigo.png" });
  // Código con formato válido pero inexistente: 404 real (no soft-404).
  const inexistente = await page.goto("/verificar/ABCDEFGHIJ");
  expect(inexistente?.status()).toBe(404);
  await ctx.close();
});

test("entrega de resultados: enlace + código de 6 dígitos, acceso público y PDF", async ({ page, browser }) => {
  await page.goto(`/informes/${leerEstado().informeId}`);
  await page.getByRole("button", { name: "Entregar resultados" }).click();
  await page.getByRole("button", { name: "Generar y enviar" }).click();
  const dlg = page.getByRole("dialog");
  const campos = dlg.locator("input[readonly]");
  await expect(campos).toHaveCount(2);
  const enlace = await campos.nth(0).inputValue();
  const codigo = await campos.nth(1).inputValue();
  expect(enlace).toMatch(/\/resultados\/[\w-]+$/);
  expect(codigo).toMatch(/^\d{6}$/);
  // Hoja imprimible: oculta en pantalla, visible al imprimir, con QR, enlace y código.
  await expect(dlg.getByRole("button", { name: "Imprimir hoja" })).toBeEnabled();
  const hoja = page.locator("#hoja-entrega");
  await expect(hoja).toBeHidden();
  await page.emulateMedia({ media: "print" });
  await expect(hoja.getByRole("img", { name: "Código QR del enlace de resultados" })).toBeVisible();
  await expect(hoja).toContainText(codigo);
  await expect(hoja).toContainText(enlace);
  await page.screenshot({ path: "../../docs/qa/evidencias/hoja-entrega-impresion.png" });
  await page.emulateMedia({ media: "screen" });
  // El enlace usa el origen HTTPS local (BETTER_AUTH_URL) con la CA interna de Caddy: el navegador de prueba no la conoce.
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] }, ignoreHTTPSErrors: true });
  const pub = await ctx.newPage();
  const r = await pub.goto(enlace);
  expect(r?.status()).toBe(200);
  await expect(pub.getByRole("heading", { name: "Resultados de su estudio" })).toBeVisible();
  await pub.getByLabel("Código de acceso").fill("000000");
  await pub.getByRole("button", { name: "Ver resultados" }).click();
  await expect(pub.getByText("El enlace o el código no son válidos, o ya vencieron.")).toBeVisible();
  await pub.getByLabel("Código de acceso").fill(codigo);
  await pub.getByRole("button", { name: "Ver resultados" }).click();
  const pdf = pub.getByRole("link", { name: "Descargar PDF" });
  await expect(pdf).toBeVisible();
  const resp = await pub.request.get((await pdf.getAttribute("href"))!);
  expect(resp.status()).toBe(200);
  expect(resp.headers()["content-type"]).toContain("application/pdf");
  await pub.screenshot({ path: "../../docs/qa/evidencias/resultados-paciente.png" });
  await ctx.close();
});
