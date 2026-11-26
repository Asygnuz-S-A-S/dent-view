import { expect, test, request as pwRequest, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";

// Remisiones Lumia <-> Radia en la demo ya cargada. SOLO LECTURA: no crea, edita ni borra datos.
// Única escritura incidental: descargar el informe devuelto registra el evento de auditoría de acceso (lo hace la propia app).
// Credenciales: solo por entorno. CLAVE_DEMO = clave de los usuarios demo; BASE_URL = sitio a probar. Nada se imprime.
//   CLAVE_DEMO='…' BASE_URL=https://dentview.asygnuz.com npx playwright test -c playwright.produccion.config.ts --project=remision
const BASE = process.env.BASE_URL ?? "https://dentview.asygnuz.com";
const CLAVE = process.env.CLAVE_DEMO ?? "";
const LUMIA = "admin@lumia.ejemplo.invalid";
const RADIA = "admin@radia.ejemplo.invalid";
const ESTADOS = ["Enviada", "Recibida", "En proceso", "Devuelta", "Rechazada", "Cancelada"] as const;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

test.skip(!CLAVE, "Falta CLAVE_DEMO en el entorno");
test.describe.configure({ mode: "serial" });

type Sesion = { api: APIRequestContext; ctx: BrowserContext; page: Page };
let lumia: Sesion, radia: Sesion;

/** Login por API (con reintento tras 429) y un navegador con la misma sesión. */
async function ingresar(browser: Browser, correo: string): Promise<Sesion> {
  const api = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { origin: new URL(BASE).origin } });
  let status = 0;
  for (let i = 0; i < 4; i++) {
    const r = await api.post("/api/auth/sign-in/email", { data: { email: correo, password: CLAVE } });
    status = r.status();
    if (status !== 429) break;
    await dormir(60_000);
  }
  expect(status, `login ${correo}`).toBe(200);
  const ctx = await browser.newContext({ baseURL: BASE, storageState: await api.storageState(), viewport: { width: 1440, height: 900 } });
  return { api, ctx, page: await ctx.newPage() };
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  lumia = await ingresar(browser, LUMIA);
  await dormir(6_000); // el login admite pocos intentos por minuto
  radia = await ingresar(browser, RADIA);
});
test.afterAll(async () => { for (const s of [lumia, radia]) { await s?.ctx.close(); await s?.api.dispose(); } });

/** Contadores "Enviada: 2" de la página /remisiones. */
async function contadores(p: Page, ruta: string) {
  const r = await p.goto(ruta);
  expect(r?.status(), ruta).toBe(200);
  const texto = await p.getByRole("list", { name: "Contadores por estado" }).innerText();
  return Object.fromEntries(ESTADOS.map((e) => [e, Number(new RegExp(`${e}: (\\d+)`).exec(texto)?.[1] ?? -1)])) as Record<(typeof ESTADOS)[number], number>;
}
const primerEnlace = async (p: Page, ruta: string, patron: RegExp) => {
  expect((await p.goto(ruta))?.status(), ruta).toBe(200);
  const hrefs = await p.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
  const href = hrefs.find((h) => patron.test(h));
  expect(href, `sin enlace ${patron} en ${ruta}`).toBeTruthy();
  return href!;
};

test.describe("remisiones sembradas por estado", () => {
  test("Lumia (origen): enviadas en ENVIADA, RECIBIDA, EN_PROCESO, DEVUELTA y RECHAZADA", async () => {
    const c = await contadores(lumia.page, "/remisiones");
    for (const e of ["Enviada", "Recibida", "En proceso", "Devuelta", "Rechazada"] as const) expect(c[e], `Lumia enviadas: ${e}`).toBeGreaterThanOrEqual(1);
    for (const e of ["Enviada", "Recibida", "En proceso", "Devuelta", "Rechazada"]) await expect(lumia.page.getByRole("table")).toContainText(e);
    await expect(lumia.page.getByRole("table")).toContainText("Radia Centro Radiológico");
  });

  test("Radia (destino): las mismas remisiones en Recibidas, y una enviada a Lumia", async () => {
    const c = await contadores(radia.page, "/remisiones?vista=recibidas");
    for (const e of ["Enviada", "Recibida", "En proceso", "Devuelta", "Rechazada"] as const) expect(c[e], `Radia recibidas: ${e}`).toBeGreaterThanOrEqual(1);
    await expect(radia.page.getByRole("table")).toContainText("Lumia Imágenes Dentales");
    const e = await contadores(radia.page, "/remisiones");
    expect(Object.values(e).reduce((a, b) => a + b, 0), "Radia tiene al menos una remisión enviada a Lumia").toBeGreaterThanOrEqual(1);
    const l = await contadores(lumia.page, "/remisiones?vista=recibidas");
    expect(Object.values(l).reduce((a, b) => a + b, 0), "Lumia ve la remisión que le envió Radia").toBeGreaterThanOrEqual(1);
  });

  test("los vínculos están activos en los dos sentidos", async () => {
    for (const [s, otro] of [[lumia, "Radia Centro Radiológico"], [radia, "Lumia Imágenes Dentales"]] as const) {
      expect((await s.page.goto("/remisiones/vinculos"))?.status()).toBe(200);
      await expect(s.page.locator("main")).toContainText(otro);
      await expect(s.page.locator("main")).toContainText(/Activo/i);
    }
  });
});

// Se llena en la prueba de la remisión devuelta y se reutiliza en las siguientes (serial).
let remisionDevuelta = "";
let uidDevuelto = "";

test.describe("lo devuelto llega al origen", () => {
  test("Lumia descarga el PDF del informe de la remisión DEVUELTA (200, application/pdf)", async () => {
    const href = await primerEnlace(lumia.page, "/remisiones?estado=DEVUELTA", /^\/remisiones\/(?!vinculos|nueva)[\w-]+$/);
    remisionDevuelta = href.split("/").pop()!;
    const r = await lumia.api.get(`/api/remisiones/${remisionDevuelta}/informe`);
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toContain("application/pdf");
    expect(r.headers()["cache-control"] ?? "").toContain("no-store");
    expect((await r.body()).subarray(0, 4).toString("latin1")).toBe("%PDF");
  });

  test("el destino (Radia) y quien no tiene sesión no descargan por esa ruta", async () => {
    expect((await radia.api.get(`/api/remisiones/${remisionDevuelta}/informe`)).status(), "Radia no es el origen: 404").toBe(404);
    const anonimo = await pwRequest.newContext({ baseURL: BASE });
    expect([401, 403, 404]).toContain((await anonimo.get(`/api/remisiones/${remisionDevuelta}/informe`, { maxRedirects: 0 })).status());
    await anonimo.dispose();
  });

  test("el visor autoriza (solo lectura) al origen el UID devuelto", async () => {
    expect((await lumia.page.goto(`/remisiones/${remisionDevuelta}`))?.status()).toBe(200);
    const enlace = await lumia.page.locator('a[href*="StudyInstanceUIDs="]').first().getAttribute("href");
    expect(enlace, "la ficha de la remisión devuelta debe traer el enlace al visor").toBeTruthy();
    uidDevuelto = decodeURIComponent(new URL(enlace!, BASE).searchParams.get("StudyInstanceUIDs") ?? "");
    expect(uidDevuelto).toMatch(/^[0-9.]{10,64}$/);
    const leer = (api: APIRequestContext, metodo: string) => api.get("/api/visor/autorizar", { headers: { "x-forwarded-uri": `/dicom-web/studies/${uidDevuelto}/series`, "x-forwarded-method": metodo } });
    expect((await leer(lumia.api, "GET")).status(), "Lumia (origen) lee el estudio devuelto").toBe(200);
    expect((await leer(radia.api, "GET")).status(), "Radia (dueño del estudio) lo lee").toBe(200);
    expect((await leer(lumia.api, "POST")).status(), "el origen no puede escribir: solo GET/HEAD").toBe(403);
    const anonimo = await pwRequest.newContext({ baseURL: BASE });
    expect((await anonimo.get("/api/visor/autorizar", { headers: { "x-forwarded-uri": `/dicom-web/studies/${uidDevuelto}/series`, "x-forwarded-method": "GET" } })).status(), "sin sesión: 401").toBe(401);
    await anonimo.dispose();
  });
});

test.describe("aislamiento entre centros", () => {
  test("el admin de Radia recibe 404 en un paciente de Lumia", async () => {
    const href = await primerEnlace(lumia.page, "/pacientes", /^\/pacientes\/(?!nuevo)[\w-]+$/);
    const r = await radia.page.goto(href);
    expect(r?.status(), `Radia abriendo ${href}`).toBe(404);
    const api = await radia.api.get(href, { maxRedirects: 0 });
    expect(api.status()).toBe(404);
  });

  test("el admin de Lumia recibe 404 en una orden de Radia", async () => {
    const href = await primerEnlace(radia.page, "/ordenes", /^\/ordenes\/(?!nueva)[\w-]+$/);
    const r = await lumia.page.goto(href);
    expect(r?.status(), `Lumia abriendo ${href}`).toBe(404);
  });

  test("un id de remisión que no es del centro (o no existe) da 404 en pantalla y en la API", async () => {
    for (const s of [lumia, radia]) {
      expect((await s.page.goto("/remisiones/id-que-no-existe"))?.status()).toBe(404);
      expect((await s.api.get("/api/remisiones/id-que-no-existe/informe")).status()).toBe(404);
    }
  });
});
