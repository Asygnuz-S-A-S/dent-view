import fs from "node:fs";
import path from "node:path";
import { type Browser, type BrowserContext, type Page, type APIRequestContext, expect } from "@playwright/test";

// Las credenciales se leen en tiempo de ejecucion de un archivo FUERA del repo; nunca se escriben ni se imprimen.
const ENV_FILE = process.env.PROD_ENV_FILE ??
  "/private/tmp/claude-502/-Users-andres-Documents-Asygnuz/abf10c37-95db-4ff9-a15f-7828b60fd844/scratchpad/prod.env";

export type Clave =
  | "LUMIA_ADMIN" | "RADIA_ADMIN" | "RADIA_RECEPCION" | "RADIA_RADIOLOGO" | "LUMIAODONTO_ADMIN" | "LUMIAODONTO_RECEPCION"
  | "AURORA_ADMIN" | "AURORA_RECEPCION" | "AURORA_PAULA" | "AURORA_CAMILO" | "ALEJANDRO_ADMIN";

export const CLAVES: Clave[] = [
  "LUMIA_ADMIN", "RADIA_ADMIN", "RADIA_RECEPCION", "RADIA_RADIOLOGO", "LUMIAODONTO_ADMIN", "LUMIAODONTO_RECEPCION",
  "AURORA_ADMIN", "AURORA_RECEPCION", "AURORA_PAULA", "AURORA_CAMILO", "ALEJANDRO_ADMIN",
];

export function credencial(clave: Clave): { correo: string; clave: string } {
  const linea = fs.readFileSync(ENV_FILE, "utf8").split("\n").find((l) => l.startsWith(`${clave}=`));
  if (!linea) throw new Error(`Falta ${clave} en el archivo de credenciales`);
  const [correo, pass] = linea.slice(clave.length + 1).trim().split("|");
  return { correo: correo!, clave: pass! };
}

export const AUTH_DIR = path.join(process.cwd(), "tests/produccion/.auth");
export const authFile = (c: Clave) => path.join(AUTH_DIR, `${c}.json`);
export const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Login por la UI; devuelve el status de /api/auth/sign-in/email. Reintenta tras 60 s si hay 429. */
export async function loginUI(page: Page, clave: Clave, pass?: string): Promise<number> {
  const cred = credencial(clave);
  let status = 0;
  for (let i = 0; i < 4; i++) {
    await page.goto("/ingresar");
    await page.getByLabel("Correo").fill(cred.correo);
    await page.getByLabel("Contraseña").fill(pass ?? cred.clave);
    const resp = page.waitForResponse((r) => r.url().includes("/api/auth/sign-in/email"));
    await page.getByRole("button", { name: "Ingresar" }).click();
    status = (await resp).status();
    if (status !== 429) return status;
    await dormir(60_000);
  }
  return status;
}

/** Contexto nuevo con la sesion guardada del usuario. */
export async function contextoDe(browser: Browser, clave: Clave, opts: Parameters<Browser["newContext"]>[0] = {}): Promise<BrowserContext> {
  return browser.newContext({ ...opts, storageState: authFile(clave) });
}

export const URL_PROD = process.env.BASE_URL ?? "https://dentview.asygnuz.com";

/** Escucha consola y red: errores de consola, violaciones CSP y respuestas 4xx/5xx de la propia app. */
export function vigilar(page: Page, ignorar: RegExp[] = []) {
  const consola: string[] = [];
  const red: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") consola.push(m.text());
  });
  page.on("pageerror", (e) => consola.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    const u = r.url();
    if (r.status() >= 400 && u.startsWith(URL_PROD) && !ignorar.some((x) => x.test(u))) red.push(`${r.status()} ${new URL(u).pathname}`);
  });
  return { consola, red };
}

export const sinScrollHorizontal = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

export const ahoraQA = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}${p(d.getMinutes())}`;
};

export async function menuVisible(page: Page): Promise<string[]> {
  await page.goto("/inicio");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  // En movil el menu es un sheet: se abre con el boton de la barra.
  const lateral = page.locator('[data-sidebar="sidebar"]').first();
  if (!(await lateral.isVisible())) await page.locator('[data-sidebar="trigger"]').first().click();
  return (await page.locator('[data-sidebar="menu-button"] span, [data-sidebar="content"] a span').allTextContents()).map((t) => t.trim()).filter(Boolean);
}

export type Api = APIRequestContext;

// ---- Estado y registros (en .auth/, ignorado por git; los retries reinician el worker, por eso va a disco) ----
const ESTADO = path.join(AUTH_DIR, "estado.json");
export const leerEstado = (): Record<string, string> => (fs.existsSync(ESTADO) ? JSON.parse(fs.readFileSync(ESTADO, "utf8")) : {});
export const guardarEstado = (p: Record<string, string>) => fs.writeFileSync(ESTADO, JSON.stringify({ ...leerEstado(), ...p }, null, 2));

/** Cada registro creado en produccion queda anotado para poder limpiarlo despues. */
export function registrar(centro: string, tipo: string, id: string, nombre: string) {
  fs.appendFileSync(path.join(AUTH_DIR, "registros-qa.ndjson"), JSON.stringify({ cuando: new Date().toISOString(), centro, tipo, id, nombre }) + "\n");
}
export function anotarTiempo(proyecto: string, ruta: string, ttfb: number, carga: number) {
  fs.appendFileSync(path.join(AUTH_DIR, "tiempos.ndjson"), JSON.stringify({ cuando: new Date().toISOString(), proyecto, ruta, ttfb, carga }) + "\n");
}

export const cop = (s: string) => Number(s.replace(/[^\d]/g, ""));

export async function tiemposNavegacion(page: Page) {
  return page.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    return { ttfb: Math.round(n.responseStart - n.startTime), carga: Math.round(n.loadEventEnd - n.startTime) };
  });
}

/** Franjas de 15 min entre 07:00 y 17:45. */
export const FRANJAS = Array.from({ length: 44 }, (_, i) => `${String(7 + Math.floor(i / 4)).padStart(2, "0")}:${["00", "15", "30", "45"][i % 4]}`);
