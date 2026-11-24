import { expect, test, type Page } from "@playwright/test";
import { authFile, guardarEstado, leerEstado } from "./helpers";

test.use({ storageState: authFile("admin") });
test.describe.configure({ mode: "serial" });

// Fecha futura distinta por ejecución para no chocar con citas de corridas anteriores.
function fechaPrueba() {
  const d = new Date(Date.now() + (40 + (Date.now() % 300)) * 86_400_000);
  return d.toISOString().slice(0, 10);
}

async function elegirPaciente(page: Page, doc: string) {
  const dlg = page.getByRole("dialog", { name: "Nueva cita" });
  await dlg.getByRole("combobox", { name: "Paciente" }).click();
  await page.getByPlaceholder("Nombre o documento").fill(doc);
  await page.getByRole("option").filter({ hasText: doc }).click();
  return dlg;
}

test("crear cita en una franja y verla en la agenda", async ({ page }) => {
  const fecha = fechaPrueba();
  guardarEstado({ citaHora: fecha });
  await page.goto(`/agenda?fecha=${fecha}`);
  await page.getByRole("button", { name: "Agendar en CS 9600 · Tomografía a las 09:00" }).click();
  const dlg = await elegirPaciente(page, leerEstado().doc!);
  await dlg.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Cita creada")).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(`${leerEstado().nombre!.toLowerCase()}[, ]+09:00`) })).toBeVisible();
});

test("cita cruzada en la misma sala y franja es rechazada", async ({ page }) => {
  const fecha = leerEstado().citaHora!;
  await page.goto(`/agenda?fecha=${fecha}`);
  // La franja 09:15 está tapada por la cita; se abre 09:30 (libre) y se mueve el inicio a 09:15 desde el diálogo.
  await page.getByRole("button", { name: "Agendar en CS 9600 · Tomografía a las 09:30" }).click();
  // Otro paciente (Ana Torres, seed) para aislar el conflicto de sala.
  const dlg = await elegirPaciente(page, "900003");
  await dlg.getByRole("combobox").filter({ hasText: "09:30" }).click();
  await page.getByRole("option", { name: "09:15" }).click();
  await dlg.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Cita creada")).toHaveCount(0);
  await expect(page.getByText("Ya hay una cita en esa sala a esa hora")).toBeVisible();
  await expect(dlg).toBeVisible();
  await dlg.getByRole("button", { name: "Cancelar" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: /ana torres, 09:15/ })).toHaveCount(0);
});
