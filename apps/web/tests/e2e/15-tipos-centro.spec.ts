import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { authFile } from "./helpers";

// Tipos de centro: el superadmin crea un centro de cada tipo desde /plataforma y se comprueba que el menú
// y el guard del servidor (404) cambian según el tipo. Los centros se llaman "QA tipos ..." y se borran al final.
test.use({ storageState: authFile("superadmin") });
test.describe.configure({ mode: "serial" });

const SUFIJO = String(Date.now()).slice(-6);
const CASOS = [
  {
    tipo: "Centro radiológico", slug: "radiologico",
    con: ["Seguimiento de doctores", "Doctores remitentes", "Convenios y tarifas"], sin: ["Laboratorio", "Odontólogos"], bloqueada: "/laboratorio",
  },
  {
    tipo: "Centro odontológico", slug: "odontologico",
    con: ["Laboratorio", "Odontólogos", "Cartera"], sin: ["Seguimiento de doctores", "Convenios y tarifas", "Estaciones de ingesta"], bloqueada: "/seguimiento-doctores",
  },
  {
    tipo: "Clínica odontológica", slug: "clinica",
    con: ["Laboratorio", "Odontólogos"], sin: ["Seguimiento de doctores", "Doctores remitentes"], bloqueada: "/convenios",
  },
  {
    tipo: "Odontólogo particular", slug: "particular",
    con: ["Pacientes", "Agenda", "Estudios", "Facturación"], sin: ["Usuarios del centro", "Cartera", "Odontólogos"], bloqueada: "/usuarios",
  },
].map((c) => ({ ...c, nombre: `QA tipos ${c.slug} ${SUFIJO}`, correo: `qa-tipos-${c.slug}-${SUFIJO}@dentview.demo` }));

async function crear(page: Page, c: (typeof CASOS)[number]) {
  await page.goto("/plataforma");
  await page.getByRole("button", { name: "Nuevo centro" }).click();
  await page.getByLabel("Nombre del centro").fill(c.nombre);
  await page.getByLabel("Tipo de centro").click();
  await page.getByRole("option", { name: c.tipo }).click();
  await page.getByLabel("Nombre del administrador").fill(`QA Admin ${c.slug}`);
  await page.getByLabel("Correo del administrador").fill(c.correo);
  await page.getByRole("button", { name: "Crear centro" }).click();
  await expect(page.getByRole("heading", { name: "Centro creado" })).toBeVisible();
  await page.getByRole("button", { name: "Listo" }).click();
}

for (const c of CASOS) {
  test(`${c.tipo}: se crea, se lista con su tipo y el menú y el guard lo respetan`, async ({ page, browser }) => {
    test.setTimeout(120_000);
    await crear(page, c);
    await page.reload();
    await expect(page.getByRole("row").filter({ hasText: c.nombre })).toContainText(c.tipo);

    // Suplantación en un contexto aparte para no perder la sesión del superadmin; sigue las reglas del centro.
    const ctx = await browser.newContext({ storageState: authFile("superadmin") });
    try {
      const p = await ctx.newPage();
      await p.goto("/plataforma");
      await p.getByRole("button", { name: `Entrar a ${c.nombre}` }).click();
      await p.waitForURL((u) => !u.pathname.startsWith("/plataforma"));
      await p.goto("/perfil");
      const menu = p.locator('[data-sidebar="sidebar"]').first();
      for (const t of c.con) await expect(menu.getByRole("link", { name: t, exact: true })).toBeVisible();
      for (const t of c.sin) await expect(menu.getByRole("link", { name: t, exact: true })).toHaveCount(0);
      expect((await p.goto(c.bloqueada))?.status()).toBe(404);
    } finally {
      await ctx.close();
    }
  });
}

test("el admin de un centro no puede cambiar el tipo: /ajustes lo muestra solo lectura", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: authFile("admin") });
  try {
    const p = await ctx.newPage();
    await p.goto("/ajustes");
    await expect(p.getByRole("heading", { name: "Tipo de centro" })).toBeVisible();
    await expect(p.getByText("Centro radiológico").first()).toBeVisible();
    await expect(p.getByRole("combobox", { name: /tipo/i })).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});

test.afterAll(() => {
  // Limpieza best-effort de los centros QA (el stack local es el de Docker compose).
  const sql = `DELETE FROM "Evento" WHERE "organizationId" IN (SELECT id FROM "Organization" WHERE slug LIKE 'qa-tipos-%-${SUFIJO}');
DELETE FROM "ConfigCentro" WHERE "organizationId" IN (SELECT id FROM "Organization" WHERE slug LIKE 'qa-tipos-%-${SUFIJO}');
DELETE FROM "Member" WHERE "organizationId" IN (SELECT id FROM "Organization" WHERE slug LIKE 'qa-tipos-%-${SUFIJO}');
DELETE FROM "Organization" WHERE slug LIKE 'qa-tipos-%-${SUFIJO}';`;
  try {
    execFileSync("docker", ["exec", "-i", "dent-view-postgres-1", "psql", "-U", "dentview", "-d", "dentview"], { input: sql, stdio: ["pipe", "ignore", "ignore"] });
  } catch { /* sin docker: los centros "QA tipos ..." quedan para borrarlos a mano */ }
});
