import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import sharp from "sharp";
import { authFile } from "./helpers";

// Valoración virtual: el admin (marcado como odontólogo en la BD de pruebas) crea la solicitud, el paciente sube fotos y video por el enlace público
// (contexto sin sesión, 390 px), el odontólogo pide una foto más, completa y envía el resultado. Datos propios "QA Valoración <sufijo>".
test.use({ storageState: authFile("admin") });
test.describe.configure({ mode: "serial" });

const MAILPIT = "http://127.0.0.1:8025/api/v1";
const SUFIJO = String(Date.now()).slice(-6);
const NOMBRE = `QA Valoración ${SUFIJO}`;
const CORREO = `qa-valoracion-${SUFIJO}@dentview.demo`;
const MOTIVO = `Dolor muela ${SUFIJO}`;
const DIAGNOSTICO = `Caries profunda en molar ${SUFIJO}`;
const SHOTS = process.env.SHOTS_DIR ?? "/private/tmp/claude-502/-Users-andres-Documents-Asygnuz/abf10c37-95db-4ff9-a15f-7828b60fd844/scratchpad/valoracion";
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "val-e2e-"));
const psql = (sql: string) => execFileSync("docker", ["exec", "-i", "dent-view-postgres-1", "psql", "-U", "dentview", "-d", "dentview"], { input: sql, stdio: ["pipe", "pipe", "pipe"] });
const MARCAR = (v: boolean) => `UPDATE "Member" SET "esOdontologo"=${v} WHERE "userId" IN (SELECT id FROM "User" WHERE email='admin@radex.demo') AND "organizationId" IN (SELECT id FROM "Organization" WHERE slug='radex-demo');`;

let valoracionId = "";
let enlace = "";
let codigo = "";
const fotos: string[] = [];
let video = "";
let paciente: BrowserContext;

async function jpg(nombre: string, color: { r: number; g: number; b: number }) {
  const f = path.join(TMP, nombre);
  fs.writeFileSync(f, await sharp({ create: { width: 1600, height: 1200, channels: 3, background: color } }).jpeg().toBuffer());
  return f;
}

async function correo(request: APIRequestContext, para: string, asunto: string, desde: number) {
  let id = "";
  await expect.poll(async () => {
    const lista = await (await request.get(`${MAILPIT}/search?query=${encodeURIComponent(`to:${para} subject:"${asunto}"`)}`)).json();
    id = (lista.messages as { ID: string; Created: string }[]).find((x) => new Date(x.Created).getTime() >= desde)?.ID ?? "";
    return !!id;
  }, { timeout: 30_000 }).toBe(true);
  return (await request.get(`${MAILPIT}/message/${id}`)).json() as Promise<{ Text: string; HTML: string; Subject: string }>;
}

/** Lee enlace y código del diálogo de credenciales del personal y lo cierra. */
async function credenciales(page: Page) {
  const e = (await page.getByTestId("valoracion-enlace").textContent())!.trim();
  const c = (await page.getByTestId("valoracion-codigo").textContent())!.trim();
  await page.getByRole("button", { name: "Listo" }).click();
  return { enlace: e, codigo: c };
}

async function entrar(page: Page, url: string, cod: string) {
  await page.goto(url);
  await page.getByLabel("Código de acceso").fill(cod);
  await page.getByRole("button", { name: "Continuar" }).click();
}
const subir = async (page: Page, etiqueta: string, archivo: string) => {
  await page.getByLabel(etiqueta, { exact: true }).setInputFiles(archivo);
};

test.beforeAll(async ({ browser }: { browser: Browser }) => {
  psql(MARCAR(true));
  psql(`UPDATE "ConfigCentro" SET "tipoCentro"='CENTRO_ODONTOLOGICO' WHERE "organizationId"=(SELECT id FROM "Organization" WHERE slug='radex-demo');`); // valoraciones no existe en un centro radiológico: radex-demo pasa a odontológico durante este spec
  fotos.push(await jpg("frente.jpg", { r: 200, g: 150, b: 130 }), await jpg("sonrisa.jpg", { r: 220, g: 200, b: 190 }), await jpg("oclusal.jpg", { r: 180, g: 120, b: 110 }), await jpg("dolor.jpg", { r: 170, g: 90, b: 90 }));
  video = path.join(TMP, "apertura.mp4");
  execFileSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "testsrc=duration=2:size=320x240:rate=15", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-movflags", "+faststart", video], { stdio: "ignore" });
  // Caja `free` de 3 MB al final: sigue siendo un mp4 válido y obliga a pasar el tope de 2 MB que Caddy aplica al resto de /api.
  const relleno = Buffer.alloc(3_000_000); relleno.writeUInt32BE(relleno.length, 0); relleno.write("free", 4);
  fs.appendFileSync(video, relleno);
  fs.mkdirSync(SHOTS, { recursive: true });
  // Contexto del paciente: sin sesión de staff, móvil 390 px, certificado propio del Caddy local.
  paciente = await browser.newContext({ ignoreHTTPSErrors: true, storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
});
test.afterAll(async () => {
  await paciente?.close();
  try { psql(MARCAR(false)); psql(`UPDATE "ConfigCentro" SET "tipoCentro"='CENTRO_RADIOLOGICO' WHERE "organizationId"=(SELECT id FROM "Organization" WHERE slug='radex-demo');`); } catch { /* sin docker */ }
  fs.rmSync(TMP, { recursive: true, force: true });
});

test("el admin crea la solicitud, se genera enlace + código y el correo no lleva datos del paciente", async ({ page, request }) => {
  const desde = Date.now() - 2000;
  await page.goto("/valoraciones/nueva");
  await page.getByLabel("Nombre", { exact: true }).fill(NOMBRE);
  await page.getByLabel("Teléfono / WhatsApp").fill("3001234567");
  await page.getByLabel("Correo", { exact: true }).fill(CORREO);
  await page.getByLabel("Ciudad donde vive").fill("Bogotá");
  await page.getByLabel("Odontólogo asignado (opcional)").click();
  await page.getByRole("option", { name: "Admin Radex" }).click();
  await page.getByLabel("Motivo de la consulta").fill(MOTIVO);
  await page.getByRole("button", { name: "Crear solicitud y generar enlace" }).click();
  await expect(page.getByTestId("valoracion-enlace")).toBeVisible();
  await expect(page.getByRole("link", { name: "Abrir WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\/573001234567\?text=/);
  ({ enlace, codigo } = await credenciales(page));
  expect(enlace).toMatch(/\/valoracion\/[A-Za-z0-9_-]{43}$/);
  expect(codigo).toMatch(/^\d{6}$/);
  await expect(page).toHaveURL(/\/valoraciones\/(?!nueva)[^/]+$/);
  valoracionId = page.url().split("/").pop()!;
  await expect(page.getByText("Esperando al paciente").first()).toBeVisible();

  // Dos correos separados (enlace / código), sin nombre ni motivo ni datos clínicos.
  const m1 = await correo(request, CORREO, "completa tu valoración", desde);
  const m2 = await correo(request, CORREO, "Código de acceso a tu valoración", desde);
  expect(m1.Text).toContain(`/valoracion/${enlace.split("/").pop()}`);
  expect(m1.Text).not.toContain(codigo);
  expect(m2.Text).toContain(codigo);
  expect(m2.Text).not.toContain("/valoracion/");
  for (const m of [m1, m2]) for (const phi of [NOMBRE, "Valoración " + SUFIJO, MOTIVO, "Bogotá"]) { expect(m.Text).not.toContain(phi); expect(m.HTML).not.toContain(phi); }
});

test("paciente: código incorrecto rechazado con mensaje genérico; sin sesión no se ve nada", async () => {
  const p = await paciente.newPage();
  await entrar(p, enlace, "000000");
  await expect(p.locator("#codigo-error")).toContainText("no son válidos");
  await expect(p.getByText("Cómo funciona")).toHaveCount(0);
  await p.screenshot({ path: `${SHOTS}/01-codigo.png` });
  // Token inexistente: misma respuesta que un código errado.
  await entrar(p, `${enlace.replace(/\/[^/]+$/, "")}/${"a".repeat(43)}`, "123456");
  await expect(p.locator("#codigo-error")).toContainText("no son válidos");
  await p.close();
});

test("paciente: código correcto, consentimiento, fotos y video guiados, y envío", async () => {
  test.setTimeout(120_000);
  const p = await paciente.newPage();
  await entrar(p, enlace, codigo);
  await expect(p.getByText("Cómo funciona")).toBeVisible();
  // Sin consentimiento no hay subida (ni cliente ni servidor).
  await expect(p.getByText("Guarda primero tus datos y tu consentimiento")).toBeVisible();
  await p.screenshot({ path: `${SHOTS}/02-inicio.png`, fullPage: true });

  await expect(p.getByLabel("¿Cuál es el motivo de tu consulta?")).toHaveValue(MOTIVO);
  await p.getByLabel("Alergias (medicamentos, anestesia, látex…)").fill("Ninguna conocida");
  await p.getByRole("checkbox", { name: "Dolor", exact: true }).check();
  // Sin aceptar el consentimiento no se puede continuar.
  await expect(p.getByRole("button", { name: "Guardar y continuar" })).toBeDisabled();
  await p.getByRole("checkbox", { name: "Acepto el tratamiento de mis datos de salud e imágenes" }).check();
  await p.getByRole("button", { name: "Guardar y continuar" }).click();
  await expect(p.getByText("Datos guardados")).toBeVisible();

  await expect(p.getByRole("button", { name: "Enviar valoración" })).toBeDisabled();
  await subir(p, "Elegir de la galería: Rostro de frente", fotos[0]!);
  await expect(p.locator('[data-angulo="FRONTAL_REPOSO"] img[alt^="Vista previa"]')).toBeVisible();
  await subir(p, "Elegir de la galería: Sonrisa", fotos[1]!);
  await expect(p.locator('[data-angulo="SONRISA"] img[alt^="Vista previa"]')).toBeVisible();
  await expect(p.getByText("Sube al menos 3 fotos (llevas 2).")).toBeVisible();
  await subir(p, "Elegir de la galería: Dientes de arriba", fotos[2]!);
  await expect(p.locator('[data-angulo="OCLUSAL_SUPERIOR"] img[alt^="Vista previa"]')).toBeVisible();
  await subir(p, "Elegir de la galería: Video de apertura y mordida", video);
  await expect(p.locator('[data-angulo="VIDEO_APERTURA"] video[aria-label="Vista previa del video"]')).toBeVisible({ timeout: 30_000 });
  // Un archivo que no es video (aunque se llame .mp4) es rechazado por el servidor por su firma real.
  const falso = path.join(TMP, "falso.mp4");
  fs.writeFileSync(falso, "esto no es un video");
  await subir(p, "Elegir de la galería: Video de apertura y mordida", falso);
  await expect(p.getByRole("alert").filter({ hasText: "mp4, mov o webm" })).toBeVisible();
  await p.getByRole("button", { name: "Descartar" }).click();
  await p.screenshot({ path: `${SHOTS}/03-captura.png`, fullPage: true });

  await p.getByLabel("¿Algo más que quieras contarnos? (opcional)").fill("Me duele al masticar frío.");
  await p.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(p.getByText("Mensaje enviado")).toBeVisible();
  const desde = Date.now() - 1000;
  await p.getByRole("button", { name: "Enviar valoración" }).click();
  await expect(p.getByText("Recibimos tu valoración")).toBeVisible();
  await expect(p.getByText("Enviaste 3 fotos y 1 video(s).")).toBeVisible();
  await p.screenshot({ path: `${SHOTS}/04-enviada.png`, fullPage: true });
  await p.close();
  // El aviso al odontólogo no lleva datos del paciente.
  const aviso = await correo(paciente.request, "admin@radex.demo", "Tienes una valoración virtual por revisar", desde);
  expect(aviso.Text).toContain(`/valoraciones/${valoracionId}`);
  for (const phi of [NOMBRE, MOTIVO]) expect(aviso.Text).not.toContain(phi);
});

test("personal: lista con KPI y filtros, detalle en revisión con fotos, video con Range, y sin acceso cruzado", async ({ page, browser }) => {
  await page.goto("/valoraciones?estado=RECIBIDA");
  await expect(page.getByRole("heading", { name: "Valoraciones virtuales", level: 1 })).toBeVisible();
  await expect(page.getByText("Por revisar")).toBeVisible();
  await expect(page.getByText("Tiempo medio de respuesta")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: NOMBRE })).toContainText("Recibida");
  await page.goto("/valoraciones?ciudad=Bogot%C3%A1&estado=CANCELADA"); // filtros en la URL: esta no está cancelada
  await expect(page.getByRole("row").filter({ hasText: NOMBRE })).toHaveCount(0);
  await page.goto("/valoraciones?ciudad=Bogot%C3%A1&estado=RECIBIDA");
  await expect(page.getByRole("row").filter({ hasText: NOMBRE })).toHaveCount(1);

  await page.goto(`/valoraciones/${valoracionId}`);
  await expect(page.getByRole("heading", { name: NOMBRE })).toBeVisible();
  await expect(page.getByText("En revisión", { exact: true }).first()).toBeVisible(); // se marcó al abrir
  await expect(page.getByText(MOTIVO).first()).toBeVisible();
  await expect(page.getByText("Ninguna conocida")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ampliar: Rostro de frente" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ampliar: Sonrisa" })).toBeVisible();
  await expect(page.getByText("Me duele al masticar frío.")).toBeVisible();
  const thumb = await page.getByRole("button", { name: "Ampliar: Rostro de frente" }).locator("img").getAttribute("src");
  expect(thumb).toContain(`/api/valoraciones/${valoracionId}/medios/`);
  await page.getByRole("button", { name: "Ampliar: Rostro de frente" }).click();
  const visor = page.getByRole("dialog");
  await expect(visor.getByRole("button", { name: "Acercar" })).toBeVisible();
  await visor.getByRole("button", { name: "Acercar" }).click();
  await expect(visor.getByText("125%")).toBeVisible();
  await page.keyboard.press("Escape");

  // Video: reproducible y servido con Range (206).
  const src = (await page.locator("video").first().getAttribute("src"))!;
  const r = await page.request.get(src, { headers: { Range: "bytes=0-99" } });
  expect(r.status()).toBe(206);
  expect(r.headers()["content-range"]).toMatch(/^bytes 0-99\//);
  expect(r.headers()["cache-control"]).toContain("no-store");
  expect((await r.body()).length).toBe(100);
  await expect.poll(() => page.locator("video").first().evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  await page.screenshot({ path: `${SHOTS}/05-detalle-staff.png`, fullPage: true });

  // Sin sesión: 401. Otro centro (admin2): 404 aunque conozca ids reales. La cookie del paciente no sirve en rutas de personal.
  const anonimo = await browser.newContext({ ignoreHTTPSErrors: true, storageState: { cookies: [], origins: [] } });
  expect((await anonimo.request.get(new URL(src, page.url()).toString())).status()).toBe(401);
  expect((await paciente.request.get(new URL(src, page.url()).toString())).status()).toBe(401);
  await anonimo.close();
  const otro = await browser.newContext({ storageState: authFile("admin2") });
  expect((await otro.request.get(new URL(src, page.url()).toString())).status()).toBe(404);
  expect((await otro.request.get(new URL(`/valoraciones/${valoracionId}`, page.url()).toString())).status()).toBe(404);
  await otro.close();
  // El doctor remitente no pertenece al módulo.
  const doctor = await browser.newContext({ storageState: authFile("doctor") });
  expect((await doctor.request.get(new URL(src, page.url()).toString())).status()).toBe(401);
  await doctor.close();
});

test("personal: pide una foto concreta, el paciente la sube desde su enlace y reenvía", async ({ page, request }) => {
  test.setTimeout(120_000);
  const desde = Date.now() - 2000;
  await page.goto(`/valoraciones/${valoracionId}`);
  await page.getByLabel("Mensaje al paciente").fill("¿Puedes enviar una foto de la muela que duele?");
  await page.getByLabel("Pedir una foto concreta (opcional)").click();
  await page.getByRole("option", { name: "Zona que te duele" }).click();
  await page.getByRole("button", { name: "Enviar al paciente" }).click();
  ({ enlace, codigo } = await credenciales(page));
  await expect(page.getByText("Requiere más información").first()).toBeVisible();
  await expect(page.getByText("Foto pedida: Zona que te duele")).toBeVisible();
  const m = await correo(request, CORREO, "completa tu valoración", desde);
  expect(m.Text).not.toContain("muela");

  // El enlace anterior dejó de funcionar; el nuevo trae todo lo anterior y resalta lo pedido.
  const p = await paciente.newPage();
  await entrar(p, enlace, codigo);
  await expect(p.getByText("¿Puedes enviar una foto de la muela que duele?")).toBeVisible();
  await expect(p.locator('[data-angulo="ZONA_DOLOR"]')).toContainText("El odontólogo te pidió esta foto.");
  await expect(p.locator('[data-angulo="FRONTAL_REPOSO"] img[alt^="Vista previa"]')).toBeVisible();
  await p.screenshot({ path: `${SHOTS}/06-pedido.png`, fullPage: true });
  await subir(p, "Elegir de la galería: Zona que te duele", fotos[3]!);
  await expect(p.locator('[data-angulo="ZONA_DOLOR"] img[alt^="Vista previa"]')).toBeVisible();
  await p.getByRole("button", { name: "Enviar valoración" }).click();
  await expect(p.getByText("Recibimos tu valoración")).toBeVisible();
  await p.close();
});

test("personal: completa la valoración y envía el resultado; el correo no lleva el diagnóstico y el paciente lo ve tras el código", async ({ page, request }) => {
  test.setTimeout(120_000);
  const desde = Date.now() - 2000;
  await page.goto(`/valoraciones/${valoracionId}`);
  await expect(page.getByRole("button", { name: "Ampliar: Zona que te duele" })).toBeVisible();
  await page.getByLabel("Diagnóstico preliminar").fill(DIAGNOSTICO);
  await page.getByLabel("Recomendaciones").fill("Evitar frío y agendar limpieza y obturación.");
  await page.getByLabel("Tratamiento sugerido").fill("Obturación en resina");
  await page.getByLabel("Presupuesto estimado (COP)").fill("350000");
  await page.getByLabel("Requiere atención presencial").check();
  await page.getByRole("button", { name: "Marcar como completada" }).click();
  await expect(page.getByText("Valoración completada")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Completada", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Agendar cita presencial" })).toHaveAttribute("href", "/agenda");
  await page.getByRole("button", { name: "Enviar resultado al paciente" }).click();
  ({ enlace, codigo } = await credenciales(page));

  const m = await correo(request, CORREO, "tu valoración está lista", desde);
  expect(m.Text).toContain("/valoracion/");
  for (const phi of [DIAGNOSTICO, "Obturación", "350"]) { expect(m.Text).not.toContain(phi); expect(m.HTML).not.toContain(phi); }

  const p = await paciente.newPage();
  await entrar(p, enlace, codigo);
  await expect(p.getByText("Resultado de tu valoración")).toBeVisible();
  await expect(p.getByText(DIAGNOSTICO)).toBeVisible();
  await expect(p.getByText("$ 350.000").or(p.getByText("$350.000"))).toBeVisible();
  await expect(p.getByText("recomienda una valoración presencial")).toBeVisible();
  await p.screenshot({ path: `${SHOTS}/07-resultado.png`, fullPage: true });
  // Ya no se puede subir nada: la subida responde 409.
  const r = await p.request.post(`${enlace.replace("/valoracion/", "/api/valoraciones/publico/")}/archivos`, { multipart: { angulo: "OTRO", archivo: { name: "x.jpg", mimeType: "image/jpeg", buffer: fs.readFileSync(fotos[0]!) } } });
  expect(r.status()).toBe(409);
  await p.close();
});

test("la subida pública sin cookie del enlace es rechazada (401)", async ({ browser }) => {
  const anonimo = await browser.newContext({ ignoreHTTPSErrors: true, storageState: { cookies: [], origins: [] } });
  const r = await anonimo.request.post(`${enlace.replace("/valoracion/", "/api/valoraciones/publico/")}/archivos`, { multipart: { angulo: "OTRO", archivo: { name: "x.jpg", mimeType: "image/jpeg", buffer: fs.readFileSync(fotos[0]!) } } });
  expect(r.status()).toBe(401);
  await anonimo.close();
});
