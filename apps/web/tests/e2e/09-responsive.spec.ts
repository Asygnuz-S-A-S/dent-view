import { expect, test, type Page } from "@playwright/test";
import { authFile, leerEstado } from "./helpers";

test.use({ storageState: authFile("admin") });

const sinScrollHorizontal = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

const rutas: [string, () => string][] = [
  ["Inicio", () => "/inicio"],
  ["Pacientes", () => "/pacientes"],
  ["Órdenes", () => "/ordenes"],
  ["Convenios", () => "/convenios"],
  ["Perfil", () => "/perfil"],
  ["Agenda", () => "/agenda"],
  ["Estudios", () => "/estudios"],
  ["Nueva orden", () => "/ordenes/nueva"],
  ["Ficha del paciente", () => `/pacientes/${leerEstado().pacienteId}`],
];

for (const [nombre, ruta] of rutas) {
  test(`${nombre}: sin scroll horizontal en móvil`, async ({ page }) => {
    await page.goto(ruta());
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    expect(await sinScrollHorizontal(page)).toBe(true);
  });
}

test("el menú lateral se abre con el botón en móvil", async ({ page }) => {
  await page.goto("/inicio");
  await expect(page.getByRole("link", { name: "Pacientes" })).toBeHidden();
  await page.getByRole("button", { name: "Toggle Sidebar" }).first().click();
  await expect(page.getByRole("link", { name: "Pacientes" })).toBeVisible();
  await page.getByRole("link", { name: "Pacientes" }).click();
  await expect(page).toHaveURL(/\/pacientes$/);
});
