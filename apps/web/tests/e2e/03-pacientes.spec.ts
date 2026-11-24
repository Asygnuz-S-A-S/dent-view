import { expect, test } from "@playwright/test";
import { authFile, guardarEstado, leerEstado } from "./helpers";

test.use({ storageState: authFile("admin") });
test.describe.configure({ mode: "serial" });

test("crear paciente nuevo, buscarlo y abrir su ficha", async ({ page }) => {
  const doc = String(Date.now()).slice(-10);
  const nombre = `QA Paciente ${doc}`;
  await page.goto("/pacientes");
  await page.getByRole("button", { name: "Nuevo paciente" }).click();
  const dlg = page.getByRole("dialog", { name: "Nuevo paciente" });
  await dlg.getByLabel("Número de documento").fill(doc);
  await dlg.getByLabel("Nombre completo").fill(nombre);
  await dlg.getByLabel("Celular").fill("3001112233");
  await dlg.getByRole("button", { name: "Guardar" }).click();
  await expect(page).toHaveURL(/\/pacientes\/[^/]+$/);
  const pacienteId = page.url().split("/").pop()!;
  guardarEstado({ doc, nombre, pacienteId });
  await expect(page.getByRole("heading", { level: 1, name: nombre })).toBeVisible();

  await page.goto("/pacientes");
  await page.getByRole("textbox", { name: "Buscar paciente" }).fill(doc);
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page).toHaveURL(new RegExp(`q=${doc}`));
  await expect(page.getByRole("row", { name: new RegExp(nombre) })).toBeVisible();
  await page.getByRole("link", { name: `Ver ficha de ${nombre}` }).click();
  await expect(page).toHaveURL(new RegExp(pacienteId));
});

/** Odontograma, plan y notas clínicas viven en el módulo clínico (secundario). */
async function abrirClinico(page: import("@playwright/test").Page, sub: string | RegExp) {
  await page.getByRole("tab", { name: /Módulo clínico/ }).click();
  await page.getByRole("tab", { name: sub }).click();
}

test.describe("ficha del paciente", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/pacientes/${leerEstado().pacienteId}`);
  });

  test("pestaña Resumen muestra el documento", async ({ page }) => {
    await expect(page.getByRole("tab", { name: "Resumen" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel", { name: "Resumen" }).getByText(`CC ${leerEstado().doc}`)).toBeVisible();
  });

  test("odontograma: marcar un diente", async ({ page }) => {
    await abrirClinico(page, "Odontograma");
    await page.getByRole("radio", { name: "Caries" }).click();
    const resp = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/pacientes/"));
    await page.getByRole("option", { name: "Tooth 16" }).click();
    expect((await resp).status()).toBe(200);
    // El estado persiste tras recargar.
    await page.reload();
    await abrirClinico(page, "Odontograma");
    await expect(page.getByRole("option", { name: "Tooth 16" })).toHaveCSS("color", "rgb(220, 38, 38)"); // color de la condición "caries"
  });

  test("notas clínicas: agregar nota", async ({ page }) => {
    await abrirClinico(page, /Notas clínicas/);
    const texto = `Nota QA ${Date.now()}`;
    await page.getByRole("textbox", { name: "Nueva nota clínica" }).fill(texto);
    await page.getByRole("button", { name: "Agregar nota" }).click();
    await expect(page.getByText(texto)).toBeVisible();
    await expect(page.getByRole("tab", { name: "Notas clínicas (1)" })).toBeVisible();
  });

  test("notas clínicas: no se editan; corregir crea una nota nueva que cita la anterior", async ({ page }) => {
    await abrirClinico(page, /Notas clínicas/);
    await expect(page.getByRole("tabpanel", { name: /Notas clínicas/ }).getByRole("button", { name: "Editar" })).toHaveCount(0);
    const corr = `Corrección QA ${Date.now()}`;
    await page.getByRole("button", { name: "Corregir" }).first().click();
    await page.getByRole("textbox", { name: "Texto de la corrección" }).fill(corr);
    await page.getByRole("button", { name: "Guardar corrección" }).click();
    await expect(page.getByText(new RegExp(`^\\[Corrige la nota del .+\\] ${corr}$`))).toBeVisible();
    await expect(page.getByRole("tab", { name: "Notas clínicas (2)" })).toBeVisible();
  });

  test("plan de tratamiento: agregar ítem", async ({ page }) => {
    await abrirClinico(page, /Plan de tratamiento/);
    await page.getByRole("spinbutton", { name: "Diente (FDI)" }).fill("16");
    const valor = page.getByRole("textbox", { name: "Valor (COP)" });
    await valor.fill("150000");
    await expect(valor).toHaveValue("150.000"); // InputMoneda: separador de miles
    await page.getByRole("textbox", { name: "Descripción" }).fill("Resina oclusal QA");
    await page.getByRole("button", { name: "Agregar" }).click();
    await expect(page.getByText("Resina oclusal QA")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Plan de tratamiento (1)" })).toBeVisible();
  });

  test("historia clínica: guardar antecedentes", async ({ page }) => {
    await page.getByRole("tab", { name: "Historia clínica" }).click();
    await page.getByRole("checkbox", { name: "Claustrofobia" }).click();
    await page.getByRole("button", { name: "Guardar antecedentes" }).click();
    await expect(page.getByText(/guardad/i).first()).toBeVisible();
    await page.reload();
    await page.getByRole("tab", { name: "Historia clínica" }).click();
    await expect(page.getByRole("checkbox", { name: "Claustrofobia" })).toBeChecked();
  });
});
