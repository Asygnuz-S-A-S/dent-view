import fs from "node:fs";
import { devices, expect, test, type APIRequest, type Browser, type Locator, type Page } from "@playwright/test";
import { authFile } from "./helpers";

// Integraciones (Configuración -> Integraciones): API y tokens, webhooks y conectores. Sesión de admin (Radex demo).
test.use({ storageState: authFile("admin") });
test.describe.configure({ mode: "serial" });

const SUFIJO = String(Date.now()).slice(-6);
const TOKEN_NOMBRE = `QA token ${SUFIJO}`;
const WEBHOOK_NOMBRE = `QA webhook ${SUFIJO}`;
const CREDENCIAL = `clinica-qa-${SUFIJO}`;
const EVIDENCIAS = "../../docs/qa/evidencias/integraciones";
const RUTAS = { api: "/integraciones/api", webhooks: "/integraciones/webhooks", conectores: "/integraciones/conectores" } as const;
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080";

test.beforeAll(() => fs.mkdirSync(EVIDENCIAS, { recursive: true }));

// Los avisos se apilan: se busca por tipo y texto, no "el último".
const aviso = (page: Page, tipo: "success" | "error", texto: string) => page.locator(`[data-sonner-toast][data-type="${tipo}"]`).filter({ hasText: texto }).first();
const captura = (page: Page, nombre: string) => page.screenshot({ path: `${EVIDENCIAS}/${nombre}.png`, fullPage: true });

/** Contexto sin cookies: las peticiones salen solo con el token que se les ponga. */
async function apiLimpia(playwright: { request: Pick<APIRequest, "newContext"> }) {
  return playwright.request.newContext({ baseURL: BASE, storageState: undefined });
}

/** Abre una ruta con la sesión de otro rol (sin volver a iniciar sesión) y devuelve estado y HTML. */
async function comoOtro(browser: Browser, rol: "admin2" | "doctor", ruta: string) {
  const ctx = await browser.newContext({ storageState: authFile(rol) });
  try {
    const page = await ctx.newPage();
    const r = await page.goto(ruta);
    return { status: r?.status() ?? 0, url: page.url(), html: await page.content() };
  } finally {
    await ctx.close();
  }
}

/** iPhone 13 sobre Chrome (como el proyecto "mobile"): sin scroll horizontal del documento y captura. */
async function movil(browser: Browser, ruta: string, nombre: string) {
  const { defaultBrowserType: _omitido, ...iphone } = devices["iPhone 13"];
  const ctx = await browser.newContext({ ...iphone, storageState: authFile("admin") });
  try {
    const page = await ctx.newPage();
    await page.goto(ruta);
    await expect(page.getByRole("heading", { level: 1, name: "Integraciones" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Secciones de integraciones" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await captura(page, `${nombre}-movil`);
  } finally {
    await ctx.close();
  }
}

const tarjeta = (page: Page, titulo: RegExp): Locator =>
  page.locator('[data-slot="card"]').filter({ has: page.locator('[data-slot="card-title"]', { hasText: titulo }) });

test("/integraciones redirige a /integraciones/api y las pestañas navegan", async ({ page }) => {
  await page.goto("/integraciones");
  await expect(page).toHaveURL(/\/integraciones\/api$/);
  await expect(page.getByRole("heading", { level: 1, name: "Integraciones" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Secciones de integraciones" });
  await expect(nav.getByRole("link", { name: "API y tokens" })).toHaveAttribute("aria-current", "page");
  await nav.getByRole("link", { name: "Webhooks" }).click();
  await expect(page).toHaveURL(/\/integraciones\/webhooks$/);
  await nav.getByRole("link", { name: "Conectores" }).click();
  await expect(page).toHaveURL(/\/integraciones\/conectores$/);
});

test.describe("API y tokens", () => {
  let token = "";
  let prefijo = "";

  test("crear un token de solo lectura muestra el valor completo una sola vez", async ({ page }) => {
    await page.goto(RUTAS.api);
    await page.getByRole("button", { name: "Crear token" }).click();
    const dlg = page.getByRole("dialog", { name: "Crear token de API" });
    await dlg.getByLabel("Nombre").fill(TOKEN_NOMBRE);
    await dlg.getByRole("button", { name: "Solo lectura" }).click();
    await expect(dlg.getByRole("checkbox", { name: "Escribir" }).first()).not.toBeChecked();
    await dlg.getByRole("button", { name: "Crear token" }).click();
    const dlg2 = page.getByRole("dialog", { name: "Copia tu token ahora" });
    const campo = dlg2.getByLabel("Token de API");
    await expect(campo).toHaveValue(/^dvk_[A-Za-z0-9_-]{8}_[A-Za-z0-9_-]{40,}$/);
    token = await campo.inputValue();
    prefijo = token.split("_").slice(0, 2).join("_");
    await dlg2.getByRole("button", { name: "Listo" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const fila = page.getByRole("row", { name: new RegExp(TOKEN_NOMBRE) });
    await expect(fila).toContainText(`${prefijo}…`);
    await expect(fila).toContainText("Activo");
    await expect(fila).not.toContainText(token);
    await captura(page, "api-escritorio");
    await movil(page.context().browser()!, RUTAS.api, "api");
  });

  test("el token funciona de solo lectura: 200 en GET, 403 en POST", async ({ playwright }) => {
    const api = await apiLimpia(playwright);
    const h = { Authorization: `Bearer ${token}` };
    for (const ruta of ["/api/v1/pacientes", "/api/v1/catalogo"]) {
      const r = await api.get(ruta, { headers: h });
      expect(r.status(), ruta).toBe(200);
      const cuerpo = await r.json();
      expect(Array.isArray(cuerpo.datos), `${ruta} trae { datos: [] }`).toBe(true);
    }
    const w = await api.post("/api/v1/pacientes", { headers: h, data: { tipoDocumento: "CC", numeroDocumento: `88${SUFIJO}`, nombre: "QA Sin Permiso" } });
    expect(w.status()).toBe(403);
    await api.dispose();
  });

  test("sin token y con token inválido dan el mismo 401; openapi.json es público", async ({ playwright }) => {
    const api = await apiLimpia(playwright);
    const sin = await api.get("/api/v1/pacientes");
    const malo = await api.get("/api/v1/pacientes", { headers: { Authorization: "Bearer dvk_noexiste_" + "x".repeat(43) } });
    expect(sin.status()).toBe(401);
    expect(malo.status()).toBe(401);
    expect(await malo.text()).toBe(await sin.text());
    const spec = await api.get("/api/v1/openapi.json");
    expect(spec.status()).toBe(200);
    expect((await spec.json()).openapi).toMatch(/^3\./);
    // MCP: sin token no hay acceso.
    const mcp = await api.post("/api/mcp", { data: { jsonrpc: "2.0", id: 1, method: "tools/list" }, headers: { Accept: "application/json, text/event-stream" } });
    expect(mcp.status()).toBe(401);
    await api.dispose();
  });

  test("al recargar solo se ve el prefijo; otro centro no ve el token", async ({ page, browser }) => {
    await page.goto(RUTAS.api);
    await page.reload();
    const fila = page.getByRole("row", { name: new RegExp(TOKEN_NOMBRE) });
    await expect(fila).toContainText(`${prefijo}…`);
    expect(await page.content()).not.toContain(token);
    const ajeno = await comoOtro(browser, "admin2", RUTAS.api);
    expect(ajeno.status).toBe(200);
    expect(ajeno.html).not.toContain(TOKEN_NOMBRE);
    expect(ajeno.html).not.toContain(prefijo);
  });

  test("revocar con confirmación deja el token sin acceso (401)", async ({ page, playwright }) => {
    await page.goto(RUTAS.api);
    const fila = page.getByRole("row", { name: new RegExp(TOKEN_NOMBRE) });
    await fila.getByRole("button", { name: "Revocar" }).click();
    const conf = page.getByRole("alertdialog", { name: `¿Revocar "${TOKEN_NOMBRE}"?` });
    await conf.getByRole("button", { name: "Volver" }).click();
    await expect(fila).toContainText("Activo"); // cancelar no revoca
    await fila.getByRole("button", { name: "Revocar" }).click();
    await conf.getByRole("button", { name: "Revocar" }).click();
    await expect(aviso(page, "success", "Token revocado")).toBeVisible();
    await expect(fila).toContainText("Revocado");
    await expect(fila.getByRole("button", { name: "Revocar" })).toHaveCount(0);
    const api = await apiLimpia(playwright);
    const r = await api.get("/api/v1/pacientes", { headers: { Authorization: `Bearer ${token}` } });
    const sin = await api.get("/api/v1/pacientes");
    expect(r.status()).toBe(401);
    expect(await r.text()).toBe(await sin.text());
    await api.dispose();
  });
});

test.describe("Webhooks", () => {
  async function abrirNuevo(page: Page) {
    await page.getByRole("button", { name: "Nuevo webhook" }).click();
    return page.getByRole("dialog", { name: "Nuevo webhook" });
  }

  test("rechaza URLs internas con un mensaje claro", async ({ page }) => {
    await page.goto(RUTAS.webhooks);
    for (const url of ["https://169.254.169.254/x", "https://192.168.1.10/x", "http://localhost:9999/x"]) {
      const dlg = await abrirNuevo(page);
      await dlg.getByLabel("Nombre").fill(`QA interno ${SUFIJO}`);
      await dlg.getByLabel("URL de destino").fill(url);
      await dlg.getByRole("checkbox", { name: "Todos los eventos" }).check();
      await dlg.getByRole("button", { name: "Crear webhook" }).click();
      await expect(dlg.getByRole("alert"), url).toContainText(/no está permitida|debe empezar con https|no permitido|no es válida|dominio completo/i);
      await expect(page.getByRole("dialog", { name: "Secreto de firma" })).toHaveCount(0);
      await dlg.getByRole("button", { name: "Cancelar" }).click();
    }
    await expect(page.getByText(`QA interno ${SUFIJO}`)).toHaveCount(0);
  });

  test("crear, ver secreto una vez, rotar, desactivar y eliminar", async ({ page, browser }) => {
    await page.goto(RUTAS.webhooks);
    const dlg = await abrirNuevo(page);
    await dlg.getByLabel("Nombre").fill(WEBHOOK_NOMBRE);
    await dlg.getByLabel("URL de destino").fill("https://example.com/hook");
    await dlg.getByRole("checkbox", { name: "Todos los eventos" }).check();
    await dlg.getByRole("button", { name: "Crear webhook" }).click();
    const sec = page.getByRole("dialog", { name: "Secreto de firma" });
    const campo = sec.getByLabel("Secreto");
    await expect(campo).toHaveValue(/^whsec_/);
    const secreto1 = await campo.inputValue();
    await sec.getByRole("button", { name: "Ya lo guardé" }).click();

    const fila = page.getByRole("row", { name: new RegExp(WEBHOOK_NOMBRE) });
    await expect(fila).toContainText("https://example.com/hook");
    await expect(fila).toContainText("Todos");
    await captura(page, "webhooks-escritorio");
    await movil(browser, RUTAS.webhooks, "webhooks");

    // El secreto no vuelve a mostrarse, ni a otro centro se le muestra el webhook.
    await page.reload();
    await expect(fila).toBeVisible();
    expect(await page.content()).not.toContain(secreto1);
    const ajeno = await comoOtro(browser, "admin2", RUTAS.webhooks);
    expect(ajeno.html).not.toContain(WEBHOOK_NOMBRE);

    // Rotar (con confirmación): secreto nuevo y distinto.
    await fila.getByRole("button", { name: `Rotar secreto de ${WEBHOOK_NOMBRE}` }).click();
    await page.getByRole("alertdialog", { name: "¿Rotar el secreto?" }).getByRole("button", { name: "Rotar" }).click();
    const campo2 = page.getByRole("dialog", { name: "Secreto de firma" }).getByLabel("Secreto");
    await expect(campo2).toHaveValue(/^whsec_/);
    expect(await campo2.inputValue()).not.toBe(secreto1);
    await page.getByRole("dialog", { name: "Secreto de firma" }).getByRole("button", { name: "Ya lo guardé" }).click();

    // Desactivar.
    await fila.getByRole("switch", { name: `Desactivar ${WEBHOOK_NOMBRE}` }).click();
    await expect(aviso(page, "success", "Webhook desactivado")).toBeVisible();
    await expect(fila.getByRole("switch", { name: `Activar ${WEBHOOK_NOMBRE}` })).not.toBeChecked();

    // Eliminar con confirmación (cancelar no borra).
    await fila.getByRole("button", { name: `Eliminar ${WEBHOOK_NOMBRE}` }).click();
    const conf = page.getByRole("alertdialog", { name: `¿Eliminar "${WEBHOOK_NOMBRE}"?` });
    await conf.getByRole("button", { name: "Volver" }).click();
    await expect(fila).toBeVisible();
    await fila.getByRole("button", { name: `Eliminar ${WEBHOOK_NOMBRE}` }).click();
    await conf.getByRole("button", { name: "Eliminar", exact: true }).click();
    await expect(aviso(page, "success", "Webhook eliminado")).toBeVisible();
    await expect(page.getByText(WEBHOOK_NOMBRE)).toHaveCount(0);
  });
});

test.describe("Conectores", () => {
  test("el catálogo trae Simulado y Dentalink (este último, no probado)", async ({ page }) => {
    await page.goto(RUTAS.conectores);
    await expect(tarjeta(page, /^Simulado/)).toBeVisible();
    const dental = tarjeta(page, /^Dentalink$/);
    await expect(dental).toBeVisible();
    await expect(dental).toContainText("no probado contra una cuenta real");
    await expect(tarjeta(page, /^Simulado/)).not.toContainText("no probado");
  });

  test("configurar el simulado, probar, guardar, sincronizar y eliminar", async ({ page, browser }) => {
    test.setTimeout(120_000);
    await page.goto(RUTAS.conectores);
    const sim = tarjeta(page, /^Simulado/);
    // Una corrida anterior interrumpida pudo dejarlo configurado.
    if (await sim.getByRole("button", { name: "Eliminar" }).isVisible()) {
      await sim.getByRole("button", { name: "Eliminar" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Eliminar", exact: true }).click();
      await expect(sim.getByText("Sin configurar")).toBeVisible();
    }
    const campo = sim.getByLabel("Código de la clínica de prueba");
    await expect(sim.getByRole("button", { name: "Guardar y conectar" })).toBeDisabled(); // faltan credenciales

    // Credenciales rechazadas -> error claro; correctas -> éxito.
    await campo.fill("fallar");
    await sim.getByRole("button", { name: "Probar conexión" }).click();
    await expect(aviso(page, "error", "rechazó las credenciales")).toBeVisible();
    await campo.fill(CREDENCIAL);
    await sim.getByRole("button", { name: "Probar conexión" }).click();
    await expect(aviso(page, "success", "Conexión simulada correcta")).toBeVisible();

    await sim.getByRole("button", { name: "Guardar y conectar" }).click();
    await expect(aviso(page, "success", "Conexión guardada")).toBeVisible();
    // Secreto del webhook de entrada: visible ahora y no después.
    const secreto = sim.getByLabel("Secreto del webhook de entrada");
    await expect(secreto).not.toHaveValue("");
    const secretoValor = await secreto.inputValue();
    await sim.getByRole("button", { name: "Ya lo guardé" }).click();
    await expect(secreto).toHaveCount(0);
    const url = sim.getByLabel("URL del webhook de entrada");
    await expect(url).toHaveValue(/\/api\/integraciones\/entrada\/[A-Za-z0-9_-]+$/);
    const urlValor = await url.inputValue();

    // Las credenciales nunca vuelven al navegador.
    await expect(sim.getByText("Configuradas")).toBeVisible();
    await expect(sim.locator("input:not([readonly])")).toHaveCount(0); // sin campos de credencial editables ni con valor
    expect(await page.content()).not.toContain(CREDENCIAL);

    await sim.getByRole("button", { name: "Sincronizar ahora" }).click();
    await expect(aviso(page, "success", "Sincronizado")).toBeVisible();
    await expect(sim.getByText("Correcta")).toBeVisible();
    const vinculados = sim.getByText("Registros vinculados").locator("xpath=following-sibling::dd[1]");
    await expect.poll(async () => Number(await vinculados.innerText())).toBeGreaterThan(0);
    await captura(page, "conectores-escritorio");
    await movil(browser, RUTAS.conectores, "conectores");

    // Tras recargar, ni credenciales ni secreto; otro centro no ve la integración.
    await page.reload();
    expect(await page.content()).not.toContain(CREDENCIAL);
    expect(await page.content()).not.toContain(secretoValor);
    await expect(sim.getByLabel("Secreto del webhook de entrada")).toHaveCount(0);
    const ajeno = await comoOtro(browser, "admin2", RUTAS.conectores);
    expect(ajeno.html).not.toContain(urlValor.split("/").pop()!);

    // Eliminar con confirmación (cancelar conserva).
    await sim.getByRole("button", { name: "Eliminar" }).click();
    const conf = page.getByRole("alertdialog", { name: /¿Eliminar la conexión con Simulado/ });
    await conf.getByRole("button", { name: "Volver" }).click();
    await expect(sim.getByRole("button", { name: "Sincronizar ahora" })).toBeVisible();
    await sim.getByRole("button", { name: "Eliminar" }).click();
    await conf.getByRole("button", { name: "Eliminar", exact: true }).click();
    await expect(aviso(page, "success", "Conexión eliminada")).toBeVisible();
    await expect(sim.getByText("Sin configurar")).toBeVisible();
  });
});

test.describe("Permisos y aislamiento", () => {
  for (const ruta of Object.values(RUTAS)) {
    test(`doctor recibe 404 en ${ruta}`, async ({ browser }) => {
      const r = await comoOtro(browser, "doctor", ruta);
      expect(r.status).toBe(404);
    });
    test(`admin2 entra a ${ruta} y no ve datos de Radex`, async ({ browser }) => {
      const r = await comoOtro(browser, "admin2", ruta);
      expect(r.status).toBe(200);
      expect(r.html).not.toContain("QA token");
      expect(r.html).not.toContain("QA webhook");
    });
  }
});

test.describe("Responsive (iPhone 13)", () => {
  for (const [nombre, ruta] of Object.entries(RUTAS)) {
    test(`${nombre}: sin scroll horizontal`, async ({ browser }) => {
      await movil(browser, ruta, `${nombre}-limpio`);
    });
  }
});

test("capturas de escritorio de las tres pestañas (estado final)", async ({ page }) => {
  for (const [nombre, ruta] of Object.entries(RUTAS)) {
    await page.goto(ruta);
    await expect(page.getByRole("heading", { level: 1, name: "Integraciones" })).toBeVisible();
    await captura(page, `${nombre}-escritorio-limpio`);
  }
});
