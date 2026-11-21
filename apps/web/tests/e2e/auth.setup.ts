import fs from "node:fs";
import { expect, test as setup } from "@playwright/test";
import { authFile, PASSWORD, ROLES, type Rol } from "./helpers";
import { completarMfa } from "./mfa";

// Un login por rol (el endpoint responde 429 tras pocos intentos); reintenta esperando si hay límite.
for (const rol of Object.keys(ROLES) as Rol[]) {
  setup(`login ${rol}`, async ({ page }) => {
    setup.setTimeout(240_000);
    // Reutiliza una sesión de menos de 20 min para no agotar el límite de intentos (FORCE_LOGIN=1 la ignora).
    const f = authFile(rol);
    if (!process.env.FORCE_LOGIN && fs.existsSync(f) && Date.now() - fs.statSync(f).mtimeMs < 20 * 60_000) return;
    for (let intento = 0; intento < 6; intento++) {
      await page.goto("/ingresar");
      await page.getByLabel("Correo").fill(ROLES[rol]);
      await page.getByLabel("Contraseña").fill(PASSWORD);
      const resp = page.waitForResponse((r) => r.url().includes("/api/auth/sign-in/email"));
      await page.getByRole("button", { name: "Ingresar" }).click();
      const status = (await resp).status();
      if (status === 429) { await new Promise((r) => setTimeout(r, 30_000)); continue; }
      expect(status).toBe(200);
      await completarMfa(page, rol);
      await page.context().storageState({ path: authFile(rol) });
      return;
    }
    throw new Error(`Login ${rol}: 429 persistente`);
  });
}
