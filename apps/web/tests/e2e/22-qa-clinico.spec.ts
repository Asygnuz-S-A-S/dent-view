import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { authFile } from "./helpers";

// QA clínico y de entrega: datos propios (estudio sintético en la BD, estación de ingesta) creados y borrados aquí.
test.describe.configure({ mode: "serial" });

const SUFIJO = String(Date.now()).slice(-8);
const EST_ID = `qaclin${SUFIJO}`;
const EST_UID = `1.2.826.0.1.3680043.8.498.77.${SUFIJO}`;
const ESTACION_ID = `qaest${SUFIJO}`;
const psql = (sql: string) => execFileSync("docker", ["exec", "-i", "dent-view-postgres-1", "psql", "-U", "dentview", "-d", "dentview", "-At"], { input: sql, stdio: ["pipe", "pipe", "pipe"] }).toString().trim();
let pacienteId = "";
let orgId = "";

test.beforeAll(() => {
  orgId = psql(`SELECT id FROM "Organization" WHERE slug='radex-demo';`);
  pacienteId = psql(`SELECT id FROM "PacienteTenant" WHERE "organizationId"='${orgId}' ORDER BY "creadoEn" LIMIT 1;`);
  // StudyDate DICOM = fecha sin hora, guardada a medianoche UTC (como el worker).
  psql(`INSERT INTO "Estudio" (id,"organizationId","pacienteId","studyInstanceUid","orthancId",modalidad,descripcion,"fechaEstudio",estado,"actualizadoEn")
        VALUES ('${EST_ID}','${orgId}','${pacienteId}','${EST_UID}','qa-orthanc-${SUFIJO}','CT','QA clinico ${SUFIJO}','2026-03-15 00:00:00','PUBLICADO',now());`);
});

test.afterAll(() => {
  psql(`DELETE FROM "EnlaceEntrega" WHERE "estudioUids" @> ARRAY['${EST_UID}']::text[];
        DELETE FROM "Informe" WHERE "estudioId"='${EST_ID}';
        DELETE FROM "Estudio" WHERE id='${EST_ID}';
        DELETE FROM "EstacionIngesta" WHERE id='${ESTACION_ID}';`);
});

test.describe("subidas grandes a través de Caddy", () => {
  test.use({ storageState: authFile("admin") });

  test("una foto de 3 MB se sube (el tope de 2 MB de la API no aplica a /api/imagenes)", async ({ request, baseURL }) => {
    const ruido = randomBytes(2400 * 1800 * 3);
    const jpg = await sharp(ruido, { raw: { width: 2400, height: 1800, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
    expect(jpg.length).toBeGreaterThan(2 * 1024 * 1024);
    const r = await request.post("/api/imagenes", { headers: { Origin: baseURL! }, multipart: { pacienteId, archivos: { name: "qa-grande.jpg", mimeType: "image/jpeg", buffer: jpg } } });
    expect(r.status()).toBe(200);
    expect((await r.json()).subidas).toBe(1);
    psql(`DELETE FROM "ImagenEstudio" WHERE "pacienteId"='${pacienteId}' AND "nombreOriginal"='qa-grande.jpg';`);
  });

  test("la ingesta de una estación acepta cuerpos de más de 2 MB (CBCT)", async ({ request }) => {
    const token = randomBytes(32).toString("base64url");
    psql(`INSERT INTO "EstacionIngesta" (id,"organizationId",nombre,"tokenHash",activa) VALUES ('${ESTACION_ID}','${orgId}','QA clinico ${SUFIJO}','${createHash("sha256").update(token).digest("hex")}',true);`);
    // Cuerpo no válido a propósito: la app responde 415 (contenido no es DICOM/ZIP), nunca 413 de Caddy.
    const r = await request.post("/api/ingesta", { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/zip" }, data: randomBytes(3 * 1024 * 1024) });
    expect(r.status()).toBe(415);
  });
});

test.describe("doctor remitente", () => {
  test.use({ storageState: authFile("doctor") });
  test("una página prohibida responde 404 con un solo <main>", async ({ page }) => {
    await page.goto("/notificaciones");
    await expect(page.getByRole("heading", { name: "No encontramos esta página" })).toBeVisible();
    await expect(page.locator("main")).toHaveCount(1);
  });
});

test.describe("móvil 390 px", () => {
  test.use({ storageState: authFile("admin"), viewport: { width: 390, height: 844 } });
  test("el menú de acciones del estudio queda dentro de la pantalla", async ({ page }) => {
    await page.goto("/estudios");
    const boton = page.getByRole("row").filter({ hasText: `QA clinico ${SUFIJO}` }).getByRole("button", { name: "Más acciones" });
    await expect(boton).toBeVisible();
    const caja = (await boton.boundingBox())!;
    expect(caja.x + caja.width).toBeLessThanOrEqual(390);
  });
});

test.describe("informe y entrega", () => {
  test.use({ storageState: authFile("admin") });
  test("mensaje en español al pasarse del límite; la fecha del estudio no se corre un día en la página pública", async ({ page, browser }) => {
    test.setTimeout(120_000);
    await page.goto("/estudios");
    const fila = page.getByRole("row").filter({ hasText: `QA clinico ${SUFIJO}` });
    await fila.getByRole("button", { name: "Más acciones" }).click();
    await page.getByRole("menuitem", { name: /Informar este estudio|Ver informe/ }).click();
    await page.waitForURL(/\/informes\/[^/]+$/);

    await page.getByLabel("Motivo de la remisión").fill("x".repeat(2001));
    await page.getByRole("button", { name: "Guardar borrador" }).click();
    await expect(page.getByText("El motivo admite máximo 2000 caracteres")).toBeVisible();

    await page.getByLabel("Motivo de la remisión").fill("Dolor <b>molar</b> & \"tildes\" áéíóú ñ");
    await page.getByLabel("Hallazgos").fill("Hallazgos de prueba QA sin alteraciones.");
    await page.getByLabel("Impresión diagnóstica").fill("Estudio normal (QA).");
    await page.getByRole("button", { name: "Firmar y emitir" }).first().click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Firmar y emitir" }).click();
    await expect(page.getByText("Informe emitido")).toBeVisible();

    // Entrega: el diálogo muestra enlace y código una sola vez.
    await page.getByRole("button", { name: "Entregar resultados" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByLabel("Destinatario").fill("QA Destinatario");
    await dlg.getByLabel(/Correo/).fill("");
    await dlg.getByLabel("Vence en (días)").fill("1.5");
    await dlg.getByRole("button", { name: "Generar y enviar" }).click();
    await expect(page.getByText("El vencimiento debe ser un número entero de días")).toBeVisible();
    await dlg.getByLabel("Vence en (días)").fill("2");
    await dlg.getByRole("button", { name: "Generar y enviar" }).click();
    const enlace = await dlg.getByLabel("Enlace", { exact: true }).inputValue();
    const codigo = await dlg.getByLabel("Código", { exact: true }).inputValue();

    const publico = await browser.newContext({ storageState: { cookies: [], origins: [] }, baseURL: new URL(enlace).origin, ignoreHTTPSErrors: true });
    const p = await publico.newPage();
    await p.goto(enlace);
    await p.getByLabel("Código de acceso").fill("000000" === codigo ? "111111" : "000000");
    await p.getByRole("button").first().click();
    await expect(p.getByRole("alert").first()).toContainText("no son válidos");
    await p.getByLabel("Código de acceso").fill(codigo);
    await p.getByRole("button").first().click();
    await expect(p.getByRole("heading", { name: "Resultados de su estudio" })).toBeVisible();
    await expect(p.getByText(/15 de marzo de 2026/).first()).toBeVisible();
    await expect(p.getByText(/14 de marzo de 2026/)).toHaveCount(0);
    const pdf = await p.request.get(`/api/resultados/${enlace.split("/").pop()}/pdf`);
    expect(pdf.status()).toBe(200);
    await publico.close();
  });
});
