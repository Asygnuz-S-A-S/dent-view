import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { devices, expect, test, type Page } from "@playwright/test";
import { authFile, sinErrorDeApp } from "./helpers";

// CRM: lead -> etapa -> contacto -> plantilla de secuencia -> simulación -> activar -> cron con secreto -> correo en Mailpit con baja funcional.
// Datos propios (sufijo RUN) en radex-demo, limpiados al final. Requiere el stack local con CRON_SECRET y CRM_VENTANA_LIBRE=1 en infra/.env.
const ORG = "4c39bb28-e7f6-4f62-928d-f70339b8aabd"; // radex-demo
const RUN = Date.now().toString(36);
const INTERES = `QA-${RUN}`;
const L1 = { nombre: `QA Lead Consiente ${RUN}`, correo: `qa-crm-${RUN}@example.test` };
const L2 = { nombre: `QA Lead SinConsent ${RUN}`, correo: `qa-crm-sin-${RUN}@example.test` };
const L3 = { nombre: `QA Lead Mover ${RUN}`, correo: `qa-crm-mov-${RUN}@example.test`, tel: "3001234567" };
const MAILPIT = "http://127.0.0.1:8025";
const CAPTURAS = process.env.CAPTURAS_CRM ?? "/private/tmp/claude-502/-Users-andres-Documents-Asygnuz/abf10c37-95db-4ff9-a15f-7828b60fd844/scratchpad/crm";

const sql = (q: string) => execFileSync("docker", ["exec", "-i", "dent-view-postgres-1", "psql", "-U", "dentview", "-d", "dentview", "-tA"], { input: q }).toString().trim();
const secreto = () => process.env.CRON_SECRET ?? /^CRON_SECRET=(.+)$/m.exec(fs.readFileSync(path.resolve("../../infra/.env"), "utf8"))?.[1]?.trim() ?? "";
const foto = (page: Page, nombre: string) => page.screenshot({ path: path.join(CAPTURAS, `${nombre}.png`), fullPage: true });

async function correos(para: string) {
  const r = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${para}`)}`)).json() as { messages: { ID: string; Subject: string }[] };
  return r.messages;
}

test.describe.serial("CRM", () => {
  test.use({ storageState: authFile("admin") });
  let secuenciaId = "";
  test.beforeAll(() => { fs.mkdirSync(CAPTURAS, { recursive: true }); sql(`UPDATE "ConfigCentro" SET "tipoCentro"='CENTRO_ODONTOLOGICO' WHERE "organizationId"=(SELECT id FROM "Organization" WHERE slug='radex-demo');`); }); // el CRM no existe en un centro radiológico
  test.afterAll(() => {
    sql(`UPDATE "ConfigCentro" SET "tipoCentro"='CENTRO_RADIOLOGICO' WHERE "organizationId"=(SELECT id FROM "Organization" WHERE slug='radex-demo');

      DELETE FROM "SecuenciaCRM" WHERE "organizationId"='${ORG}' AND ("creadaPorId" IS NOT NULL) AND id='${secuenciaId}';
      DELETE FROM "Evento" WHERE "organizationId"='${ORG}' AND tipo IN ('crm.baja','crm.secuencia_instalada','crm.secuencia_activada') AND "creadoEn" > now() - interval '30 minutes' AND (detalle::text LIKE '%${secuenciaId || "sin-secuencia-0"}%' OR detalle->>'leadId' IN (SELECT id FROM "Lead" WHERE nombre LIKE '%${RUN}'));
      DELETE FROM "Lead" WHERE "organizationId"='${ORG}' AND nombre LIKE 'QA Lead %${RUN}';`);
  });

  async function crearLead(page: Page, l: { nombre: string; correo: string; tel?: string }, consiente: boolean) {
    await page.goto("/crm/leads");
    await page.getByRole("button", { name: "Nuevo lead" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Nombre", { exact: true }).fill(l.nombre);
    await d.getByLabel("Correo", { exact: true }).fill(l.correo);
    if (l.tel) await d.getByLabel("Teléfono", { exact: true }).fill(l.tel);
    await d.getByLabel("Interés", { exact: true }).fill(l === L3 ? "QA otro" : INTERES);
    if (consiente) await d.getByLabel(/aceptó recibir información comercial/).check();
    await d.getByRole("button", { name: "Crear lead" }).click();
    await expect(page.getByText("Lead creado")).toBeVisible();
    await expect(page.getByRole("link", { name: l.nombre })).toBeVisible();
  }

  test("crear leads con y sin consentimiento y verlos en el tablero", async ({ page }) => {
    await crearLead(page, L1, true);
    await crearLead(page, L2, false);
    await crearLead(page, L3, false);
    const nuevo = page.getByRole("region", { name: "Etapa Nuevo" });
    await expect(nuevo.getByRole("link", { name: L1.nombre })).toBeVisible();
    await sinErrorDeApp(page);
    await foto(page, "01-tablero-escritorio");
  });

  test("mover de etapa, registrar contacto y ver WhatsApp manual", async ({ page }) => {
    await page.goto(`/crm/leads?q=${RUN}`);
    await page.getByLabel(`Mover a: ${L3.nombre}`).selectOption("CONTACTADO");
    await expect(page.getByRole("region", { name: "Etapa Contactado" }).getByRole("link", { name: L3.nombre })).toBeVisible();
    await page.getByRole("link", { name: L3.nombre }).click();
    await expect(page.getByRole("heading", { level: 1, name: L3.nombre })).toBeVisible();
    await expect(page.getByRole("link", { name: /Escribir por WhatsApp/ })).toHaveAttribute("href", /^https:\/\/wa\.me\/573001234567\?text=Hola%20QA/);
    await page.getByLabel("¿Qué se habló?").fill("Quiere agendar valoración");
    await page.getByRole("button", { name: "Registrar contacto" }).click();
    await expect(page.getByText("Contacto registrado")).toBeVisible();
    await expect(page.getByText("Quiere agendar valoración")).toBeVisible();
    await expect(page.getByText("Nuevo → Contactado")).toBeVisible(); // del cambio de etapa del tablero
    await page.getByLabel("Nueva tarea").fill("Llamar mañana");
    await page.getByRole("button", { name: "Crear tarea" }).click();
    await expect(page.getByText("Tarea creada", { exact: true })).toBeVisible();
    await foto(page, "02-ficha-lead-escritorio");
    expect(sql(`SELECT count(*) FROM "ActividadLead" WHERE "leadId" IN (SELECT id FROM "Lead" WHERE nombre='${L3.nombre}')`)).toBe("4");
  });

  test("instalar plantilla, filtrar, simular y activar", async ({ page }) => {
    await page.goto("/crm/secuencias");
    await page.getByRole("button", { name: /Instalar plantilla: Seguimiento de lead nuevo/ }).click();
    await expect(page).toHaveURL(/\/crm\/secuencias\/[^/]+$/);
    secuenciaId = page.url().split("/").pop()!;
    await expect(page.getByTestId("paso")).toHaveCount(4);
    await page.getByLabel("Interés contiene (opcional)").fill(INTERES);
    await page.getByRole("button", { name: "Guardar secuencia" }).click();
    await expect(page.getByText("Secuencia guardada")).toBeVisible();
    // Vista previa con la marca del centro
    await page.getByRole("button", { name: "Vista previa" }).first().click();
    await expect(page.frameLocator("iframe[title='Vista previa del correo']").getByText(/Hola, Ana/)).toBeVisible();
    await page.keyboard.press("Escape");
    // Simulación (sin enviar): la que consintió se enviaría; la otra se omitiría
    await page.getByRole("button", { name: "Simular" }).click();
    const sim = page.getByTestId("simulacion");
    await expect(sim).toContainText(L1.nombre);
    await expect(sim).toContainText("Enviaría el correo");
    await expect(sim).toContainText(L2.nombre);
    await expect(sim).toContainText("Se omitiría: sin consentimiento");
    await page.keyboard.press("Escape");
    expect(sql(`SELECT count(*) FROM "InscripcionSecuencia" WHERE "secuenciaId"='${secuenciaId}'`)).toBe("0"); // simular no escribe
    await page.getByRole("switch", { name: /^Activar / }).click();
    await expect(page.getByText("Secuencia activada")).toBeVisible();
    await foto(page, "03-secuencia-escritorio");
  });

  test("cron: 401 sin secreto, 200 con secreto; envía al consentido y omite al otro", async ({ request, page }) => {
    expect((await request.post("/api/cron/crm")).status()).toBe(401);
    expect((await request.post("/api/cron/crm", { headers: { authorization: "Bearer incorrecto" } })).status()).toBe(401);
    const h = { authorization: `Bearer ${secreto()}` };
    expect((await request.post("/api/cron/crm", { headers: h })).status()).toBe(200); // inscribe
    expect(sql(`SELECT count(*) FROM "InscripcionSecuencia" WHERE "secuenciaId"='${secuenciaId}'`)).toBe("2");
    // Idempotencia: otra pasada no duplica.
    expect((await request.post("/api/cron/crm", { headers: h })).status()).toBe(200);
    expect(sql(`SELECT count(*) FROM "InscripcionSecuencia" WHERE "secuenciaId"='${secuenciaId}'`)).toBe("2");
    // Se adelanta el primer paso (esperaba 1 día) y se ejecuta.
    sql(`UPDATE "InscripcionSecuencia" SET "proximaEjecucion" = now() - interval '1 minute' WHERE "secuenciaId"='${secuenciaId}'`);
    const r = await request.post("/api/cron/crm", { headers: h });
    expect(r.status()).toBe(200);
    await expect.poll(() => sql(`SELECT count(*) FROM "EjecucionPaso" e JOIN "InscripcionSecuencia" i ON i.id=e."inscripcionId" JOIN "Lead" l ON l.id=i."leadId" WHERE i."secuenciaId"='${secuenciaId}' AND e.estado='ENVIADO' AND l.nombre='${L1.nombre}'`)).toBe("1");
    expect(sql(`SELECT e.detalle FROM "EjecucionPaso" e JOIN "InscripcionSecuencia" i ON i.id=e."inscripcionId" JOIN "Lead" l ON l.id=i."leadId" WHERE i."secuenciaId"='${secuenciaId}' AND e.estado='OMITIDO' AND l.nombre='${L2.nombre}'`)).toMatch(/^sin_consentimiento/);
    // Nada más sale el mismo día al mismo destinatario aunque se adelante el siguiente paso (límite de 24 h).
    expect(await correos(L2.correo)).toHaveLength(0);
    await page.goto(`/crm/secuencias`);
    await expect(page.getByTestId("secuencia").first()).toContainText("Enviados");
  });

  test("el correo llega a Mailpit con enlace de baja funcional y sin datos clínicos", async ({ page }) => {
    let msgs: Awaited<ReturnType<typeof correos>> = [];
    await expect.poll(async () => (msgs = await correos(L1.correo)).length, { timeout: 15_000 }).toBeGreaterThan(0);
    expect(msgs).toHaveLength(1);
    const m = await (await fetch(`${MAILPIT}/api/v1/message/${msgs[0]!.ID}`)).json() as { Text: string; HTML: string };
    expect(m.Text).toMatch(/Hola, QA/);
    expect(m.Text).not.toMatch(/diagn|caries|endodoncia/i);
    const baja = /https?:\/\/[^\s"]+\/baja\/[\w.-]+/.exec(m.Text)?.[0];
    expect(baja, "el correo debe traer el enlace de baja").toBeTruthy();
    const url = new URL(baja!);
    // Un token alterado no sirve.
    await page.goto(`/baja/${url.pathname.split("/").pop()}x`);
    await expect(page.getByText(/no es válido/i).first()).toBeVisible();
    // Abrir el enlace NO da de baja; hace falta confirmar.
    await page.goto(url.pathname);
    await expect(page.getByRole("heading", { name: "Dejar de recibir mensajes" })).toBeVisible();
    expect(sql(`SELECT "noContactar" FROM "Lead" WHERE nombre='${L1.nombre}'`)).toBe("f");
    await foto(page, "04-baja-escritorio");
    await page.getByRole("button", { name: /Confirmar: no quiero recibir/ }).click();
    await expect(page.getByRole("status")).toContainText("ya no recibirás mensajes");
    expect(sql(`SELECT "noContactar"::text||'|'||"consentimientoMercadeo"::text FROM "Lead" WHERE nombre='${L1.nombre}'`)).toBe("true|false");
    expect(sql(`SELECT count(*) FROM "Evento" WHERE "organizationId"='${ORG}' AND tipo='crm.baja' AND detalle->>'leadId' IN (SELECT id FROM "Lead" WHERE nombre='${L1.nombre}')`)).toBe("1");
    expect(sql(`SELECT estado::text||'|'||"motivoFin" FROM "InscripcionSecuencia" i JOIN "Lead" l ON l.id=i."leadId" WHERE i."secuenciaId"='${secuenciaId}' AND l.nombre='${L1.nombre}'`)).toBe("CANCELADA|no_contactar");
  });

  test("panel, tareas y fidelización cargan; capturas escritorio", async ({ page }) => {
    for (const [ruta, h1, foto_] of [["/crm", "CRM", "05-panel"], ["/crm/tareas", "Tareas del CRM", "06-tareas"], ["/crm/fidelizacion", "Fidelización", "07-fidelizacion"], ["/crm/leads?vista=lista", "Leads", "08-lista"]] as const) {
      await page.goto(ruta);
      await expect(page.getByRole("heading", { level: 1, name: h1 })).toBeVisible();
      await sinErrorDeApp(page);
      await foto(page, `${foto_}-escritorio`);
    }
    await page.goto("/crm/tareas");
    await expect(page.getByText("Llamar mañana")).toBeVisible();
  });

  test("capturas móvil sin desbordar horizontalmente", async ({ browser }) => {
    const ctx = await browser.newContext({ ...devices["iPhone 13"], storageState: authFile("admin") });
    const page = await ctx.newPage();
    for (const [ruta, nombre] of [["/crm", "panel"], ["/crm/leads", "tablero"], ["/crm/secuencias", "secuencias"], ["/crm/fidelizacion", "fidelizacion"]] as const) {
      await page.goto(ruta);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      const ancho = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(ancho, `${ruta} no debe desbordar`).toBeLessThanOrEqual(1);
      await foto(page, `09-${nombre}-movil`);
    }
    await ctx.close();
  });

  test.describe("doctor remitente", () => {
    test.use({ storageState: authFile("doctor") });
    test("no ve el CRM (404)", async ({ page }) => {
      const r = await page.goto("/crm");
      expect(r?.status()).toBe(404);
    });
  });
});
