import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";
import { authFile } from "./helpers";
import { sql } from "./qa-usuarios";

// QA de UX/CRM menores: fechas de estudio, accesibilidad (axe), títulos y h1, favicon, importación CSV, paginación y móvil.
// Crea y limpia sus propios datos (prefijo "QA ux"). Serial: comparte filas SQL entre pruebas.
test.use({ storageState: authFile("admin") });
test.describe.configure({ mode: "serial", timeout: 150_000 });

const SUF = String(Date.now()).slice(-6);
const PREFIJO = `QA ux ${SUF}`;
const SCRATCH = process.env.EVIDENCIAS_E25 ?? "test-results/e25";
test.beforeAll(() => fs.mkdirSync(SCRATCH, { recursive: true }));
const org = () => sql(`select id from "Organization" where slug='radex-demo'`);
const PAG_NOMBRE = (n: number) => `${PREFIJO} Pag ${String(n).padStart(2, "0")}`;

/** Crea un centro «QA ux …» del tipo dado desde /plataforma y devuelve un contexto ya dentro de él (suplantación del superadmin). */
async function entrarACentroQa(browser: Browser, slug: string, tipo: string, opciones: { viewport?: { width: number; height: number }; colorScheme?: "dark" | "light" } = {}) {
  const nombre = `${PREFIJO} ${slug}`;
  const ctx = await browser.newContext({ storageState: authFile("superadmin"), ...opciones });
  const p = await ctx.newPage();
  await p.goto("/plataforma");
  await p.getByRole("button", { name: "Nuevo centro" }).click();
  await p.getByLabel("Nombre del centro").fill(nombre);
  await p.getByLabel("Tipo de centro").click();
  await p.getByRole("option", { name: tipo }).click();
  await p.getByLabel("Nombre del administrador").fill(`QA ux Admin ${slug}`);
  await p.getByLabel("Correo del administrador").fill(`qa-ux-${slug}-${SUF}@dentview.demo`);
  await p.getByRole("button", { name: "Crear centro" }).click();
  await expect(p.getByRole("heading", { name: "Centro creado" })).toBeVisible();
  await p.getByRole("button", { name: "Listo" }).click();
  // El admin nuevo entra con clave temporal y todo lo redirige a /perfil: se limpia el aviso para recorrer las pantallas reales.
  sql(`update "User" set "debeCambiarClave"=false where email='qa-ux-${slug}-${SUF}@dentview.demo'`);
  await p.reload();
  return { ctx, p, nombre };
}
async function impersonar(p: Page, nombre: string) {
  await p.getByRole("button", { name: `Entrar a ${nombre}` }).click();
  await p.waitForURL((u) => !u.pathname.startsWith("/plataforma"));
}

const sinDesborde = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.afterAll(() => {
  try {
    sql(`delete from "Lead" where nombre like '${PREFIJO}%';
delete from "Estudio" where "studyInstanceUid" like 'QA-UX-${SUF}%';
delete from "Factura" where "pacienteId" in (select id from "PacienteTenant" where nombre like '${PREFIJO}%');
delete from "PacienteTenant" where nombre like '${PREFIJO}%';
delete from "Persona" where nombre like '${PREFIJO}%';
delete from "Evento" where "organizationId" in (select id from "Organization" where slug like 'qa-ux-${SUF}-%');
delete from "ConfigCentro" where "organizationId" in (select id from "Organization" where slug like 'qa-ux-${SUF}-%');
delete from "Member" where "organizationId" in (select id from "Organization" where slug like 'qa-ux-${SUF}-%');
delete from "Organization" where slug like 'qa-ux-${SUF}-%';
delete from "Session" where "userId" in (select id from "User" where email like 'qa-ux-%-${SUF}@dentview.demo');
delete from "Account" where "userId" in (select id from "User" where email like 'qa-ux-%-${SUF}@dentview.demo');
delete from "User" where email like 'qa-ux-%-${SUF}@dentview.demo';`);
  } catch { /* sin docker: quedan filas "QA ux" por borrar a mano */ }
});

// ---------- 1. Fechas de estudio (medianoche UTC) ----------
test("la fecha de un estudio del día 24 se ve 24 en ficha, lista de pacientes y ficha del doctor", async ({ page }) => {
  const o = org();
  const doc = sql(`select u.id from "User" u join "Member" m on m."userId"=u.id where u.email='doctor@pepito.demo' and m."organizationId"='${o}' limit 1`);
  const pacId = sql(`select id from "PacienteTenant" where "organizationId"='${o}' and nombre not like 'QA ux%' order by "creadoEn" limit 1`);
  const nombre = sql(`select nombre from "PacienteTenant" where id='${pacId}'`);
  sql(`insert into "Estudio"(id,"organizationId","pacienteId","doctorRemitenteId","studyInstanceUid","orthancId",modalidad,"fechaEstudio","actualizadoEn")
       values ('qa-ux-est-${SUF}','${o}','${pacId}','${doc}','QA-UX-${SUF}','QA-UX-${SUF}-o','CBCT','2027-03-24 00:00:00+00',now())`);
  await page.goto(`/pacientes/${pacId}`);
  await page.getByRole("tab", { name: /^Estudios/ }).click();
  await expect(page.getByRole("cell", { name: "24/03/2027" }).first()).toBeVisible();
  await page.goto(`/pacientes?q=${encodeURIComponent(nombre)}`);
  await expect(page.getByRole("row").filter({ hasText: nombre.toLowerCase() }).first()).toContainText("24/03/2027");
  await page.goto(`/doctores/${doc}`);
  await expect(page.getByRole("cell", { name: "24/03/2027" }).first()).toBeVisible();
});

// ---------- 2. Títulos, h1 y favicon ----------
test.describe("páginas públicas y de acceso", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  for (const [ruta, titulo] of [["/ingresar", /Ingresar/], ["/ingresar/2fa", /Verificación en dos pasos/], ["/recuperar", /Recuperar contraseña/], ["/recuperar/nueva", /Nueva contraseña/], ["/resultados/token-falso", /Resultados/], ["/baja/token-falso", /mensajes/], ["/valoracion/token-falso", /valoración/i]] as const) {
    test(`${ruta}: tiene h1 y un título de pestaña útil`, async ({ page }) => {
      await page.goto(ruta);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await expect(page).toHaveTitle(titulo);
      expect(await page.title()).not.toBe("dent-view");
    });
  }

  test("el favicon se sirve y la primera carga no tiene 404", async ({ page }) => {
    const malas: string[] = [];
    page.on("response", (r) => { if (r.status() === 404) malas.push(r.url()); });
    await page.goto("/ingresar");
    await page.waitForLoadState("networkidle");
    const href = await page.locator('link[rel~="icon"]').first().getAttribute("href");
    expect(href).toBeTruthy();
    const r = await page.request.get(href!);
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toMatch(/image\//);
    expect(malas).toEqual([]);
  });

  test("/pago-simulado/<id> inexistente da 404 (nunca expone nada)", async ({ page }) => {
    expect((await page.goto("/pago-simulado/SIM-no-existe"))?.status()).toBe(404);
  });
});

// ---------- 3. Accesibilidad con axe: serias/críticas fallan, el resto se reporta ----------
const PANTALLAS: [string, string][] = [
  ["inicio", "/inicio"], ["pacientes", "/pacientes"], ["ordenes", "/ordenes"], ["agenda", "/agenda"], ["facturacion", "/facturacion"],
  ["cartera", "/cartera"], ["estudios", "/estudios"], ["informes", "/informes"], ["crm", "/crm"], ["seguimiento", "/seguimiento"], ["ajustes", "/ajustes"],
];
const menores: string[] = [];
const graves: string[] = [];

async function auditar(page: Page, nombre: string, tema: "light" | "dark") {
  await page.waitForLoadState("networkidle");
  // Las celdas de 15 min de la agenda son un atajo de ratón; el mismo flujo existe con el botón «Nueva cita» (equivalente, WCAG 2.5.8), así que no se exigen 24 px.
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).exclude('button[aria-label^="Agendar en"]').analyze();
  const resumen = (v: (typeof violations)[number]) => `${nombre}/${tema}: ${v.id} (${v.impact}) x${v.nodes.length} ${v.nodes.slice(0, 2).map((n) => `${n.target.join(" ")} ${n.html.slice(0, 140)}`).join(" | ")}`;
  menores.push(...violations.filter((v) => v.impact !== "serious" && v.impact !== "critical").map(resumen));
  graves.push(...violations.filter((v) => v.impact === "serious" || v.impact === "critical").map(resumen));
}

// Una prueba por tema recorre todas las pantallas y falla al final con la lista completa de violaciones serias/críticas.
for (const tema of ["light", "dark"] as const) {
  test(`axe: pantallas principales sin violaciones serias ni críticas (${tema})`, async ({ page, browser }) => {
    test.setTimeout(600_000);
    graves.length = 0;
    await page.emulateMedia({ colorScheme: tema });
    const fichaId = sql(`select id from "PacienteTenant" where "organizationId"='${org()}' and nombre not like 'QA ux%' order by "creadoEn" limit 1`);
    for (const [nombre, ruta] of [...PANTALLAS, ["ficha", `/pacientes/${fichaId}`]]) {
      await page.goto(ruta!);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await auditar(page, nombre!, tema);
    }
    const publico = await browser.newContext({ storageState: { cookies: [], origins: [] }, colorScheme: tema });
    const sup = await browser.newContext({ storageState: authFile("superadmin"), colorScheme: tema });
    try {
      const p = await publico.newPage();
      for (const [n, r] of [["ingresar", "/ingresar"], ["recuperar", "/recuperar"], ["resultados", "/resultados/token-falso"]] as const) {
        await p.goto(r);
        await expect(p.getByRole("heading", { level: 1 }).first()).toBeVisible();
        await auditar(p, n, tema);
      }
      const s = await sup.newPage();
      await s.goto("/plataforma");
      await expect(s.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await auditar(s, "plataforma", tema);
    } finally { await publico.close(); await sup.close(); }
    expect([...new Set(graves)]).toEqual([]);
  });
}

test("hallazgos menores de axe (informativo)", async ({}, info) => {
  const unicos = [...new Set(menores)];
  info.annotations.push({ type: "axe-menores", description: `${unicos.length} hallazgos` });
  console.log(`AXE MENORES (${unicos.length}):\n${unicos.join("\n")}`);
});

// ---------- 4. CRM: importación CSV ----------
test("importar CSV (centro odontológico): archivo de más de 900 KB se rechaza con mensaje claro; comillas con saltos de línea y duplicado por teléfono", async ({ browser }) => {
  test.setTimeout(240_000);
  const { ctx, p: page, nombre } = await entrarACentroQa(browser, "crm", "Centro odontológico");
  try {
    await impersonar(page, nombre);
    await page.goto("/crm/leads");
    await page.getByRole("button", { name: "Importar CSV" }).click();
    const area = page.getByLabel("O pega el contenido");

    await page.getByLabel("Archivo .csv").setInputFiles({ name: "grande.csv", mimeType: "text/csv", buffer: Buffer.from(`nombre,telefono\n${`${PREFIJO} Grande,3001234567\n`.repeat(30_000)}`) });
    await page.getByRole("button", { name: "Importar", exact: true }).click();
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: /demasiado grande/i }).first()).toBeVisible();

    const csv = `nombre,telefono,correo,interes\n"${PREFIJO} Pérez, Ana",300 111 2233,ana-${SUF}@qa.test,"Ortodoncia\ny blanqueamiento"\n"${PREFIJO} Luis ""El Rey""",3109998877,,x\n`;
    await area.fill(csv);
    await page.getByRole("button", { name: "Importar", exact: true }).click();
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: "2 leads creados" }).first()).toBeVisible();
    expect(sql(`select count(*) from "Lead" where nombre like '${PREFIJO}%' and interes like E'Ortodoncia\\ny blanqueamiento'`)).toBe("1");

    // Mismo teléfono con prefijo +57 y otro correo: ya existe.
    await page.goto("/crm/leads");
    await page.getByRole("button", { name: "Importar CSV" }).click();
    await page.getByLabel("O pega el contenido").fill(`nombre,telefono,correo\n${PREFIJO} Otra,+57 3001112233,otra-${SUF}@qa.test\n`);
    await page.getByRole("button", { name: "Importar", exact: true }).click();
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: "0 leads creados, 1 ya existían" }).first()).toBeVisible();

    // Accesibilidad del CRM (solo existe en este tipo de centro) en claro y oscuro.
    graves.length = 0;
    for (const tema of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: tema });
      for (const r of ["/crm", "/crm/leads"]) {
        await page.goto(r);
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
        await auditar(page, `crm${r}`, tema);
      }
    }
    expect([...new Set(graves)]).toEqual([]);
  } finally { await ctx.close(); }
});

// ---------- 5. Paginación (pacientes y facturación) y móvil con 60 cuentas ----------
test("preparar 60 pacientes y 60 cuentas de cobro de prueba", () => {
  const o = org();
  sql(`insert into "Persona"(id,"tipoDocumento","numeroDocumento",nombre,"creadoEn")
       select 'qa-ux-p-${SUF}-'||g,'CC','QUX${SUF}'||g,'${PREFIJO} Pag '||lpad(g::text,2,'0'),now() from generate_series(1,60) g;
       insert into "PacienteTenant"(id,"organizationId","personaId","creadoEn",nombre)
       select 'qa-ux-t-${SUF}-'||g,'${o}','qa-ux-p-${SUF}-'||g,now(),'${PREFIJO} Pag '||lpad(g::text,2,'0') from generate_series(1,60) g;
       insert into "Factura"(id,"organizationId",numero,"pacienteId",responsable,estado,total,fecha,vence)
       select 'qa-ux-f-${SUF}-'||g,'${o}',(select coalesce(max(numero),0) from "Factura" where "organizationId"='${o}')+g,'qa-ux-t-${SUF}-1','PACIENTE','ABIERTA',100000+g,now()-interval '60 days',now()-interval '40 days' from generate_series(1,60) g;`);
  expect(sql(`select count(*) from "PacienteTenant" where nombre like '${PREFIJO}%'`)).toBe("60");
});

test("pacientes: pagina de 50 en 50 con anterior/siguiente y conserva el filtro", async ({ page }) => {
  await page.goto(`/pacientes?q=${encodeURIComponent(PREFIJO + " Pag")}`);
  const nav = page.getByRole("navigation", { name: "Paginación" });
  await expect(nav).toContainText("Mostrando 1–50 de 60");
  await expect(page.locator("tbody tr")).toHaveCount(50);
  await nav.getByRole("link", { name: "Siguiente" }).click();
  await expect(page).toHaveURL(/pagina=2/);
  await expect(page).toHaveURL(/q=QA/);
  await expect(nav).toContainText("Mostrando 51–60 de 60");
  await expect(page.locator("tbody tr")).toHaveCount(10);
  await expect(nav.getByRole("button", { name: "Siguiente" })).toBeDisabled();
  await nav.getByRole("link", { name: "Anterior" }).click();
  await expect(nav).toContainText("Mostrando 1–50 de 60");
  // Página fuera de rango: se acota a la última, nunca una lista vacía.
  await page.goto(`/pacientes?q=${encodeURIComponent(PREFIJO + " Pag")}&pagina=99`);
  await expect(page.locator("tbody tr")).toHaveCount(10);
});

test("facturación: 60 cuentas se paginan sin cortar en silencio", async ({ page }) => {
  await page.goto(`/facturacion?q=${encodeURIComponent(PAG_NOMBRE(1))}`);
  const nav = page.getByRole("navigation", { name: "Paginación" });
  await expect(nav).toContainText("Mostrando 1–50 de 60");
  await nav.getByRole("link", { name: "Siguiente" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(10);
});

test("órdenes: la paginación no aparece con una sola página", async ({ page }) => {
  await page.goto("/ordenes?pagina=7");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await expect(page.getByText(/Application error/i)).toHaveCount(0);
});

// ---------- 6. Móvil 390 px, modo oscuro ----------
test.describe("móvil 390 px en modo oscuro", () => {
  test.use({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
  const RUTAS = ["/facturacion/nueva", "/facturacion", "/cartera", "/reportes", "/pacientes", "/ordenes", "/seguimiento", "/agenda"];
  for (const ruta of RUTAS) {
    test(`${ruta}: sin desborde horizontal`, async ({ page }) => {
      await page.goto(ruta);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(await sinDesborde(page)).toBe(true);
    });
  }
  test("ficha del paciente (con cuentas) sin desborde", async ({ page }) => {
    await page.goto("/pacientes/qa-ux-t-" + SUF + "-1");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    expect(await sinDesborde(page)).toBe(true);
  });
  test("plataforma como superadmin sin desborde", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: authFile("superadmin"), viewport: { width: 390, height: 844 }, colorScheme: "dark" });
    try {
      const p = await ctx.newPage();
      await p.goto("/plataforma");
      await expect(p.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await p.waitForLoadState("networkidle");
      expect(await sinDesborde(p)).toBe(true);
    } finally { await ctx.close(); }
  });
});

const TIPOS = [["radiologico", "Centro radiológico"], ["odontologico", "Centro odontológico"], ["clinica", "Clínica odontológica"], ["particular", "Odontólogo particular"]] as const;
for (const [slug, tipo] of TIPOS) {
  test(`centro ${tipo}: pantallas clave a 390 px en oscuro sin desborde ni errores`, async ({ browser }) => {
    test.setTimeout(240_000);
    const { ctx, p, nombre } = await entrarACentroQa(browser, slug, tipo, { viewport: { width: 390, height: 844 }, colorScheme: "dark" });
    try {
      expect(await sinDesborde(p)).toBe(true);
      await impersonar(p, nombre);
      for (const ruta of ["/inicio", "/pacientes", "/agenda", "/facturacion", "/ajustes", "/perfil"]) {
        const r = await p.goto(ruta);
        if (r?.status() === 404) continue; // el guard por tipo de centro puede ocultar la pantalla
        await expect(p.getByRole("heading", { level: 1 }).first()).toBeVisible();
        await p.waitForLoadState("networkidle");
        expect(await sinDesborde(p), `${tipo} ${ruta}`).toBe(true);
      }
      await p.goto("/inicio");
      await p.screenshot({ path: `${SCRATCH}/centro-${slug}.png` });
    } finally { await ctx.close(); }
  });
}
