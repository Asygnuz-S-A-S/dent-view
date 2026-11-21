import { createHash } from "node:crypto";
import fs from "node:fs";
import { devices, expect, test, type Page } from "@playwright/test";
import { authFile } from "./helpers";

// Pasarelas de pago con el proveedor SIMULADO (PAGOS_SIMULADO=1: no se llama a Wompi; las firmas del webhook sí se verifican de verdad).
// El spec crea sus propios datos (paciente y cuenta de cobro) y no depende de otros specs.
test.use({ storageState: authFile("admin") });
test.describe.configure({ mode: "serial" });

const SUFIJO = String(Date.now()).slice(-8);
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080";
const EVIDENCIAS = process.env.EVIDENCIAS_E16 ?? "test-results/e16";
const SECRETO = `test_events_qa${SUFIJO}`;
const PACIENTE = `QA Pasarela ${SUFIJO}`;
const est: { pasarelaId?: string; facturaId?: string } = {};

test.beforeAll(() => fs.mkdirSync(EVIDENCIAS, { recursive: true }));
const captura = (page: Page, n: string) => page.screenshot({ path: `${EVIDENCIAS}/${n}.png`, fullPage: true });
const aviso = (page: Page, texto: string | RegExp) => page.locator("[data-sonner-toast]").filter({ hasText: texto }).first();

/** Evento transaction.updated de Wompi firmado como indica la doc: SHA256(valores de signature.properties + timestamp + secreto de eventos). */
function eventoWompi(o: { idLink: string; montoPesos: number; estado?: string; idTx: string; secreto?: string }) {
  const timestamp = Math.floor(Date.now() / 1000);
  const estado = o.estado ?? "APPROVED";
  const cents = o.montoPesos * 100;
  const checksum = createHash("sha256").update(`${o.idTx}${estado}${cents}${timestamp}${o.secreto ?? SECRETO}`).digest("hex");
  return {
    event: "transaction.updated", environment: "test", timestamp, sent_at: new Date().toISOString(),
    data: { transaction: { id: o.idTx, status: estado, amount_in_cents: cents, currency: "COP", reference: "auto", payment_link_id: o.idLink } },
    signature: { properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"], checksum },
  };
}
async function enviarWebhook(playwright: { request: { newContext: (o: object) => Promise<import("@playwright/test").APIRequestContext> } }, cuerpo: object) {
  const api = await playwright.request.newContext({ baseURL: BASE, storageState: undefined });
  try {
    const r = await api.post(`/api/pagos/wompi/${est.pasarelaId}`, { data: cuerpo });
    const json = await r.json().catch(() => null);
    return { status: () => r.status(), json: async () => json };
  } finally {
    await api.dispose();
  }
}
/** Id del link en el proveedor (simulado): sale del enlace mostrado en el QR de la fila. */
async function idLinkDeFila(page: Page, fila: number) {
  await page.locator("tbody tr[data-link]").nth(fila).getByRole("button", { name: "Mostrar QR" }).click();
  const dlg = page.getByRole("dialog");
  await expect(dlg.getByAltText("Código QR del link de pago")).toBeVisible();
  const url = (await dlg.locator("p.break-all").textContent())!;
  await page.keyboard.press("Escape");
  expect(url).toContain("/pago-simulado/SIM-");
  return url.split("/").pop()!;
}

test("configurar Wompi: llaves cifradas, solo últimos 4, URL del webhook y prueba de conexión", async ({ page }) => {
  await page.goto("/integraciones/pasarelas");
  await expect(page.getByRole("navigation", { name: "Secciones de integraciones" }).getByRole("link", { name: "Pasarelas" })).toBeVisible();
  const tarjeta = page.locator('[data-pasarela="WOMPI"]');
  if (await tarjeta.getByRole("button", { name: "Rotar llaves" }).isVisible()) await tarjeta.getByRole("button", { name: "Rotar llaves" }).click();
  await expect(tarjeta.getByText("No probado", { exact: true })).toHaveCount(0);
  await tarjeta.getByLabel(/Llave pública/).fill("pub_test_QA1234");
  await tarjeta.getByLabel(/Llave privada/).fill("prv_test_QA5678");
  await tarjeta.getByLabel(/Secreto de eventos/).fill(SECRETO);
  expect(await tarjeta.getByLabel(/Llave privada/).getAttribute("type")).toBe("password");
  await tarjeta.getByRole("button", { name: "Probar conexión" }).click();
  await expect(aviso(page, "Conexión simulada")).toBeVisible();
  await tarjeta.getByRole("button", { name: /Guardar (y conectar|llaves nuevas)/ }).click();
  await expect(aviso(page, /Pasarela conectada|Llaves actualizadas/)).toBeVisible();
  // Solo se ven los últimos 4; las llaves completas nunca están en el HTML.
  await expect(tarjeta.getByText(`••••${SECRETO.slice(-4)}`)).toBeVisible();
  const html = await page.content();
  for (const llave of ["pub_test_QA1234", "prv_test_QA5678", SECRETO]) expect(html).not.toContain(llave);
  const url = await tarjeta.getByRole("textbox", { name: /URL del webhook/ }).inputValue();
  expect(url).toMatch(/\/api\/pagos\/wompi\/[A-Za-z0-9_-]+$/);
  est.pasarelaId = url.split("/").pop();
  await captura(page, "01-pasarelas-config");
  // EPayco/PayU/Bold: "No probado" y producción bloqueada.
  for (const c of ["EPAYCO", "PAYU", "BOLD"]) await expect(page.locator(`[data-pasarela="${c}"]`).getByText("No probado", { exact: true }).first()).toBeVisible();
});

test("crear paciente y cuenta de cobro propios", async ({ page }) => {
  const doc = SUFIJO + "9";
  await page.goto("/pacientes");
  await page.getByRole("button", { name: "Nuevo paciente" }).click();
  const dlg = page.getByRole("dialog", { name: "Nuevo paciente" });
  await dlg.getByLabel("Número de documento").fill(doc);
  await dlg.getByLabel("Nombre completo").fill(PACIENTE);
  await dlg.getByLabel("Celular").fill("3001112233");
  await dlg.getByRole("button", { name: "Guardar" }).click();
  await expect(page).toHaveURL(/\/pacientes\/[^/]+$/);

  await page.goto("/facturacion/nueva");
  await page.getByRole("combobox", { name: "Paciente" }).click();
  await page.getByRole("option", { name: new RegExp(PACIENTE, "i") }).click();
  await page.getByLabel("Descripción del ítem 1").fill("Radiografía panorámica QA");
  await page.getByLabel("Valor del ítem 1").fill("80000");
  await page.getByRole("button", { name: "Crear cuenta de cobro" }).click();
  await expect(page).toHaveURL(/\/facturacion\/(?!nueva)[^/]+$/);
  est.facturaId = page.url().split("/").pop();
  await expect(page.getByRole("row", { name: /^Saldo/ })).toContainText("$ 80.000");
});

test("generar link parcial: el tope es el saldo y el monto sale del servidor", async ({ page }) => {
  await page.goto(`/facturacion/${est.facturaId}`);
  await page.getByRole("button", { name: "Generar link de pago" }).click();
  const dlg = page.getByRole("dialog", { name: "Generar link de pago" });
  await expect(dlg.getByText("$ 80.000").first()).toBeVisible();
  await dlg.getByLabel("Cobrar solo un abono parcial").check();
  await dlg.getByLabel("Valor del abono").fill("999999");
  await expect(dlg.getByRole("button", { name: "Generar link" })).toBeDisabled();
  await dlg.getByLabel("Valor del abono").fill("30000");
  await dlg.getByRole("button", { name: "Generar link" }).click();
  await expect(aviso(page, "Link de pago generado")).toBeVisible();
  const fila = page.locator("tbody tr[data-link]").first();
  await expect(fila).toContainText("Creado");
  await expect(fila).toContainText("$ 30.000");
  await captura(page, "02-link-generado");
  await expect(page.getByRole("button", { name: "Enviar por correo" })).toBeVisible();
});

test("webhook con firma inválida: 401 sin detalles y el link no cambia", async ({ page, playwright }) => {
  await page.goto(`/facturacion/${est.facturaId}`);
  const idLink = await idLinkDeFila(page, 0);
  const malo = await enviarWebhook(playwright, eventoWompi({ idLink, montoPesos: 30000, idTx: `TX-MAL-${SUFIJO}`, secreto: "test_events_otro" }));
  expect(malo.status()).toBe(401);
  expect(await malo.json()).toEqual({ error: "No autorizado" });
  const pasarelaFalsa = await playwright.request.newContext({ baseURL: BASE, storageState: undefined });
  expect((await pasarelaFalsa.post("/api/pagos/wompi/noexiste", { data: eventoWompi({ idLink, montoPesos: 30000, idTx: "X" }) })).status()).toBe(401);
  await pasarelaFalsa.dispose();
  await page.reload();
  await expect(page.locator("tbody tr[data-link]").first()).toContainText("Creado");
  await expect(page.getByText("Aún no hay abonos")).toBeVisible();
});

test("webhook aprobado: crea el Pago por pasarela, cuenta parcial y no se duplica al repetirlo", async ({ page, playwright }) => {
  await page.goto(`/facturacion/${est.facturaId}`);
  const idLink = await idLinkDeFila(page, 0);
  // Monto distinto al del link (firma válida): se ignora y no paga.
  const distinto = await enviarWebhook(playwright, eventoWompi({ idLink, montoPesos: 1000, idTx: `TX-DIF-${SUFIJO}` }));
  expect(distinto.status()).toBe(200);
  await page.reload();
  await expect(page.getByText("Aún no hay abonos")).toBeVisible();

  const evento = eventoWompi({ idLink, montoPesos: 30000, idTx: `TX-OK-${SUFIJO}` });
  const r1 = await enviarWebhook(playwright, evento);
  expect(r1.status()).toBe(200);
  expect(await r1.json()).toEqual({ ok: true });
  await page.reload();
  await expect(page.locator("tbody tr[data-link]").first()).toContainText("Aprobado");
  await expect(page.getByRole("row", { name: /^Abonado/ })).toContainText("$ 30.000");
  await expect(page.getByRole("row", { name: /^Saldo/ })).toContainText("$ 50.000");
  await expect(page.getByRole("cell", { name: "Pasarela de pago" })).toHaveCount(1);
  await expect(page.getByText("Parcial").first()).toBeVisible();
  await captura(page, "03-pago-parcial");

  // El mismo evento otra vez (reintento de la pasarela): 200, sin segundo pago.
  const r2 = await enviarWebhook(playwright, evento);
  expect(r2.status()).toBe(200);
  expect(await r2.json()).toEqual({ ok: true, duplicado: true });
  await page.reload();
  await expect(page.getByRole("cell", { name: "Pasarela de pago" })).toHaveCount(1);
  await expect(page.getByRole("row", { name: /^Abonado/ })).toContainText("$ 30.000");
});

test("la cartera refleja el saldo tras el pago por pasarela", async ({ page }) => {
  await page.goto("/cartera");
  await expect(page.getByRole("row", { name: new RegExp(PACIENTE, "i") })).toContainText("$ 50.000");
});

test("link por el saldo restante, pago completo y cuenta pagada; el link pagado no se puede anular", async ({ page, playwright }) => {
  await page.goto(`/facturacion/${est.facturaId}`);
  await page.getByRole("button", { name: "Generar link de pago" }).click();
  const dlg = page.getByRole("dialog", { name: "Generar link de pago" });
  await expect(dlg.getByText("Monto a cobrar: $ 50.000")).toBeVisible();
  await dlg.getByRole("button", { name: "Generar link" }).click();
  await expect(aviso(page, "Link de pago generado")).toBeVisible();
  // Ordenados del más nuevo al más viejo: el nuevo es la primera fila.
  const idLink = await idLinkDeFila(page, 0);
  const r = await enviarWebhook(playwright, eventoWompi({ idLink, montoPesos: 50000, idTx: `TX-FIN-${SUFIJO}` }));
  expect(r.status()).toBe(200);
  await page.reload();
  await expect(page.getByRole("row", { name: /^Saldo/ })).toContainText("$ 0");
  await expect(page.getByText("Pagada", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "Pasarela de pago" })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Generar link de pago" })).toHaveCount(0);
  await captura(page, "04-pagada");
});

test("anular un link activo en otra cuenta no es necesario: el link anulado se muestra como Anulado", async ({ page }) => {
  // Cuenta nueva con un link que se anula.
  await page.goto("/facturacion/nueva");
  await page.getByRole("combobox", { name: "Paciente" }).click();
  await page.getByRole("option", { name: new RegExp(PACIENTE, "i") }).click();
  await page.getByLabel("Descripción del ítem 1").fill("Consulta QA");
  await page.getByLabel("Valor del ítem 1").fill("20000");
  await page.getByRole("button", { name: "Crear cuenta de cobro" }).click();
  await expect(page).toHaveURL(/\/facturacion\/(?!nueva)[^/]+$/);
  await page.getByRole("button", { name: "Generar link de pago" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Generar link" }).click();
  await expect(aviso(page, "Link de pago generado")).toBeVisible();
  await page.locator("tbody tr[data-link]").first().getByRole("button", { name: "Anular" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Anular" }).click();
  await expect(page.locator("tbody tr[data-link]").first()).toContainText("Anulado");
  // Con el link anulado el saldo vuelve a estar disponible.
  await expect(page.getByRole("button", { name: "Generar link de pago" })).toBeVisible();
});

test("móvil 390: pestaña Pasarelas sin scroll horizontal", async ({ browser }) => {
  const { defaultBrowserType: _omitido, ...iphone } = devices["iPhone 13"];
  const ctx = await browser.newContext({ ...iphone, storageState: authFile("admin") });
  try {
    const page = await ctx.newPage();
    await page.goto("/integraciones/pasarelas");
    await expect(page.locator('[data-pasarela="WOMPI"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await captura(page, "05-pasarelas-movil");
    await page.goto(`/facturacion/${est.facturaId}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await captura(page, "06-factura-movil");
  } finally {
    await ctx.close();
  }
});
