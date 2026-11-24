import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { authFile } from "./helpers";

// QA de CRM, seguimiento, integraciones, API v1, MCP, webhooks, pasarelas y planificador.
// Crea un centro de cada tipo ("QA integraciones <tipo> <SUF>") como superadmin, recorre las pantallas de la zona en 1440 y 390,
// claro y oscuro (sin errores de consola, sin scroll horizontal, con h1) y limpia todo al final.
test.describe.configure({ mode: "serial" });

const SUF = Date.now().toString(36).slice(-5);
const CAPTURAS = process.env.CAPTURAS_QA23 ?? "/private/tmp/claude-502/-Users-andres-Documents-Asygnuz/abf10c37-95db-4ff9-a15f-7828b60fd844/scratchpad/qa23/capturas";
const CASOS = [
  { tipo: "Centro radiológico", slug: "radiologico" },
  { tipo: "Centro odontológico", slug: "odontologico" },
  { tipo: "Clínica odontológica", slug: "clinica" },
  { tipo: "Odontólogo particular", slug: "particular" },
].map((c) => ({ ...c, nombre: `QA integraciones ${c.slug} ${SUF}`, correo: `qa-integraciones-${c.slug}-${SUF}@dentview.demo` }));

const sql = (q: string) => execFileSync("docker", ["exec", "-i", "dent-view-postgres-1", "psql", "-U", "dentview", "-d", "dentview", "-tA"], { input: q }).toString().trim();

async function crearCentro(page: Page, c: (typeof CASOS)[number]) {
  await page.goto("/plataforma");
  await page.getByRole("button", { name: "Nuevo centro" }).click();
  await page.getByLabel("Nombre del centro").fill(c.nombre);
  await page.getByLabel("Tipo de centro").click();
  await page.getByRole("option", { name: c.tipo }).click();
  await page.getByLabel("Nombre del administrador").fill(`QA Admin ${c.slug}`);
  await page.getByLabel("Correo del administrador").fill(c.correo);
  await page.getByRole("button", { name: "Crear centro" }).click();
  await expect(page.getByRole("heading", { name: "Centro creado" })).toBeVisible();
  await page.getByRole("button", { name: "Listo" }).click();
}

type Vista = { ancho: number; oscuro: boolean };
const VISTAS: Vista[] = [{ ancho: 1440, oscuro: false }, { ancho: 390, oscuro: false }, { ancho: 390, oscuro: true }, { ancho: 1440, oscuro: true }];

/** Entra al centro como superadmin (suplantación) en un contexto con el tamaño y el tema pedidos. */
async function entrar(browser: Browser, nombre: string, v: Vista) {
  const ctx = await browser.newContext({ storageState: authFile("superadmin"), viewport: { width: v.ancho, height: v.ancho < 600 ? 844 : 900 }, colorScheme: v.oscuro ? "dark" : "light" });
  const page = await ctx.newPage();
  await page.goto("/plataforma");
  await page.getByRole("button", { name: `Entrar a ${nombre}` }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/plataforma"));
  return { ctx, page };
}

/** Visita una ruta y devuelve los problemas encontrados (vacío = limpia). */
async function auditar(page: Page, ruta: string, etiqueta: string): Promise<string[]> {
  const problemas: string[] = [];
  const consola: string[] = [];
  const alError = (m: { type(): string; text(): string }) => { if (m.type() === "error") consola.push(m.text().slice(0, 200)); };
  const alFallo = (e: Error) => consola.push(`pageerror: ${e.message.slice(0, 200)}`);
  page.on("console", alError); page.on("pageerror", alFallo);
  const r = await page.goto(ruta, { waitUntil: "load" });
  await page.waitForLoadState("networkidle").catch(() => {});
  page.off("console", alError); page.off("pageerror", alFallo);
  if ((r?.status() ?? 0) >= 400) problemas.push(`HTTP ${r?.status()}`);
  if (new URL(page.url()).pathname !== ruta.split("?")[0]) problemas.push(`redirigió a ${new URL(page.url()).pathname}`);
  if (await page.getByText(/Application error|Algo salió mal/i).count()) problemas.push("pantalla de error");
  if (!(await page.getByRole("heading", { level: 1 }).count())) problemas.push("sin h1");
  const dom = await page.evaluate(() => ({
    desborde: document.documentElement.scrollWidth - window.innerWidth,
    sinNombre: [...document.querySelectorAll("button, a[href], [role=button]")].filter((e) => !((e as HTMLElement).innerText?.trim() || e.getAttribute("aria-label") || e.getAttribute("title") || e.querySelector("img[alt]:not([alt=''])"))).length,
    sinEtiqueta: [...document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea")].filter((e) => !(e.getAttribute("aria-label") || e.getAttribute("aria-labelledby") || (e as HTMLInputElement).labels?.length || e.getAttribute("title"))).length,
    imgSinAlt: [...document.querySelectorAll("img:not([alt])")].length,
  }));
  if (dom.desborde > 1) problemas.push(`scroll horizontal (+${dom.desborde}px)`);
  if (dom.sinNombre) problemas.push(`${dom.sinNombre} botones/enlaces sin nombre accesible`);
  if (dom.sinEtiqueta) problemas.push(`${dom.sinEtiqueta} campos sin etiqueta`);
  if (dom.imgSinAlt) problemas.push(`${dom.imgSinAlt} imágenes sin alt`);
  for (const c of consola) problemas.push(`consola: ${c}`);
  fs.mkdirSync(CAPTURAS, { recursive: true });
  await page.screenshot({ path: path.join(CAPTURAS, `${etiqueta}.png`), fullPage: true }).catch(() => {});
  return problemas.map((p) => `${ruta} [${etiqueta}] ${p}`);
}

test.afterAll(() => {
  // Los centros y sus invitaciones/usuarios QA se borran siempre (la cascada de Organization limpia lo demás).
  try {
    sql(`DELETE FROM "Organization" WHERE name LIKE 'QA integraciones %' AND slug LIKE 'qa-integraciones-%';
      DELETE FROM "Invitation" WHERE email LIKE 'qa-integraciones-%@dentview.demo';
      DELETE FROM "User" WHERE email LIKE 'qa-integraciones-%@dentview.demo';`);
  } catch { /* sin docker: quedan los centros QA integraciones */ }
});

test.describe("centros por tipo", () => {
  test.use({ storageState: authFile("superadmin") });
  test("el superadmin crea un centro de cada tipo", async ({ page }) => {
    test.setTimeout(240_000);
    for (const c of CASOS) await crearCentro(page, c);
    expect(sql(`SELECT count(*) FROM "Organization" WHERE name LIKE 'QA integraciones % ${SUF}'`)).toBe("4");
    // La clave temporal obliga a pasar por /perfil: se quita para recorrer el resto de pantallas del centro.
    sql(`UPDATE "User" SET "debeCambiarClave"=false WHERE email LIKE 'qa-integraciones-%-${SUF}@dentview.demo'`);
  });
});

// Pantallas por tipo de centro (las que el tipo no ofrece deben dar 404, no error).
const PANTALLAS: Record<string, { ok: string[]; no: string[] }> = {
  radiologico: { ok: ["/seguimiento-doctores", "/integraciones/api", "/integraciones/webhooks", "/integraciones/conectores", "/integraciones/pasarelas", "/convenios", "/seguimiento"], no: ["/crm", "/crm/leads"] },
  odontologico: { ok: ["/crm", "/crm/leads", "/crm/tareas", "/crm/secuencias", "/crm/fidelizacion", "/seguimiento", "/integraciones/api", "/integraciones/webhooks", "/integraciones/conectores", "/integraciones/pasarelas"], no: ["/seguimiento-doctores", "/convenios"] },
  clinica: { ok: ["/crm", "/crm/leads", "/crm/tareas", "/crm/secuencias", "/crm/fidelizacion", "/seguimiento", "/integraciones/api"], no: ["/seguimiento-doctores", "/convenios"] },
  particular: { ok: ["/crm", "/crm/leads", "/crm/tareas", "/crm/secuencias", "/crm/fidelizacion", "/seguimiento", "/integraciones/api"], no: ["/seguimiento-doctores", "/convenios"] },
};

for (const caso of CASOS) {
  for (const v of VISTAS) {
    test(`${caso.tipo}: pantallas sin errores a ${v.ancho}px ${v.oscuro ? "oscuro" : "claro"}`, async ({ browser }) => {
      test.setTimeout(240_000);
      const { ctx, page } = await entrar(browser, caso.nombre, v);
      try {
        const problemas: string[] = [];
        const et = (r: string) => `${caso.slug}-${r.replace(/\W+/g, "_")}-${v.ancho}-${v.oscuro ? "osc" : "cla"}`;
        for (const r of PANTALLAS[caso.slug]!.ok) problemas.push(...(await auditar(page, r, et(r))));
        for (const r of PANTALLAS[caso.slug]!.no) {
          const resp = await page.goto(r);
          if (resp?.status() !== 404) problemas.push(`${r} debería ser 404 en ${caso.tipo} y dio ${resp?.status()}`);
        }
        expect(problemas, problemas.join("\n")).toEqual([]);
      } finally {
        await ctx.close();
      }
    });
  }
}
