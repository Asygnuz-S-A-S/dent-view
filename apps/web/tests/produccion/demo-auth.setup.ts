import fs from "node:fs";
import { test as setup, expect, request as pwRequest } from "@playwright/test";
import { AUTH_DIR, URL_PROD, USUARIOS, authFile, dormir, loginUI } from "./demo-helpers";

// Un login por usuario, espaciados ~6 s (limite 429). Reutiliza la sesion si tiene < 25 min y el servidor la acepta.
fs.mkdirSync(AUTH_DIR, { recursive: true });
for (const u of USUARIOS) {
  setup(`login ${u}`, async ({ page }) => {
    setup.setTimeout(300_000);
    const f = authFile(u);
    if (!process.env.FORCE_LOGIN && fs.existsSync(f) && Date.now() - fs.statSync(f).mtimeMs < 25 * 60_000) {
      const api = await pwRequest.newContext({ baseURL: URL_PROD, storageState: f });
      const r = await api.get("/inicio", { maxRedirects: 0 });
      await api.dispose();
      if (r.status() === 200) return;
    }
    await dormir(6_000);
    const status = await loginUI(page, u);
    expect(status, `login ${u}: sign-in respondio ${status}`).toBe(200);
    await page.waitForURL(/\/(inicio|perfil|plataforma|ingresar\/2fa)/, { timeout: 30_000 });
    expect(page.url(), `login ${u} cayo en MFA`).not.toMatch(/2fa/);
    await page.context().storageState({ path: f });
  });
}
