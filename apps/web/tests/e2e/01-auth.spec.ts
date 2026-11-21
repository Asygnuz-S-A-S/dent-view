import { expect, test } from "@playwright/test";
import { authFile, PASSWORD, ROLES } from "./helpers";
import { completarMfa } from "./mfa";

test.describe("login sin sesión", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("ruta protegida sin sesión redirige a /ingresar", async ({ page }) => {
    await page.goto("/pacientes");
    await expect(page).toHaveURL(/\/ingresar/);
  });

  test("credenciales incorrectas muestran error y no entran", async ({ page }) => {
    await page.goto("/ingresar");
    await page.getByLabel("Correo").fill(ROLES.admin);
    await page.getByLabel("Contraseña").fill("incorrecta-123");
    await page.getByRole("button", { name: "Ingresar" }).click();
    // Con muchos logins seguidos el servidor responde 429: la app lo distingue con su propio mensaje.
    await expect(page.getByRole("alert").filter({ hasText: /incorrectos|Demasiados intentos/ })).toBeVisible();
    await expect(page).toHaveURL(/\/ingresar/);
  });

  test("login correcto del superadmin termina en /plataforma", async ({ page }) => {
    await page.goto("/ingresar");
    await page.getByLabel("Correo").fill(ROLES.superadmin);
    await page.getByLabel("Contraseña").fill(PASSWORD);
    const resp = page.waitForResponse((r) => r.url().includes("/api/auth/sign-in/email"));
    await page.getByRole("button", { name: "Ingresar" }).click();
    test.skip((await resp).status() === 429, "Límite de intentos (429): el login correcto ya lo cubre el proyecto setup");
    // El superadmin tiene MFA obligatorio: pasa por /ingresar/2fa.
    await expect(page).toHaveURL(/\/ingresar\/2fa/);
    await completarMfa(page, "superadmin");
    await expect(page).toHaveURL(/\/plataforma/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});

test.describe("redirección según rol (sesión guardada)", () => {
  test.describe("admin", () => {
    test.use({ storageState: authFile("admin") });
    test("/ lleva a /inicio", async ({ page }) => {
      await page.goto("/");
      await expect(page).toHaveURL(/\/inicio$/);
    });
    test("/plataforma no es accesible para un admin de centro", async ({ page }) => {
      const r = await page.goto("/plataforma");
      expect(r?.status(), "esperado 404/403 o redirección").not.toBe(200);
    });
  });

  test.describe("superadmin", () => {
    test.use({ storageState: authFile("superadmin") });
    test("/ lleva a /plataforma", async ({ page }) => {
      await page.goto("/");
      await expect(page).toHaveURL(/\/plataforma/);
    });
  });

  test.describe("doctor remitente", () => {
    test.use({ storageState: authFile("doctor") });
    test("/ lleva a /inicio", async ({ page }) => {
      await page.goto("/");
      await expect(page).toHaveURL(/\/inicio$/);
    });
  });
});
