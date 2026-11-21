import fs from "node:fs";
import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";
import { expect, type Page } from "@playwright/test";
import { PASSWORD, type Rol } from "./helpers";

// MFA de los usuarios demo (admin_tenant y superadmin lo tienen obligatorio).
// El secreto TOTP lo crea la primera corrida al activar el MFA desde /perfil y se guarda SOLO en tests/e2e/.auth/
// (gitignored, permisos 0600). Si se pierde, desactiva el MFA de ese usuario en la base de pruebas (ver README).
const archivo = (rol: Rol) => `tests/e2e/.auth/totp-${rol}.txt`;
// La clave que muestra /perfil (y la URI otpauth) viene en base32; createOTP espera el secreto ya decodificado.
const totp = (rol: Rol) => createOTP(base32.decode(fs.readFileSync(archivo(rol), "utf8").trim().toUpperCase())).totp();

/** Envía un formulario de código y reintenta si el límite de /two-factor/* (3 cada 10 s) responde 429. */
async function enviarCodigo(page: Page, campo: string, rol: Rol, boton: string) {
  for (let intento = 0; intento < 4; intento++) {
    await page.locator(campo).fill(await totp(rol));
    await page.getByRole("button", { name: boton, exact: true }).click();
    const limite = page.getByRole("alert").filter({ hasText: "Demasiados intentos" });
    const ok = await limite.waitFor({ timeout: 3_000 }).then(() => false, () => true);
    if (ok) return;
    await new Promise((r) => setTimeout(r, 11_000));
  }
  throw new Error(`MFA ${rol}: 429 persistente`);
}

/** Después de correo + contraseña: resuelve el paso de código o, si el rol lo exige y aún no está activo, lo activa en /perfil. */
export async function completarMfa(page: Page, rol: Rol) {
  await page.waitForURL((u) => !u.pathname.startsWith("/ingresar") || u.pathname === "/ingresar/2fa");
  if (new URL(page.url()).pathname === "/ingresar/2fa") {
    if (!fs.existsSync(archivo(rol))) throw new Error(`${rol} tiene MFA activo pero falta ${archivo(rol)} (ver README, sección MFA en E2E)`);
    await enviarCodigo(page, "#codigo", rol, "Verificar");
    await page.waitForURL((u) => !u.pathname.startsWith("/ingresar"));
    return;
  }
  await page.goto("/");
  if (new URL(page.url()).pathname !== "/perfil" || !(await page.getByText("exige la verificación en dos pasos").isVisible())) return;
  await page.locator("#clave-mfa").fill(PASSWORD);
  await page.getByRole("button", { name: "Configurar" }).click();
  const secreto = (await page.getByText("¿No puedes escanearlo?").locator("code").textContent())!.trim();
  fs.writeFileSync(archivo(rol), secreto, { mode: 0o600 });
  await enviarCodigo(page, "#codigo-mfa", rol, "Activar");
  await page.getByRole("button", { name: "Ya los guardé" }).click();
  await page.goto("/");
  await expect(page).not.toHaveURL(/\/perfil/);
}
