import fs from "node:fs";
import path from "node:path";
import { type Page } from "@playwright/test";

// Credenciales de la demo: se leen en tiempo de ejecucion de un archivo FUERA del repo; nunca se escriben ni se imprimen.
const ENV_FILE = process.env.DEMO_ENV_FILE ??
  "/private/tmp/claude-502/-Users-andres-Documents-Asygnuz/abf10c37-95db-4ff9-a15f-7828b60fd844/scratchpad/prod-demo.env";

export const USUARIOS = [
  "LUMIA_ADMIN", "LUMIA_RECEPCION", "LUMIA_RADIOLOGO", "LUMIA_DOCTOR",
  "RADIA_ADMIN", "RADIA_RECEPCION", "RADIA_RADIOLOGO",
  "ALEJANDRO_ADMIN", "ORION_ADMIN", "ORION_TECNICO",
] as const;
export type Usuario = (typeof USUARIOS)[number];

const env = (): Record<string, string> =>
  Object.fromEntries(fs.readFileSync(ENV_FILE, "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));

export const credencial = (u: Usuario) => {
  const e = env();
  if (!e[u] || !e.CLAVE_DEMO) throw new Error(`Falta ${u} o CLAVE_DEMO en el archivo de credenciales`);
  return { correo: e[u]!, clave: e.CLAVE_DEMO! };
};

export const URL_PROD = process.env.BASE_URL ?? "https://dentview.asygnuz.com";
export const AUTH_DIR = path.join(process.cwd(), "tests/produccion/.auth");
export const authFile = (u: Usuario) => path.join(AUTH_DIR, `demo-${u}.json`);
export const CAPTURAS = "test-results-produccion/demo";
export const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const PAGINA_ERROR = /Application error|Algo salió mal|No encontramos esta página|Internal Server Error|Error inesperado/i;
export const MALOS = /\bNaN\b|undefined|\[object Object\]|Invalid Date|\bnull\b/;

export const foto = (page: Page, nombre: string, fullPage = true) => {
  fs.mkdirSync(CAPTURAS, { recursive: true });
  return page.screenshot({ path: path.join(CAPTURAS, `${nombre.replace(/[^\w-]+/g, "_")}.png`), fullPage });
};

/** Anota un hallazgo/medicion (ndjson en carpeta ignorada por git). */
export function anotar(tipo: string, datos: Record<string, unknown>) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.appendFileSync(path.join(AUTH_DIR, "demo-hallazgos.ndjson"), JSON.stringify({ t: new Date().toISOString(), tipo, ...datos }) + "\n");
}

/** Login por la UI; devuelve el status de sign-in. Reintenta tras 60 s si hay 429. */
export async function loginUI(page: Page, u: Usuario): Promise<number> {
  const c = credencial(u);
  let status = 0;
  for (let i = 0; i < 4; i++) {
    await page.goto("/ingresar");
    await page.getByLabel("Correo").fill(c.correo);
    await page.getByLabel("Contraseña").fill(c.clave);
    const resp = page.waitForResponse((r) => r.url().includes("/api/auth/sign-in/email"));
    await page.getByRole("button", { name: "Ingresar" }).click();
    status = (await resp).status();
    if (status !== 429) return status;
    await dormir(60_000);
  }
  return status;
}

/** Escucha consola y red propia: errores de consola y respuestas 4xx/5xx. */
export function vigilar(page: Page) {
  const consola: string[] = [];
  const red: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") consola.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => consola.push(`pageerror: ${e.message.slice(0, 200)}`));
  page.on("response", (r) => {
    const u = r.url();
    if (r.status() >= 400 && u.startsWith(URL_PROD)) red.push(`${r.status()} ${new URL(u).pathname}`);
  });
  return { consola, red };
}
