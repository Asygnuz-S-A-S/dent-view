import fs from "node:fs";
import path from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import {
  ahoraQA, anotarTiempo, authFile, CLAVES, cop, credencial, contextoDe, dormir, FRANJAS, guardarEstado, leerEstado, loginUI, registrar,
  sinScrollHorizontal, tiemposNavegacion, URL_PROD, vigilar, type Clave,
} from "./helpers";

// Suite de humo contra PRODUCCION. Las sesiones vienen del proyecto "setup" (un login por usuario).
// Nada de lo que escribe esta suite borra o edita datos existentes; lo que crea lleva "QA PRUEBA <fecha hora>" y queda en .auth/registros-qa.ndjson.
const CAPTURAS = "test-results-produccion/capturas";
fs.mkdirSync(CAPTURAS, { recursive: true });
const foto = (page: Page, nombre: string) => page.screenshot({ path: path.join(CAPTURAS, `${nombre.replace(/[^\w-]+/g, "_")}.png`), fullPage: true });
const SIN_SESION = { cookies: [], origins: [] };
const PAGINA_ERROR = /Application error|Algo salió mal|No encontramos esta página/i;

// ============================================================================================================
// A) PUBLICO Y TRANSPORTE
// ============================================================================================================
test.describe("A) publico y transporte", () => {
  test.use({ storageState: SIN_SESION });

  test("http redirige a https", async ({ request }) => {
    const r = await request.get(URL_PROD.replace("https://", "http://") + "/ingresar", { maxRedirects: 0 });
    expect([301, 302, 307, 308], `http respondio ${r.status()} en vez de redirigir`).toContain(r.status());
    expect(r.headers()["location"]).toMatch(/^https:\/\//);
  });

  test("certificado valido: la peticion HTTPS funciona sin ignorar errores", async ({ request }) => {
    const r = await request.get("/ingresar"); // ignoreHTTPSErrors queda en false
    expect(r.status()).toBe(200);
  });

  test("cabeceras de seguridad en /ingresar", async ({ request }) => {
    const h = (await request.get("/ingresar")).headers();
    expect(h["strict-transport-security"], "falta Strict-Transport-Security").toBeTruthy();
    expect(h["content-security-policy"] ?? "", "CSP sin frame-ancestors").toContain("frame-ancestors");
    expect(h["x-content-type-options"]).toBe("nosniff");
  });

  for (const ruta of ["/ingresar", "/recuperar"]) {
    test(`${ruta} carga con h1, sin errores de consola ni violaciones CSP`, async ({ page }) => {
      const csp: string[] = [];
      await page.addInitScript(() => document.addEventListener("securitypolicyviolation", (e) => console.error(`CSP: ${e.violatedDirective} ${e.blockedURI}`)));
      page.on("console", (m) => { if (/Content Security Policy|^CSP:/i.test(m.text())) csp.push(m.text()); });
      const v = vigilar(page);
      const r = await page.goto(ruta);
      expect(r?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(csp, `violaciones CSP: ${csp.join(" | ")}`).toEqual([]);
      expect(v.consola, `errores de consola: ${v.consola.join(" | ")}`).toEqual([]);
      expect(v.red, `respuestas 4xx/5xx: ${v.red.join(", ")}`).toEqual([]);
      await foto(page, `A-${ruta}`);
    });
  }

  test("/api/v1/openapi.json 200 JSON", async ({ request }) => {
    const r = await request.get("/api/v1/openapi.json");
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toContain("json");
    expect((await r.json()).openapi).toBeTruthy();
  });

  test("/api/v1/pacientes sin token responde 401", async ({ request }) => {
    expect((await request.get("/api/v1/pacientes")).status()).toBe(401);
  });

  test("POST /api/cron/crm sin secreto responde 401", async ({ request }) => {
    expect((await request.post("/api/cron/crm")).status()).toBe(401);
  });

  test("/dicom-web/studies sin sesion responde 401/403 y nunca datos", async ({ request }) => {
    for (const u of ["/dicom-web/studies", "/dicom-web/studies?limit=5", "/dicom-web/studies?StudyInstanceUID=1.2.3"]) {
      const r = await request.get(u);
      expect([401, 403], `${u} respondio ${r.status()}`).toContain(r.status());
      expect(await r.text()).not.toContain("0020000D");
    }
  });

  test("POST /api/imagenes sin sesion responde 401", async ({ request }) => {
    expect((await request.post("/api/imagenes")).status()).toBe(401);
  });

  test("/valoracion/token-falso muestra un mensaje generico sin filtrar nada", async ({ page }) => {
    const r = await page.goto("/valoracion/token-falso");
    expect(r?.status()).toBeLessThan(500);
    await expect(page.getByText(/código de 6 dígitos/i)).toBeVisible();
    const cuerpo = await page.locator("body").innerText();
    expect(cuerpo).not.toMatch(/no existe|expir|inválido|token|stack|prisma|error/i);
    await page.getByLabel("Código de acceso").fill("000000");
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.locator("#codigo-error")).toContainText(/no son válidos/i);
    expect(await page.locator("body").innerText()).not.toMatch(/token|prisma|stack/i);
  });

  for (const ruta of ["/inicio", "/pacientes", "/estudios"]) {
    test(`${ruta} sin sesion redirige a /ingresar`, async ({ page }) => {
      await page.goto(ruta);
      await expect(page).toHaveURL(/\/ingresar/);
    });
  }
});

// ============================================================================================================
// B) LOGIN
// ============================================================================================================
test.describe("B) login", () => {
  test.use({ storageState: SIN_SESION });

  test("cada usuario entra con su sesion y aterriza en /inicio (no en /perfil)", async ({ browser }) => {
    const resumen: string[] = [];
    for (const clave of CLAVES) {
      const ctx = await contextoDe(browser, clave);
      const p = await ctx.newPage();
      await p.goto("/");
      await p.waitForURL(/\/(inicio|perfil|ingresar|plataforma)/);
      resumen.push(`${clave} -> ${new URL(p.url()).pathname}`);
      await ctx.close();
    }
    expect(resumen.filter((l) => !l.endsWith("/inicio")), `aterrizajes distintos de /inicio: ${resumen.join("; ")}`).toEqual([]);
  });

  test("contrasena incorrecta da un error generico y no entra", async ({ page }) => {
    await dormir(3_000);
    const cred = credencial("ALEJANDRO_ADMIN");
    for (let i = 0; i < 3; i++) {
      await page.goto("/ingresar");
      await page.getByLabel("Correo").fill(cred.correo);
      await page.getByLabel("Contraseña").fill("incorrecta-QA-123");
      const resp = page.waitForResponse((r) => r.url().includes("/api/auth/sign-in/email"));
      await page.getByRole("button", { name: "Ingresar" }).click();
      if ((await resp).status() === 429) { await dormir(60_000); continue; }
      break;
    }
    const alerta = page.getByRole("alert").filter({ hasText: /incorrectos/i });
    await expect(alerta).toBeVisible();
    expect(await alerta.innerText()).not.toContain(cred.correo);
    await expect(page).toHaveURL(/\/ingresar/);
    await foto(page, "B-clave-incorrecta");
  });

  test("cerrar sesion funciona y la cookie deja de servir", async ({ browser }) => {
    test.setTimeout(240_000);
    await dormir(3_000);
    const ctx = await browser.newContext({ storageState: SIN_SESION });
    const p = await ctx.newPage();
    expect(await loginUI(p, "ALEJANDRO_ADMIN")).toBe(200);
    await p.waitForURL(/\/inicio/);
    const cookies = await ctx.cookies();
    await p.locator('[data-sidebar="footer"] [data-sidebar="menu-button"]').click();
    await p.getByRole("menuitem", { name: /Salir/ }).click();
    await expect(p).toHaveURL(/\/ingresar/);
    const reutilizada = await browser.newContext({ storageState: { cookies, origins: [] } });
    const r = await reutilizada.request.get("/inicio", { maxRedirects: 0 });
    expect([301, 302, 303, 307, 308], `la cookie anterior siguio sirviendo (status ${r.status()})`).toContain(r.status());
    expect(r.headers()["location"] ?? "").toContain("/ingresar");
    await ctx.close(); await reutilizada.close();
  });

  test("la sesion de un centro no ve datos de otro", async ({ browser }) => {
    const lumia = await contextoDe(browser, "LUMIA_ADMIN");
    const pl = await lumia.newPage();
    await pl.goto("/pacientes");
    const hrefs = await pl.locator('main a[href^="/pacientes/"]').evaluateAll((e) => e.map((x) => x.getAttribute("href")!));
    await pl.goto("/estudios");
    const uid = (await pl.locator('a[href*="StudyInstanceUIDs="]').first().getAttribute("href"))!.split("StudyInstanceUIDs=")[1]!;
    await pl.locator('tbody tr').first().getByRole("button", { name: "Más acciones" }).click();
    const idEstudio = (await pl.locator('a[href*="/descargar"]').getAttribute("href"))!.split("/")[3]!;
    guardarEstado({ lumiaPaciente: hrefs[0]!, lumiaUid: uid, lumiaEstudio: idEstudio });
    await lumia.close();

    const radia = await contextoDe(browser, "RADIA_ADMIN");
    const pr = await radia.newPage();
    const r1 = await pr.goto(hrefs[0]!);
    expect(r1?.status(), "ficha de paciente de Lumia abierta con sesion de Radia").toBe(404);
    await pr.goto("/pacientes");
    expect(await pr.locator("main").innerText()).not.toMatch(/LUMIA-0|Cárdenas|Mejía/i);
    const d = await radia.request.get(`/api/estudios/${idEstudio}/descargar`);
    expect([403, 404], `descarga de estudio ajeno respondio ${d.status()}`).toContain(d.status());
    const w = await radia.request.get(`/dicom-web/studies?StudyInstanceUID=${uid}`);
    expect(w.status(), "DICOMweb de estudio ajeno").toBe(403);
    await radia.close();
  });
});

// ============================================================================================================
// C) MENU Y MODULOS POR TIPO
// ============================================================================================================
const RADIO_SI = ["Seguimiento de doctores", "Doctores remitentes", "Estaciones de ingesta", "Convenios y tarifas"];
const RADIO_NO = ["Valoraciones virtuales", "CRM", "Laboratorio", "Odontólogos"];
const ODONTO_SI = ["Valoraciones virtuales", "CRM", "Laboratorio", "Odontólogos"];
const ODONTO_NO = ["Seguimiento de doctores", "Convenios y tarifas", "Estaciones de ingesta", "Doctores remitentes"];
const ADMIN_NO = ["Catálogo y precios", "Convenios y tarifas", "Usuarios del centro", "Reportes", "Salas y ajustes"];
const RUTAS_ADMIN = ["/catalogo", "/convenios", "/usuarios", "/reportes", "/ajustes"];
const CASOS_MENU: { clave: Clave; si: string[]; no: string[]; bloqueadas: string[] }[] = [
  { clave: "LUMIA_ADMIN", si: RADIO_SI, no: RADIO_NO, bloqueadas: ["/crm", "/valoraciones", "/laboratorio"] },
  { clave: "RADIA_ADMIN", si: RADIO_SI, no: RADIO_NO, bloqueadas: ["/crm", "/valoraciones", "/laboratorio"] },
  { clave: "LUMIAODONTO_ADMIN", si: ODONTO_SI, no: ODONTO_NO, bloqueadas: ["/seguimiento-doctores", "/convenios", "/ingesta"] },
  { clave: "AURORA_ADMIN", si: ODONTO_SI, no: ODONTO_NO, bloqueadas: ["/seguimiento-doctores", "/convenios", "/ingesta"] },
  { clave: "ALEJANDRO_ADMIN", si: ["Valoraciones virtuales", "CRM", "Laboratorio", "Facturación"], no: [...ODONTO_NO, "Usuarios del centro", "Cartera", "Reportes"], bloqueadas: ["/seguimiento-doctores", "/convenios", "/ingesta", "/usuarios", "/cartera", "/reportes"] },
  { clave: "RADIA_RECEPCION", si: ["Seguimiento de doctores", "Doctores remitentes", "Facturación", "Cartera"], no: [...ADMIN_NO, ...RADIO_NO], bloqueadas: [...RUTAS_ADMIN, "/crm", "/valoraciones"] },
  { clave: "LUMIAODONTO_RECEPCION", si: ODONTO_SI, no: [...ADMIN_NO, ...ODONTO_NO], bloqueadas: [...RUTAS_ADMIN, "/seguimiento-doctores", "/ingesta"] },
  { clave: "AURORA_RECEPCION", si: ODONTO_SI, no: [...ADMIN_NO, ...ODONTO_NO], bloqueadas: [...RUTAS_ADMIN, "/seguimiento-doctores", "/ingesta"] },
  { clave: "RADIA_RADIOLOGO", si: ["Inicio", "Pacientes", "Órdenes", "Agenda", "Estudios", "Informes", "Seguimiento"], no: [...ADMIN_NO, "Facturación", "Cartera", "Doctores remitentes", "Seguimiento de doctores"], bloqueadas: [...RUTAS_ADMIN, "/facturacion", "/cartera", "/doctores"] },
  { clave: "AURORA_PAULA", si: ["Valoraciones virtuales", "CRM", "Laboratorio", "Agenda"], no: [...ADMIN_NO, "Facturación", "Cartera", "Odontólogos"], bloqueadas: [...RUTAS_ADMIN, "/facturacion", "/cartera"] },
  { clave: "AURORA_CAMILO", si: ["Valoraciones virtuales", "CRM", "Laboratorio", "Agenda"], no: [...ADMIN_NO, "Facturación", "Cartera", "Odontólogos"], bloqueadas: [...RUTAS_ADMIN, "/facturacion", "/cartera"] },
];

test.describe("C) menu y modulos por tipo de centro", () => {
  for (const c of CASOS_MENU) {
    test.describe(c.clave, () => {
      test.use({ storageState: authFile(c.clave) });
      test(`menu lateral visible`, async ({ page }) => {
        await page.goto("/inicio");
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
        await page.waitForLoadState("networkidle");
        const items = (await page.locator('[data-sidebar="sidebar"] a').allTextContents()).map((t) => t.trim());
        const faltan = c.si.filter((x) => !items.includes(x));
        const sobran = c.no.filter((x) => items.includes(x));
        expect({ faltan, sobran }, `menu de ${c.clave}: [${items.join(", ")}]`).toEqual({ faltan: [], sobran: [] });
        // Etiqueta por tipo: "Odontologos" solo donde aplica; nunca "Doctores remitentes" en odontologia.
        if (c.si.includes("Odontólogos")) expect(items).not.toContain("Doctores remitentes");
      });
      test(`rutas bloqueadas responden 404`, async ({ page }) => {
        const malas: string[] = [];
        for (const ruta of c.bloqueadas) {
          const r = await page.goto(ruta);
          if (r?.status() !== 404) malas.push(`${ruta} -> ${r?.status()} (${new URL(page.url()).pathname})`);
        }
        expect(malas, `rutas que no dieron 404: ${malas.join("; ")}`).toEqual([]);
      });
    });
  }
});

// ============================================================================================================
// D) RECORRIDO DE LECTURA (admin de Lumia, datos demo)
// ============================================================================================================
const RUTAS_D = [
  "/inicio", "/pacientes", "/ordenes", "/agenda", "/estudios", "/informes", "/seguimiento", "/seguimiento-doctores", "/doctores",
  "/facturacion", "/cartera", "/reportes", "/catalogo", "/convenios", "/usuarios", "/ajustes", "/ingesta",
  "/integraciones", "/integraciones/api", "/integraciones/webhooks", "/integraciones/conectores", "/integraciones/pasarelas",
  "/notificaciones", "/proteccion-datos", "/perfil",
];
const TOP10 = ["/inicio", "/pacientes", "/ordenes", "/agenda", "/estudios", "/informes", "/seguimiento", "/facturacion", "/cartera", "/reportes"];

test.describe("D) recorrido de lectura como admin de Lumia", () => {
  test.use({ storageState: authFile("LUMIA_ADMIN") });

  for (const ruta of RUTAS_D) {
    test(`${ruta}: 200, sin error, sin consola ni red 4xx/5xx`, async ({ page }, info) => {
      const v = vigilar(page);
      const r = await page.goto(ruta, { waitUntil: "load" });
      expect(r?.status(), `${ruta} respondio ${r?.status()}`).toBe(200);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await expect(page.getByText(PAGINA_ERROR)).toHaveCount(0);
      await page.waitForLoadState("networkidle").catch(() => undefined);
      if (TOP10.includes(ruta)) {
        const t = await tiemposNavegacion(page);
        anotarTiempo(info.project.name, ruta, t.ttfb, t.carga);
        info.annotations.push({ type: "tiempos", description: `${ruta} TTFB ${t.ttfb} ms, carga ${t.carga} ms` });
      }
      await foto(page, `D-${ruta}`);
      expect(v.consola, `consola: ${v.consola.join(" | ")}`).toEqual([]);
      expect(v.red, `red: ${v.red.join(", ")}`).toEqual([]);
    });
  }

  test("inicio: KPIs y graficas con titulo-conclusion", async ({ page }) => {
    await page.goto("/inicio");
    const main = page.locator("main");
    for (const k of ["Citas de hoy", "Doctores en riesgo", "Estudios por asignar", "Informes en borrador"]) await expect(main.getByText(k, { exact: true })).toBeVisible();
    await expect(main.getByText(/En los últimos 7 días llegaron \d+ estudios?/)).toBeVisible();
    expect(await main.locator("svg.recharts-surface, svg[role='img'], canvas").count(), "no hay graficas en inicio").toBeGreaterThan(0);
  });

  test("pacientes: 14 en lista y busqueda sin distinguir tildes", async ({ page }) => {
    await page.goto("/pacientes");
    await expect(page.getByText("14 pacientes")).toBeVisible();
    expect(await page.locator("tbody tr").count()).toBe(14);
    const contar = async (q: string) => { await page.goto(`/pacientes?q=${encodeURIComponent(q)}`); await page.waitForLoadState("networkidle"); return page.locator("tbody tr").filter({ has: page.locator("a") }).count(); };
    // El demo no trae ningun "Gomez": se prueba tambien con apellidos con tilde que si existen.
    const [g1, g2, c1, c2, c3] = [await contar("gomez"), await contar("gómez"), await contar("cardenas"), await contar("cárdenas"), await contar("CÁRDENAS")];
    expect(g1, "gomez vs gómez").toBe(g2);
    expect(c1, "cardenas sin tilde debe encontrar al paciente").toBeGreaterThan(0);
    expect([c1, c2, c3], "cardenas / cárdenas / CÁRDENAS deben dar lo mismo").toEqual([c2, c2, c2]);
    test.info().annotations.push({ type: "nota", description: `'gomez' devolvio ${g1} pacientes (el demo no trae apellido Gomez)` });
  });

  test("ficha de paciente con sus pestanas", async ({ page }) => {
    await page.goto("/pacientes");
    await page.locator('main a[href^="/pacientes/"]').first().click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    for (const t of [/^Resumen/, /^Estudios/, /^Órdenes/, /^Cartera/, /^Hoja de vida/]) await expect(page.getByRole("tab", { name: t })).toBeVisible();
    for (const t of [/^Estudios/, /^Órdenes/, /^Cartera/, /^Hoja de vida/]) {
      await page.getByRole("tab", { name: t }).click();
      await expect(page.getByRole("tabpanel").first()).toBeVisible();
      await expect(page.getByText(PAGINA_ERROR)).toHaveCount(0);
    }
  });

  test("ordenes: 18 y filtro por estado", async ({ page }) => {
    await page.goto("/ordenes");
    expect(await page.locator("tbody tr").count()).toBe(18);
    await page.getByRole("link", { name: "Solicitada", exact: true }).click();
    await expect(page).toHaveURL(/estado=/);
    const n = await page.locator("tbody tr").count();
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(18);
    for (const fila of await page.locator("tbody tr").all()) await expect(fila).toContainText("Solicitada");
  });

  test("agenda: citas visibles y cambio de dia", async ({ page }) => {
    await page.goto("/agenda?fecha=2026-11-20");
    const citas = page.locator("main button").filter({ hasText: /\d\d:\d\d · / });
    expect(await citas.count(), "citas del 20/11").toBeGreaterThanOrEqual(3);
    await page.goto("/agenda?fecha=2026-11-21");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/sábado 21 de noviembre/i).first()).toBeVisible();
    expect(await citas.count(), "citas del 21/11").toBeGreaterThanOrEqual(3);
    await page.getByRole("button", { name: /Elegir fecha/ }).first().click().catch(() => undefined);
  });

  test("estudios: 4 estudios y menu Mas acciones", async ({ page }) => {
    await page.goto("/estudios");
    expect(await page.locator("tbody tr").count()).toBe(4);
    await page.locator("tbody tr").first().getByRole("button", { name: "Más acciones" }).click();
    await expect(page.getByRole("menuitem", { name: /Descargar DICOM/ })).toBeVisible();
  });

  test("cartera: la suma de saldos por responsable es el total mostrado", async ({ page }) => {
    await page.goto("/cartera");
    const kpi = cop((await page.getByText(/^Cartera total/).first().locator("xpath=following::*[contains(text(),'$')][1]").innerText()));
    const filas = page.locator("table").first().locator("tbody tr");
    let suma = 0;
    for (const f of await filas.all()) {
      const t = await f.innerText();
      if (/Total cartera/i.test(t)) continue;
      suma += cop((await f.locator("td").last().innerText()));
    }
    expect(suma, `suma por responsable ${suma} vs KPI ${kpi}`).toBe(kpi);
    const pie = await page.getByText(/Total cartera/).last().locator("xpath=ancestor::tr").locator("td").last().innerText().catch(() => "");
    if (pie) expect(cop(pie)).toBe(kpi);
  });

  test("facturacion: abonado + saldo = total por cuenta", async ({ page }) => {
    await page.goto("/facturacion");
    for (const f of await page.locator("tbody tr").all()) {
      const c = (await f.locator("td").allInnerTexts()).filter((t) => t.includes("$")).map(cop);
      if (c.length >= 3) expect(c[1]! + c[2]!, `fila: ${await f.innerText()}`).toBe(c[0]);
    }
  });

  test("reportes: las graficas renderizan", async ({ page }) => {
    await page.goto("/reportes");
    await page.waitForLoadState("networkidle");
    expect(await page.locator("main svg").count(), "sin graficas").toBeGreaterThan(3);
    await expect(page.getByText("Producción", { exact: true }).first()).toBeVisible();
  });

  test("catalogo: 14 servicios entre todas las pestanas", async ({ page }) => {
    await page.goto("/catalogo");
    let total = 0;
    for (const t of ["Estudios 2D", "Tomografías", "Paquetes", "Escaneos", "Otros"]) {
      await page.getByRole("tab", { name: t }).click();
      total += await page.locator("tbody tr").count();
    }
    expect(total).toBe(14);
  });
});

test.describe("D) recorrido en movil (390 px) @movil", () => {
  test.use({ storageState: authFile("LUMIA_ADMIN") });
  for (const ruta of RUTAS_D) {
    test(`${ruta} sin scroll horizontal en 390 px`, async ({ page }) => {
      const v = vigilar(page);
      const r = await page.goto(ruta);
      expect(r?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await page.waitForLoadState("networkidle").catch(() => undefined);
      await foto(page, `D-movil-${ruta}`);
      const exceso = await sinScrollHorizontal(page);
      expect(exceso, `${ruta} desborda ${exceso}px en horizontal`).toBeLessThanOrEqual(0);
      expect(v.consola, `consola: ${v.consola.join(" | ")}`).toEqual([]);
    });
  }
});

// ============================================================================================================
// E) VISOR
// ============================================================================================================
const respuestasDicom = (ctx: BrowserContext) => {
  const lista: { status: number; url: string }[] = [];
  ctx.on("response", (r) => { if (r.url().includes("/dicom-web")) lista.push({ status: r.status(), url: new URL(r.url()).pathname + new URL(r.url()).search.slice(0, 60) }); });
  return lista;
};

async function abrirVisorDesdeEstudios(ctx: BrowserContext, page: Page, modalidad: RegExp) {
  await page.goto("/estudios");
  const fila = page.locator("tbody tr").filter({ hasText: modalidad }).first();
  const [visor] = await Promise.all([ctx.waitForEvent("page"), fila.getByRole("link", { name: "Abrir visor" }).click()]);
  return visor;
}
async function omitirTour(v: Page) {
  const omitir = v.getByText("Omitir todo");
  if (await omitir.isVisible().catch(() => false)) await omitir.click();
}
const indiceCorte = (v: Page) => v.getByText(/I:\d+ \(\d+\/\d+\)/).first();

test.describe("E) visor", () => {
  test.use({ storageState: authFile("LUMIA_ADMIN") });

  test("CBCT: abre en pestana nueva, OHIF en espanol, canvas, miniaturas y herramientas; pasa de corte; sin 401/403/5xx", async ({ page, context }) => {
    test.setTimeout(150_000);
    const dicom = respuestasDicom(context);
    const consola: string[] = [];
    const visor = await abrirVisorDesdeEstudios(context, page, /CBCT/);
    visor.on("console", (m) => { if (m.type() === "error") consola.push(m.text().slice(0, 160)); });
    await expect(visor).toHaveURL(/\/visor\/viewer\?StudyInstanceUIDs=/);
    expect(await visor.evaluate(() => document.documentElement.lang)).toBe("es");
    await expect(visor.locator("canvas").first(), "no aparecio el canvas del visor en 60 s").toBeVisible({ timeout: 60_000 });
    await expect(indiceCorte(visor)).toBeVisible({ timeout: 60_000 });
    await omitirTour(visor);
    await expect(visor.getByText("CBCT 1 zona").first(), "miniatura/serie").toBeVisible();
    expect(await visor.locator('[data-cy], [data-tool], button[class*="toolbar"], [data-cy="MeasurementTools"]').count() + await visor.locator("svg").count()).toBeGreaterThan(5);
    await foto(visor, "E-visor-cbct");
    const antes = await indiceCorte(visor).innerText();
    const box = (await visor.locator("canvas").first().boundingBox())!;
    await visor.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await visor.mouse.wheel(0, 300);
    await expect.poll(() => indiceCorte(visor).innerText(), { message: "la rueda no cambio de corte" }).not.toBe(antes);
    const trasRueda = await indiceCorte(visor).innerText();
    await visor.keyboard.press("ArrowUp");
    await expect.poll(() => indiceCorte(visor).innerText(), { message: "la tecla no cambio de corte" }).not.toBe(trasRueda);
    await foto(visor, "E-visor-cbct-corte");
    // Esperado por diseño: OHIF consulta "otros estudios del paciente" (QIDO por PatientID) y el control de acceso lo rechaza (403) para
    // que un doctor o paciente no vea estudios ajenos; cualquier otro 401/403/5xx sí es un fallo.
    const esperada = (d: { status: number; url: string }) => d.status === 403 && /\/dicom-web\/studies\?.*00100020=/.test(d.url);
    const malas = dicom.filter((d) => (d.status === 401 || d.status === 403 || d.status >= 500) && !esperada(d));
    expect(malas, `respuestas /dicom-web con 401/403/5xx: ${JSON.stringify(malas)}`).toEqual([]);
    expect(dicom.length, "no hubo ninguna llamada a /dicom-web").toBeGreaterThan(0);
  });

  for (const [nombre, modalidad] of [["panoramica", /Panoramica/], ["periapical", /Periapical/]] as const) {
    test(`${nombre} sintetica: el visor muestra la imagen`, async ({ page, context }) => {
      test.setTimeout(120_000);
      const visor = await abrirVisorDesdeEstudios(context, page, modalidad);
      await expect(visor.locator("canvas").first()).toBeVisible({ timeout: 60_000 });
      await omitirTour(visor);
      await foto(visor, `E-visor-${nombre}`);
    });
  }

  test("UID inexistente: el visor no muestra datos", async ({ context }) => {
    const v = await context.newPage();
    await v.goto("/visor/viewer?StudyInstanceUIDs=1.2.3.4.5.6.7.8.9");
    await v.waitForTimeout(12_000);
    await foto(v, "E-visor-uid-inexistente");
    const texto = await v.locator("body").innerText();
    expect(texto).not.toMatch(/Cárdenas|Mejía|Quintero|LUMIA-0|CBCT 1 zona/i);
    expect(await indiceCorte(v).count()).toBe(0);
  });

  test("UID de otro centro con sesion de Radia: sin datos", async ({ browser }) => {
    const ctx = await contextoDe(browser, "RADIA_ADMIN");
    const dicom = respuestasDicom(ctx);
    const v = await ctx.newPage();
    await v.goto(`/visor/viewer?StudyInstanceUIDs=${leerEstado().lumiaUid}`);
    await v.waitForTimeout(12_000);
    await foto(v, "E-visor-otro-centro");
    expect(await v.locator("body").innerText()).not.toMatch(/Mejía|CBCT 1 zona|LUMIA-0/i);
    expect(await v.locator("canvas").count()).toBe(0);
    expect(dicom.filter((d) => d.status === 200 && /series|instances/.test(d.url)), "DICOMweb entrego datos de otro centro").toEqual([]);
    await ctx.close();
  });

  test("descarga del zip DICOM: 200 application/zip no vacio; sin sesion 401", async ({ page, request, browser }) => {
    await page.goto("/estudios");
    await page.locator("tbody tr").first().getByRole("button", { name: "Más acciones" }).click();
    const href = (await page.locator('a[href*="/descargar"]').getAttribute("href"))!;
    const r = await request.get(href);
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toContain("application/zip");
    const cuerpo = await r.body();
    expect(cuerpo.length).toBeGreaterThan(1000);
    expect(cuerpo.subarray(0, 2).toString()).toBe("PK");
    const anon = await browser.newContext({ storageState: SIN_SESION });
    expect((await anon.request.get(href)).status()).toBe(401);
    await anon.close();
  });

  test("superficie 3D (/estudios/<id>/superficie)", async ({ page }) => {
    await page.goto("/estudios");
    const filas = await page.locator("tbody tr").count();
    let id = "";
    for (let i = 0; i < filas && !id; i++) {
      await page.locator("tbody tr").nth(i).getByRole("button", { name: "Más acciones" }).click();
      const l = page.getByRole("menuitem", { name: /Escaneo facial/ });
      if (await l.count()) id = ((await l.getAttribute("href")) ?? "").split("/")[2] ?? "";
      await page.keyboard.press("Escape");
    }
    test.fixme(!id, "Ningun estudio demo de Lumia tiene malla (superficieKey vacio): no aparece 'Escaneo facial' en el menu");
    const r = await page.goto(`/estudios/${id}/superficie`);
    expect(r?.status()).toBe(200);
  });
});

test.describe("E) visor en movil (390 px) @movil", () => {
  test.use({ storageState: authFile("LUMIA_ADMIN") });
  async function abrir(page: Page) {
    await page.goto("/estudios");
    const href = (await page.locator('a[href*="StudyInstanceUIDs="]').first().getAttribute("href"))!;
    const v = await page.context().newPage();
    await v.goto(href);
    await expect(v.locator("canvas").first(), "el visor no pinto canvas en movil").toBeVisible({ timeout: 90_000 });
    await omitirTour(v);
    return v;
  }
  test("el visor carga la imagen en 390 px", async ({ page }) => {
    test.setTimeout(150_000);
    const v = await abrir(page);
    await foto(v, "E-visor-movil");
    await expect(indiceCorte(v).or(v.getByText(/W:\s*\d+/)).first()).toBeVisible();
  });
  test("el visor es usable en 390 px: el area de imagen no queda aplastada ni hay desborde horizontal", async ({ page }) => {
    test.setTimeout(150_000);
    const v = await abrir(page);
    const exceso = await sinScrollHorizontal(v);
    const caja = (await v.locator("canvas").first().boundingBox())!;
    expect({ anchoCanvasPx: Math.round(caja.width), desbordeHorizontalPx: exceso }, "area de imagen < 200 px de ancho o desborde horizontal en 390 px").toEqual({ anchoCanvasPx: expect.any(Number), desbordeHorizontalPx: 0 });
    expect(caja.width, "el canvas de la imagen mide menos de 200 px de ancho en 390 px").toBeGreaterThan(200);
  });
});

// ============================================================================================================
// F) FLUJOS DE ESCRITURA (solo Radia y Clinica Aurora)
// ============================================================================================================
process.env.QA_SELLO ??= `QA PRUEBA ${ahoraQA()}`; // estable entre workers (retries)
const SELLO = process.env.QA_SELLO;
const money = (n: number) => `$ ${n.toLocaleString("es-CO")}`;

async function elegirPaciente(page: Page, dlgOPagina: Page | ReturnType<Page["getByRole"]>, termino: string) {
  await dlgOPagina.getByRole("combobox", { name: "Paciente" }).click();
  await page.getByPlaceholder("Nombre o documento").fill(termino);
  await page.getByRole("option").filter({ hasText: termino }).first().click();
}

async function crearPaciente(page: Page, centro: string, sufijo: string) {
  const doc = String(Date.now()).slice(-10);
  const nombre = `${SELLO} ${sufijo}`;
  await page.goto("/pacientes");
  await page.getByRole("button", { name: "Nuevo paciente" }).click();
  const dlg = page.getByRole("dialog", { name: "Nuevo paciente" });
  await dlg.getByLabel("Número de documento").fill(doc);
  await dlg.getByLabel("Nombre completo").fill(nombre);
  await dlg.getByLabel("Celular").fill("3000000000");
  await dlg.getByRole("button", { name: "Guardar" }).click();
  await expect(page).toHaveURL(/\/pacientes\/[^/]+$/);
  const id = page.url().split("/").pop()!;
  registrar(centro, "paciente", id, nombre);
  await expect(page.getByRole("heading", { level: 1, name: new RegExp(nombre, "i") })).toBeVisible();
  return { id, doc, nombre };
}

async function crearSalaSiHaceFalta(page: Page, centro: string) {
  await page.goto("/agenda");
  if (!(await page.getByText("No hay salas activas").isVisible().catch(() => false))) return;
  const nombre = `${SELLO} Sala`;
  await page.goto("/ajustes");
  await page.getByRole("button", { name: "Nueva sala" }).click();
  const dlg = page.getByRole("dialog", { name: "Nueva sala" });
  await dlg.getByLabel("Nombre").fill(nombre);
  await dlg.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText(nombre, { exact: false }).first()).toBeVisible();
  registrar(centro, "sala", "(sin id visible)", nombre);
}

test.describe.serial("F1) Radia (radiologico): paciente, orden, cita, cobro y abono", () => {
  test.use({ storageState: authFile("RADIA_ADMIN") });
  const servicio = `${SELLO} Panoramica`;
  const PRECIO = 50_000;
  const ABONO = 20_000;

  test("crear servicio en el catalogo (esta vacio) y una sala", async ({ page }) => {
    await page.goto("/catalogo");
    await page.getByRole("button", { name: "Nuevo servicio" }).click();
    const dlg = page.getByRole("dialog", { name: "Nuevo servicio" });
    await dlg.getByLabel("Nombre").fill(servicio);
    await dlg.getByLabel("Precio impreso").fill(String(PRECIO + 10_000));
    await dlg.getByLabel("Precio digital").fill(String(PRECIO));
    await dlg.getByRole("button", { name: "Guardar" }).click();
    await expect(dlg).toBeHidden();
    await expect(page.getByText(servicio).first()).toBeVisible();
    registrar("Radia", "servicio de catalogo", "(sin id visible)", servicio);
    await crearSalaSiHaceFalta(page, "Radia");
  });

  test("crear paciente y orden con el servicio (total = precio digital)", async ({ page }) => {
    const p = await crearPaciente(page, "Radia", "Paciente");
    guardarEstado({ radiaDoc: p.doc, radiaPaciente: p.id, radiaNombre: p.nombre });
    await page.goto("/ordenes/nueva");
    await page.getByRole("combobox", { name: "Paciente" }).click();
    await page.getByPlaceholder("Nombre o documento").fill(p.doc);
    await page.getByRole("option").filter({ hasText: p.doc }).click();
    await page.getByRole("checkbox", { name: servicio, exact: true }).check();
    await expect(page.getByRole("complementary")).toContainText(money(PRECIO));
    await page.getByRole("button", { name: "Crear orden" }).click();
    await expect(page).toHaveURL(/\/ordenes\/(?!nueva)[^/]+$/);
    const id = page.url().split("/").pop()!;
    const num = (await page.getByRole("heading", { level: 1, name: /Orden #/ }).innerText()).match(/#\d+/)![0];
    guardarEstado({ radiaOrden: id, radiaOrdenNum: num });
    registrar("Radia", "orden", id, `${num} de ${p.nombre}`);
    await expect(page.getByText("Solicitada").first()).toBeVisible();
    await expect(page.getByRole("row", { name: /Total/ })).toContainText(money(PRECIO));
  });

  test("agendar cita desde la orden, marcar Llego y verla en agenda e inicio", async ({ page }) => {
    test.setTimeout(240_000);
    const e = leerEstado();
    const corto = e.radiaNombre!.toLowerCase();
    await page.goto(`/agenda?orden=${e.radiaOrden}`);
    const dlg = page.getByRole("dialog", { name: "Nueva cita" });
    await expect(dlg).toBeVisible();
    let hora = "";
    const desde = Math.floor(Date.now() / 1000) % FRANJAS.length;
    for (let i = 0; i < FRANJAS.length && !hora; i++) {
      const h = FRANJAS[(desde + i) % FRANJAS.length]!;
      await dlg.getByRole("combobox").filter({ hasText: /^\d\d:\d\d$/ }).click();
      await page.getByRole("option", { name: h, exact: true }).click();
      await dlg.getByRole("button", { name: "Guardar" }).click();
      if (await page.getByText("Cita creada").waitFor({ timeout: 5000 }).then(() => true, () => false)) hora = h;
    }
    expect(hora, "ninguna franja aceptó la cita (revisar mensaje de error del dialogo)").not.toBe("");
    guardarEstado({ radiaHora: hora });
    registrar("Radia", "cita", `hoy ${hora}`, e.radiaNombre!);
    await expect(page.getByRole("button", { name: new RegExp(`${corto}\\s+${hora} · Programada`, "i") })).toBeVisible();
    await page.getByRole("button", { name: new RegExp(`Marcar llegada de ${corto}`, "i") }).click();
    await expect(page.getByRole("button", { name: new RegExp(`${corto}\\s+${hora} · Llegó`, "i") })).toBeVisible();
    await page.goto("/agenda"); // sin ?orden= (con el parametro, recargar reabre el dialogo)
    await expect(page.getByRole("button", { name: new RegExp(`${corto}\\s+${hora} · Llegó`, "i") }), "el estado Llegó no persistió").toBeVisible();
    await page.goto("/inicio");
    await expect(page.locator("main")).toContainText(new RegExp(e.radiaNombre!, "i"));
    await expect(page.getByText("Citas de hoy").locator("xpath=following::*[1]")).not.toHaveText("0");
  });

  test("cuenta de cobro desde la orden y abono parcial", async ({ page }) => {
    const e = leerEstado();
    await page.goto("/facturacion/nueva");
    await page.getByRole("combobox", { name: "Orden del centro" }).click();
    await page.getByRole("option", { name: new RegExp(`${e.radiaOrdenNum}\\b`) }).click();
    await expect(page.getByText(money(PRECIO)).first()).toBeVisible();
    await page.getByRole("button", { name: "Crear cuenta de cobro" }).click();
    await expect(page).toHaveURL(/\/facturacion\/(?!nueva)[^/]+$/);
    const id = page.url().split("/").pop()!;
    guardarEstado({ radiaFactura: id });
    registrar("Radia", "cuenta de cobro", id, `de ${e.radiaOrdenNum}`);
    await expect(page.getByRole("row", { name: /^Saldo/ })).toContainText(money(PRECIO));
    await page.getByRole("button", { name: "Registrar abono" }).click();
    const dlg = page.getByRole("dialog", { name: "Registrar abono" });
    await dlg.getByLabel(/^Valor/).fill(String(ABONO));
    await dlg.getByRole("button", { name: "Registrar" }).click();
    await expect(page.getByText("Abono registrado")).toBeVisible();
    registrar("Radia", "abono", id, `${money(ABONO)} sobre la cuenta ${id}`);
    await expect(page.getByRole("row", { name: /^Abonado/ })).toContainText(money(ABONO));
    await expect(page.getByRole("row", { name: /^Saldo/ })).toContainText(money(PRECIO - ABONO));
  });

  test("cartera muestra el saldo; anular el abono con motivo devuelve el saldo", async ({ page }) => {
    const e = leerEstado();
    const fila = () => page.getByRole("row", { name: new RegExp(e.radiaNombre!, "i") }).first();
    await page.goto("/cartera");
    await expect(fila()).toContainText(money(PRECIO - ABONO));
    await page.goto(`/facturacion/${e.radiaFactura}`);
    await page.getByRole("row", { name: new RegExp(money(ABONO).replace(/[.$]/g, "\\$&")) }).getByRole("button", { name: "Anular" }).click();
    const dlg = page.getByRole("dialog", { name: "¿Anular el pago?" });
    await dlg.getByLabel(/^Motivo/).fill("QA PRUEBA abono de prueba, se anula");
    await dlg.getByRole("button", { name: "Anular pago" }).click();
    await expect(page.getByText("Pago anulado")).toBeVisible();
    await expect(page.getByRole("row", { name: /^Saldo/ })).toContainText(money(PRECIO));
    await page.goto("/cartera");
    await expect(fila(), "la cartera no recupero el saldo completo").toContainText(money(PRECIO));
  });
});

test.describe.serial("F2) Clinica Aurora (odontologica): paciente, cita y notas clinicas", () => {
  test("admin: paciente y cita", async ({ browser }) => {
    test.setTimeout(240_000);
    const ctx = await contextoDe(browser, "AURORA_ADMIN");
    const page = await ctx.newPage();
    await crearSalaSiHaceFalta(page, "Clinica Aurora");
    const p = await crearPaciente(page, "Clinica Aurora", "Paciente");
    guardarEstado({ auroraPaciente: p.id, auroraNombre: p.nombre, auroraDoc: p.doc });
    await page.goto("/agenda");
    // Primer hueco libre del dia: se prueban franjas hasta que una guarde.
    let creada = false;
    for (const h of FRANJAS) {
      const hueco = page.getByRole("button", { name: new RegExp(`^Agendar en .* a las ${h}$`) }).first();
      if (!(await hueco.count())) continue;
      // Un hueco tapado por una cita de una corrida anterior no se puede pulsar: se pasa al siguiente.
      if (!(await hueco.click({ timeout: 2000 }).then(() => true, () => false))) continue;
      const dlg = page.getByRole("dialog", { name: "Nueva cita" });
      await elegirPaciente(page, dlg, p.doc);
      await dlg.getByRole("button", { name: "Guardar" }).click();
      if (await page.getByText("Cita creada").waitFor({ timeout: 5000 }).then(() => true, () => false)) { creada = true; registrar("Clinica Aurora", "cita", `hoy ${h}`, p.nombre); break; }
      await dlg.getByRole("button", { name: "Cancelar" }).click().catch(() => undefined);
    }
    expect(creada, "no se pudo crear ninguna cita hoy").toBe(true);
    await expect(page.getByRole("button", { name: new RegExp(`${p.nombre} \\d\\d:\\d\\d · Programada`, "i") })).toBeVisible();
    await ctx.close();
  });

  test("Dra. Paula crea una nota clinica y la corrige; la recepcion la ve solo en lectura o no la ve", async ({ browser }) => {
    test.setTimeout(180_000);
    const e = leerEstado();
    const abrirNotas = async (page: Page) => {
      await page.goto(`/pacientes/${e.auroraPaciente}`);
      await page.getByRole("tab", { name: /Módulo clínico/ }).click();
      await page.getByRole("tab", { name: /Notas clínicas/ }).click();
    };
    const paula = await contextoDe(browser, "AURORA_PAULA");
    const pp = await paula.newPage();
    await abrirNotas(pp);
    const nota = `${SELLO} nota clinica`;
    await pp.getByRole("textbox", { name: "Nueva nota clínica" }).fill(nota);
    await pp.getByRole("button", { name: "Agregar nota" }).click();
    await expect(pp.getByText(nota)).toBeVisible();
    registrar("Clinica Aurora", "nota clinica", e.auroraPaciente!, nota);
    await expect(pp.getByRole("tabpanel", { name: /Notas clínicas/ }).getByRole("button", { name: "Editar" })).toHaveCount(0);
    const corr = `${SELLO} correccion`;
    await pp.getByRole("button", { name: "Corregir" }).first().click();
    await pp.getByRole("textbox", { name: "Texto de la corrección" }).fill(corr);
    await pp.getByRole("button", { name: "Guardar corrección" }).click();
    await expect(pp.getByText(new RegExp(`^\\[Corrige la nota del .+\\] ${corr}$`))).toBeVisible();
    registrar("Clinica Aurora", "nota clinica (correccion)", e.auroraPaciente!, corr);
    await foto(pp, "F-aurora-notas-paula");
    await paula.close();

    const rec = await contextoDe(browser, "AURORA_RECEPCION");
    const pr = await rec.newPage();
    await pr.goto(`/pacientes/${e.auroraPaciente}`);
    const tabClinico = pr.getByRole("tab", { name: /Módulo clínico/ });
    let resultado = "no ve el modulo clinico";
    if (await tabClinico.count()) {
      await tabClinico.click();
      const tabNotas = pr.getByRole("tab", { name: /Notas clínicas/ });
      if (await tabNotas.count()) {
        await tabNotas.click();
        const ve = await pr.getByText(nota).count();
        const escribe = (await pr.getByRole("button", { name: /Agregar nota|Corregir/ }).count()) + (await pr.getByRole("textbox", { name: "Nueva nota clínica" }).count());
        resultado = ve ? `ve la nota (${escribe ? "CON controles de escritura" : "solo lectura"})` : "no ve la nota";
        expect(escribe, `la recepcion puede escribir notas clinicas: ${resultado}`).toBe(0);
      }
    }
    test.info().annotations.push({ type: "recepcion", description: resultado });
    await foto(pr, "F-aurora-notas-recepcion");
    await rec.close();
  });

});

test.describe("F3) Clinica Aurora: valoracion virtual y CRM", () => {
  test("valoracion virtual: solicitud, enlace + codigo y enlace publico", async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await contextoDe(browser, "AURORA_ADMIN");
    const page = await ctx.newPage();
    await page.goto("/valoraciones/nueva");
    await page.getByLabel("Nombre", { exact: true }).fill(`${SELLO} valoracion`);
    await page.getByLabel("Teléfono / WhatsApp").fill("3000000000");
    await page.getByLabel("Correo", { exact: true }).fill(`qa-prueba-${Date.now()}@ejemplo.invalid`);
    await page.getByLabel("Ciudad donde vive").fill("Bogotá");
    await page.getByLabel("Motivo de la consulta").fill("QA PRUEBA humo de produccion");
    await page.getByLabel("Odontólogo asignado (opcional)").click();
    const opciones = await page.getByRole("option").allInnerTexts();
    test.info().annotations.push({ type: "odontologos asignables", description: opciones.join(" | ") || "(ninguno)" });
    const paula = page.getByRole("option", { name: /Paula/ });
    if (await paula.count()) await paula.click(); else await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Crear solicitud y generar enlace" }).click();
    const err = page.getByRole("alert");
    await expect(page.getByTestId("valoracion-enlace"), `no se generó el enlace; alerta: ${await err.allInnerTexts().catch(() => "")}`).toBeVisible({ timeout: 30_000 });
    const enlace = (await page.getByTestId("valoracion-enlace").textContent())!.trim();
    const codigo = (await page.getByTestId("valoracion-codigo").textContent())!.trim();
    expect(enlace).toMatch(/\/valoracion\/[A-Za-z0-9_-]{20,}$/);
    expect(codigo).toMatch(/^\d{6}$/);
    await page.getByRole("button", { name: "Listo" }).click();
    await expect(page).toHaveURL(/\/valoraciones\/(?!nueva)[^/]+$/);
    registrar("Clinica Aurora", "valoracion virtual", page.url().split("/").pop()!, `${SELLO} valoracion`);
    expect(enlace.startsWith(URL_PROD), `el enlace publico no apunta al dominio de produccion: ${enlace.replace(/\/valoracion\/.*/, "/valoracion/…")}`).toBe(true);
    const anon = await browser.newContext({ storageState: SIN_SESION, viewport: { width: 390, height: 844 } });
    const pub = await anon.newPage();
    await pub.goto(enlace.replace(URL_PROD, ""));
    await pub.getByLabel("Código de acceso").fill(codigo);
    await pub.getByRole("button", { name: "Continuar" }).click();
    await expect(pub.getByText(/Cómo funciona|fotos|video/i).first()).toBeVisible({ timeout: 20_000 });
    await foto(pub, "F-aurora-valoracion-publica");
    await anon.close();
    await ctx.close();
  });

  test("CRM: crear un lead y moverlo de etapa", async ({ browser }) => {
    const ctx = await contextoDe(browser, "AURORA_ADMIN");
    const page = await ctx.newPage();
    const nombre = `${SELLO} lead`;
    await page.goto("/crm/leads");
    await page.getByRole("button", { name: "Nuevo lead" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Nombre", { exact: true }).fill(nombre);
    await d.getByLabel("Correo", { exact: true }).fill(`qa-prueba-lead-${Date.now()}@ejemplo.invalid`);
    await d.getByLabel("Interés", { exact: true }).fill("QA PRUEBA");
    await d.getByRole("button", { name: "Crear lead" }).click();
    await expect(page.getByText("Lead creado")).toBeVisible();
    const enlace = page.getByRole("link", { name: nombre });
    await expect(enlace).toBeVisible();
    const id = ((await enlace.first().getAttribute("href")) ?? "").split("/").pop()!;
    registrar("Clinica Aurora", "lead CRM", id, nombre);
    await expect(page.getByRole("region", { name: "Etapa Nuevo" }).getByRole("link", { name: nombre })).toBeVisible();
    await page.getByLabel(`Mover a: ${nombre}`).selectOption("CONTACTADO");
    await expect(page.getByRole("region", { name: "Etapa Contactado" }).getByRole("link", { name: nombre })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("region", { name: "Etapa Contactado" }).getByRole("link", { name: nombre }), "la etapa no persistió").toBeVisible();
    await ctx.close();
  });
});

// ============================================================================================================
// G) CORREO (solo el dueno)
// ============================================================================================================
test.describe("G) correo de recuperacion", () => {
  test.use({ storageState: SIN_SESION });
  test("'olvide mi contrasena' para el dueno responde bien (la bandeja la confirma el coordinador)", async ({ page }) => {
    test.setTimeout(240_000);
    await dormir(3_000);
    let status = 0;
    for (let i = 0; i < 3; i++) {
      await page.goto("/recuperar");
      await page.getByLabel("Correo").fill("andres.agudelo@asygnuz.com");
      const resp = page.waitForResponse((r) => r.request().method() === "POST" && /\/api\/auth\/.*(reset|forget)/i.test(r.url()));
      await page.getByRole("button", { name: "Enviar enlace" }).click();
      const r = await resp;
      status = r.status();
      test.info().annotations.push({ type: "endpoint", description: `${r.request().method()} ${new URL(r.url()).pathname} -> ${status}` });
      if (status !== 429) break;
      await dormir(60_000);
    }
    expect(status, `request-password-reset respondio ${status}`).toBe(200);
    await expect(page.getByRole("status")).toContainText(/recibirás un enlace/i);
    await foto(page, "G-recuperar");
  });
});
