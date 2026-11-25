import fs from "node:fs";
import { test as setup, expect, request as pwRequest } from "@playwright/test";
import { URL_PROD, AUTH_DIR, authFile, CLAVES, dormir, loginUI } from "./helpers";

// Un login por usuario, espaciados ~3 s (rate limit 429); la sesion se reutiliza si tiene menos de 25 min (FORCE_LOGIN=1 la ignora).
fs.mkdirSync(AUTH_DIR, { recursive: true });
for (const clave of CLAVES) {
  setup(`login ${clave}`, async ({ page }) => {
    setup.setTimeout(300_000);
    const f = authFile(clave);
    if (!process.env.FORCE_LOGIN && fs.existsSync(f) && Date.now() - fs.statSync(f).mtimeMs < 25 * 60_000) {
      // Reutiliza la sesion solo si el servidor aun la acepta (un cierre de sesion de otra prueba la puede invalidar).
      const api = await pwRequest.newContext({ baseURL: URL_PROD, storageState: f });
      const r = await api.get("/inicio", { maxRedirects: 0 });
      await api.dispose();
      if (r.status() === 200) return;
    }
    await dormir(3_000);
    const status = await loginUI(page, clave);
    expect(status, `login ${clave}: sign-in respondio ${status}`).toBe(200);
    await page.waitForURL(/\/(inicio|perfil|plataforma|ingresar\/2fa)/, { timeout: 30_000 });
    expect(page.url(), `login ${clave} cayo en MFA: no esta exento`).not.toMatch(/2fa/);
    await page.context().storageState({ path: f });
  });
}
