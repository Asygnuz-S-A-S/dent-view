import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { expect as esperar, test, type Page } from "@playwright/test";
import { authFile } from "./helpers";

const expect = esperar.configure({ timeout: 30_000 }); // el stack local lo comparten varios agentes y responde lento

// Facturación electrónica (FEV) con el proveedor SIMULADO (FEV_SIMULADO=1 en infra/.env, solo localhost). Crea y limpia sus propios datos.
test.use({ storageState: authFile("admin") });
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const SUFIJO = String(Date.now()).slice(-8);
const PACIENTE = `QA FEV ${SUFIJO}`;
const SECRETO = `whsec_qa${SUFIJO}`;
const CRON = process.env.CRON_SECRET ?? "local-cron-secret-dentview";
const psql = (sql: string) => execFileSync("docker", ["exec", "-i", "dent-view-postgres-1", "psql", "-U", "dentview", "-d", "dentview", "-At"], { input: sql, stdio: ["pipe", "pipe", "pipe"] }).toString().trim();
const aviso = (page: Page, t: string | RegExp) => page.locator("[data-sonner-toast]").filter({ hasText: t }).first();
const est: { facturaId?: string; conexionId?: string; pagada?: string; docId?: string } = {};

async function crearCuenta(page: Page, valor: string): Promise<string> {
  await page.goto("/facturacion/nueva");
  await page.getByRole("combobox", { name: "Paciente" }).click();
  await page.getByRole("option", { name: new RegExp(PACIENTE, "i") }).click();
  await page.getByLabel("Descripción del ítem 1").fill("Radiografía panorámica QA");
  await page.getByLabel("Valor del ítem 1").fill(valor);
  await page.getByRole("button", { name: "Crear cuenta de cobro" }).click();
  await expect(page).toHaveURL(/\/facturacion\/(?!nueva)[^/]+$/, { timeout: 45_000 });
  return page.url().split("/").pop()!;
}
async function escenario(page: Page, etiqueta: string) {
  await page.goto("/integraciones/facturacion");
  const t = page.locator('[data-conexion-fe="SIMULADO"]');
  await t.getByRole("combobox", { name: "Escenario simulado" }).click();
  await page.getByRole("option", { name: etiqueta, exact: true }).click();
  await t.getByRole("button", { name: "Guardar ajustes" }).click();
  await expect(aviso(page, "Ajustes guardados")).toBeVisible();
}

test.afterAll(() => {
  // Los documentos y notas son solo-inserta para la app: se limpian con el dueño de la base.
  psql(`DELETE FROM "Evento" WHERE "pacienteId" IN (SELECT id FROM "PacienteTenant" WHERE nombre='${PACIENTE}');
DELETE FROM "DocumentoElectronico" WHERE "facturaId" IN (SELECT f.id FROM "Factura" f JOIN "PacienteTenant" p ON p.id=f."pacienteId" WHERE p.nombre='${PACIENTE}');
DELETE FROM "NotaCredito" WHERE "facturaId" IN (SELECT f.id FROM "Factura" f JOIN "PacienteTenant" p ON p.id=f."pacienteId" WHERE p.nombre='${PACIENTE}');
DELETE FROM "Factura" WHERE "pacienteId" IN (SELECT id FROM "PacienteTenant" WHERE nombre='${PACIENTE}');
DELETE FROM "PacienteTenant" WHERE nombre='${PACIENTE}';
DELETE FROM "Persona" WHERE id='qafev${SUFIJO}';
DELETE FROM "ConexionFE" WHERE "organizationId"=(SELECT id FROM "Organization" WHERE slug='radex-demo') AND proveedor='SIMULADO';
DELETE FROM "ConfigFacturacion" WHERE "organizationId"=(SELECT id FROM "Organization" WHERE slug='radex-demo');`);
});

test("sin conexión ni datos del facturador la cuenta de cobro funciona como siempre", async ({ page }) => {
  psql(`DELETE FROM "ConexionFE" WHERE proveedor='SIMULADO' AND "organizationId"=(SELECT id FROM "Organization" WHERE slug='radex-demo');`);
  await page.goto("/integraciones/facturacion");
  await expect(page.getByRole("navigation", { name: "Secciones de integraciones" }).getByRole("link", { name: "Facturación electrónica" })).toBeVisible();
  // El paciente se crea por SQL: este spec no depende de la pantalla de pacientes (zona de otros).
  psql(`INSERT INTO "Persona" (id,"tipoDocumento","numeroDocumento",nombre) VALUES ('qafev${SUFIJO}','CC','${SUFIJO}7','${PACIENTE}');
INSERT INTO "PacienteTenant" (id,"organizationId","personaId",nombre) VALUES ('qafevp${SUFIJO}',(SELECT id FROM "Organization" WHERE slug='radex-demo'),'qafev${SUFIJO}','${PACIENTE}');`);
  est.facturaId = await crearCuenta(page, "80000");
  await expect(page.getByText("Factura electrónica", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Emitir factura electrónica" })).toHaveCount(0);
  await page.getByRole("button", { name: "Registrar abono" }).click();
  await page.getByRole("dialog", { name: "Registrar abono" }).getByLabel(/^Valor/).fill("10000");
  await page.getByRole("dialog", { name: "Registrar abono" }).getByRole("button", { name: "Registrar" }).click();
  await expect(aviso(page, "Abono registrado")).toBeVisible();
  await page.goto("/facturacion");
  await expect(page.getByRole("columnheader", { name: "FEV" })).toHaveCount(0);
});

test("datos del facturador: el dígito de verificación se calcula y el NIT solo admite dígitos", async ({ page }) => {
  await page.goto("/integraciones/facturacion");
  await page.getByLabel("NIT (sin dígito de verificación)").fill("90a0123456");
  await expect(page.getByLabel("NIT (sin dígito de verificación)")).toHaveValue("900123456");
  await expect(page.getByTestId("fe-dv")).toHaveText("8");
  await expect(page.getByText(/contador o abogado/)).toBeVisible();
  await page.getByLabel("Razón social").fill("Centro Dental QA SAS");
  await page.getByLabel("Prefijo de la factura").fill("SETP");
  await page.getByLabel("Emitir factura electrónica").check();
  await page.getByRole("button", { name: "Guardar datos" }).click();
  await expect(aviso(page, "DV 8")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Razón social")).toHaveValue("Centro Dental QA SAS");
  await expect(page.getByLabel("Emitir factura electrónica")).toBeChecked();
});

test("conexión simulada: credenciales cifradas (solo últimos 4), webhook y Siigo 'No probado'", async ({ page }) => {
  await page.goto("/integraciones/facturacion");
  await expect(page.locator('[data-conexion-fe="SIIGO"]').getByText("No probado", { exact: true })).toBeVisible();
  const t = page.locator('[data-conexion-fe="SIMULADO"]');
  await expect(t.getByText("Simulado", { exact: true })).toBeVisible();
  await t.getByLabel(/Secreto del webhook/).fill(SECRETO);
  expect(await t.getByLabel(/Secreto del webhook/).getAttribute("type")).toBe("password");
  await t.getByRole("button", { name: "Probar conexión" }).click();
  await expect(aviso(page, "Conexión simulada")).toBeVisible();
  await t.getByRole("button", { name: "Guardar y conectar" }).click();
  await expect(aviso(page, "Proveedor conectado")).toBeVisible();
  await expect(t.getByText(`••••${SECRETO.slice(-4)}`)).toBeVisible();
  expect(await page.content()).not.toContain(SECRETO);
  const url = await t.getByRole("textbox", { name: /URL del webhook/ }).inputValue();
  expect(url).toMatch(/\/api\/fe\/simulado\/[A-Za-z0-9_-]+$/);
  est.conexionId = url.split("/").pop();
  // Producción bloqueada para un proveedor no probado/simulado.
  await t.getByRole("button", { name: "Rotar credenciales" }).click();
  await t.getByRole("combobox", { name: "Modo" }).click();
  await expect(page.getByRole("option", { name: /Producción/ })).toHaveAttribute("data-disabled", "");
  await page.keyboard.press("Escape");
});

test("emitir FEV: ACEPTADA con CUFE, número DIAN, PDF y XML descargables", async ({ page }) => {
  await page.goto(`/facturacion/${est.facturaId}`);
  await expect(page.getByText("Aún no se emitió la factura electrónica")).toBeVisible();
  await page.getByRole("button", { name: "Emitir factura electrónica" }).click();
  await expect(aviso(page, "Documento aceptado")).toBeVisible();
  const sec = page.locator('[data-seccion="fev"]');
  await expect(sec.getByText("Aceptada", { exact: true })).toBeVisible();
  await expect(sec.getByTestId("fe-cufe")).toHaveText(/^[0-9a-f]{96}$/);
  await expect(sec.getByText(/N\.º DIAN\s+SIM\d{8}/)).toBeVisible();
  const pdf = await page.request.get(await sec.getByRole("link", { name: "Descargar PDF" }).evaluate((a) => (a as HTMLAnchorElement).href));
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  const xml = await page.request.get(await sec.getByRole("link", { name: "Descargar XML" }).evaluate((a) => (a as HTMLAnchorElement).href));
  expect(xml.status()).toBe(200);
  expect(await xml.text()).toContain("SIMULADO — SIN VALIDEZ FISCAL");
  est.docId = (await sec.getByRole("link", { name: "Descargar PDF" }).getAttribute("href"))!.split("/")[4];
  // Idempotente: recargar no ofrece emitir de nuevo y la cuenta ya no se anula.
  await page.reload();
  await expect(page.getByRole("button", { name: "Emitir factura electrónica" })).toHaveCount(0);
  await expect(page.getByText(/no se anula: se corrige con una nota crédito electrónica/)).toBeVisible();
  await page.goto("/facturacion");
  await expect(page.getByRole("columnheader", { name: "FEV" })).toBeVisible();
  await expect(page.locator(`tr:has(a[href="/facturacion/${est.facturaId}"])`)).toContainText("Aceptada");
});

test("nota crédito electrónica sobre una factura pagada", async ({ page }) => {
  await page.goto(`/facturacion/${est.facturaId}`);
  await page.getByRole("button", { name: "Registrar abono" }).click();
  const ab = page.getByRole("dialog", { name: "Registrar abono" });
  await ab.getByLabel(/^Valor/).fill("70000");
  await ab.getByRole("button", { name: "Registrar" }).click();
  await expect(aviso(page, "Abono registrado")).toBeVisible();
  await page.getByRole("button", { name: "Nota crédito" }).click();
  const dlg = page.getByRole("dialog", { name: "Nota crédito" });
  await dlg.getByLabel(/^Valor/).fill("20000");
  await dlg.getByLabel(/^Motivo/).fill("Descuento pactado con el paciente");
  await dlg.getByRole("button", { name: "Crear nota crédito" }).click();
  await expect(aviso(page, "Nota crédito creada")).toBeVisible();
  await page.reload();
  const nota = page.locator("[data-nota]").first();
  await expect(nota).toContainText("NC-");
  await expect(nota.getByText("Aceptada", { exact: true })).toBeVisible();
  await expect(nota.getByRole("link", { name: "PDF" })).toBeVisible();
  await expect(page.getByRole("row", { name: /^Total/ })).toContainText("$ 60.000"); // la nota interna se conserva y reduce el total
});

test("rechazo simulado con mensaje legible y reintento exitoso", async ({ page }) => {
  const id = await crearCuenta(page, "50000");
  await escenario(page, "Rechazar");
  await page.goto(`/facturacion/${id}`);
  await page.getByRole("button", { name: "Emitir factura electrónica" }).click();
  await expect(aviso(page, "El documento fue rechazado")).toBeVisible();
  const sec = page.locator('[data-seccion="fev"]');
  await expect(sec.getByText("Rechazada", { exact: true })).toBeVisible();
  await expect(sec.getByRole("alert")).toContainText("Rechazo simulado");
  // Historial con filtro por estado.
  await page.goto("/integraciones/facturacion?estado=RECHAZADA");
  await expect(page.locator("[data-documento]").first()).toContainText("Rechazada");
  await escenario(page, "Aceptar");
  await page.goto(`/facturacion/${id}`);
  await sec.getByRole("button", { name: "Reintentar" }).click();
  await expect(aviso(page, "Documento aceptado")).toBeVisible();
  await expect(sec.getByText("Aceptada", { exact: true })).toBeVisible();
});

test("error transitorio: queda Enviando y el cron lo completa; con CRON_SECRET incorrecto responde 401", async ({ page, playwright }) => {
  const id = await crearCuenta(page, "40000");
  await escenario(page, "Error transitorio");
  await page.goto(`/facturacion/${id}`);
  await page.getByRole("button", { name: "Emitir factura electrónica" }).click();
  await expect(aviso(page, "esperando confirmación")).toBeVisible();
  const sec = page.locator('[data-seccion="fev"]');
  await expect(sec.getByText("Enviando", { exact: true })).toBeVisible();
  await escenario(page, "Aceptar");
  psql(`UPDATE "DocumentoElectronico" SET "proximoIntento"=now()-interval '1 minute' WHERE "facturaId"='${id}';`);
  const api = await playwright.request.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080", storageState: undefined });
  expect((await api.post("/api/cron/fe", { headers: { authorization: "Bearer mal" } })).status()).toBe(401);
  const r = await api.post("/api/cron/fe", { headers: { authorization: `Bearer ${CRON}` } });
  expect(r.status()).toBe(200);
  await api.dispose();
  await page.goto(`/facturacion/${id}`);
  await expect(sec.getByText("Aceptada", { exact: true })).toBeVisible();
});

test("webhook firmado: 401 con firma mala, aplica el estado con la buena y es idempotente", async ({ page, playwright }) => {
  const id = await crearCuenta(page, "30000");
  await escenario(page, "Procesando (se resuelve al consultar)");
  await page.goto(`/facturacion/${id}`);
  await page.getByRole("button", { name: "Emitir factura electrónica" }).click();
  await expect(aviso(page, "esperando confirmación")).toBeVisible();
  const idExterno = psql(`SELECT "idExterno" FROM "DocumentoElectronico" WHERE "facturaId"='${id}';`);
  expect(idExterno).toMatch(/^SIM-/);
  const cuerpo = JSON.stringify({ idExterno, estado: "ACEPTADA", cufe: "f".repeat(96), numeroDian: "SIMWH0001", mensajes: [] });
  const api = await playwright.request.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080", storageState: undefined });
  const firma = (s: string) => createHmac("sha256", s).update(cuerpo).digest("hex");
  const enviar = (f: string, ruta = `/api/fe/simulado/${est.conexionId}`) => api.post(ruta, { data: cuerpo, headers: { "content-type": "application/json", "x-fe-signature": f } });
  expect((await enviar(firma("otro"))).status()).toBe(401);
  expect((await enviar(firma(SECRETO), "/api/fe/simulado/noexiste")).status()).toBe(401);
  expect((await enviar(firma(SECRETO))).status()).toBe(200);
  const otra = await enviar(firma(SECRETO));
  expect(await otra.json()).toMatchObject({ duplicado: true });
  await api.dispose();
  await page.goto(`/facturacion/${id}`);
  await expect(page.locator('[data-seccion="fev"]').getByText("Aceptada", { exact: true })).toBeVisible();
  await expect(page.getByTestId("fe-cufe")).toHaveText("f".repeat(96));
});

test("precondición: con RIPS activado una cuenta manual sin CUPS no se emite", async ({ page }) => {
  await page.goto("/integraciones/facturacion");
  await page.getByLabel("Código de prestador (REPS, 12 dígitos)").fill("110010000101");
  await page.getByLabel("Generar RIPS").check();
  await page.getByRole("button", { name: "Guardar datos" }).click();
  await expect(aviso(page, "DV 8")).toBeVisible();
  const id = await crearCuenta(page, "20000");
  await page.getByRole("button", { name: "Emitir factura electrónica" }).click();
  await expect(aviso(page, /Falta el código CUPS/)).toBeVisible();
  await page.goto("/integraciones/facturacion");
  await page.getByLabel("Generar RIPS").uncheck();
  await page.getByRole("button", { name: "Guardar datos" }).click();
  await expect(aviso(page, "DV 8")).toBeVisible();
  await escenario(page, "Aceptar"); // el test anterior dejó «Procesando»
  await page.goto(`/facturacion/${id}`);
  await page.getByRole("button", { name: "Emitir factura electrónica" }).click();
  await expect(aviso(page, "Documento aceptado")).toBeVisible();
});

test("permisos: el doctor remitente no accede y otro centro no ve ni descarga documentos", async ({ browser }) => {
  const doctor = await browser.newContext({ storageState: authFile("doctor") });
  const p = await doctor.newPage();
  const r = await p.goto("/integraciones/facturacion");
  expect(r?.status() === 404 || !p.url().includes("/integraciones/facturacion")).toBeTruthy();
  expect((await doctor.request.get(`/api/fe/documentos/${est.docId}/pdf`)).status()).toBe(401);
  await doctor.close();
  const otro = await browser.newContext({ storageState: authFile("admin2") });
  expect((await otro.request.get(`/api/fe/documentos/${est.docId}/pdf`)).status()).toBe(404);
  const p2 = await otro.newPage();
  await p2.goto("/integraciones/facturacion");
  await expect(p2.locator("[data-documento]")).toHaveCount(0);
  await otro.close();
});

test("conexión desactivada: la cuenta nueva no ofrece emitir y todo sigue igual", async ({ page }) => {
  await page.goto("/integraciones/facturacion");
  await page.locator('[data-conexion-fe="SIMULADO"]').getByRole("switch").click();
  await expect(aviso(page, "Desactivada")).toBeVisible();
  await crearCuenta(page, "10000");
  await expect(page.getByText(/No hay un proveedor de facturación electrónica activo/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Emitir factura electrónica" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Registrar abono" })).toBeVisible();
});
