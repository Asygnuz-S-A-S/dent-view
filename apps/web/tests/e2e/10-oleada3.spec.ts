import { expect, test, type Page } from "@playwright/test";
import { authFile, guardarEstado, leerEstado } from "./helpers";

test.use({ storageState: authFile("admin") });
test.describe.configure({ mode: "serial" });

const SUFIJO = String(Date.now()).slice(-6);
const CONVENIO = `QA Convenio ${SUFIJO}`;

async function elegirPaciente(page: Page, doc: string) {
  await page.getByRole("combobox", { name: "Paciente" }).click();
  await page.getByPlaceholder("Nombre o documento").fill(doc);
  await page.getByRole("option").filter({ hasText: doc }).click();
}

test("convenios: crear convenio con 20 % de descuento", async ({ page }) => {
  await page.goto("/convenios");
  await page.getByRole("button", { name: "Nuevo convenio" }).click();
  const dlg = page.getByRole("dialog", { name: "Nuevo convenio" });
  await dlg.getByLabel("Nombre").fill(CONVENIO);
  await dlg.getByLabel(/^NIT/).fill(`9${SUFIJO}-1`);
  await dlg.getByLabel("Descuento general (%)").fill("20");
  await dlg.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Convenio guardado")).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(CONVENIO) })).toContainText("20 %");
});

test("orden nueva aplica el precio del convenio y muestra su origen", async ({ page }) => {
  await page.goto("/ordenes/nueva");
  await elegirPaciente(page, leerEstado().doc!);
  await page.getByRole("combobox").filter({ hasText: "Sin convenio" }).click();
  await page.getByRole("option", { name: CONVENIO }).click();
  await page.getByRole("checkbox", { name: "Panorámica", exact: true }).check();
  // Catálogo $ 40.000 -> 20 % de descuento = $ 32.000.
  await expect(page.getByRole("complementary")).toContainText("$ 32.000");
  await expect(page.getByText(new RegExp(`Convenio ${CONVENIO} .20 %`)).first()).toBeVisible();
  await page.getByRole("button", { name: "Crear orden" }).click();
  await expect(page).toHaveURL(/\/ordenes\/(?!nueva)[^/]+$/);
  await expect(page.getByRole("row", { name: /Total/ })).toContainText("$ 32.000");
  guardarEstado({ ordenConvenioId: page.url().split("/").pop() });
});

test("agenda?orden=<id> abre «Nueva cita» prellenada y «Llegó» marca la llegada", async ({ page }) => {
  const { ordenConvenioId, nombre } = leerEstado();
  // El botón «Llegó» solo existe para citas de hoy, así que la cita se crea hoy. Las corridas repetidas el mismo día
  // van llenando la tarde: la búsqueda de franja libre puede tardar (hasta 24 intentos de ~4 s), por eso el tiempo extendido.
  test.setTimeout(180_000);
  await page.goto(`/agenda?orden=${ordenConvenioId}`);
  const dlg = page.getByRole("dialog", { name: "Nueva cita" });
  await expect(dlg).toBeVisible();
  await expect(dlg.getByRole("combobox", { name: "Paciente" })).toContainText(nombre!.toLowerCase());
  await expect(dlg.getByRole("combobox").filter({ hasText: /#\d+/ })).toBeVisible();
  // Hoy puede haber citas de corridas anteriores: se prueban franjas de la tarde hasta que una esté libre.
  const franjas = Array.from({ length: 24 }, (_, i) => `${13 + Math.floor(i / 4)}:${["00", "15", "30", "45"][i % 4]}`.padStart(5, "0"));
  const inicio = Date.now() % franjas.length;
  let hora = "";
  for (let i = 0; i < franjas.length && !hora; i++) {
    const h = franjas[(inicio + i) % franjas.length];
    await dlg.getByRole("combobox").filter({ hasText: /^\d\d:\d\d$/ }).click();
    await page.getByRole("option", { name: h, exact: true }).click();
    await dlg.getByRole("button", { name: "Guardar" }).click();
    if (await page.getByText("Cita creada").waitFor({ timeout: 4000 }).then(() => true, () => false)) hora = h;
  }
  expect(hora, "ninguna franja libre").not.toBe("");
  const nombreCita = nombre!.toLowerCase();
  await expect(page.getByRole("button", { name: new RegExp(`${nombreCita}, ${hora}, Programada`) })).toBeVisible();
  await page.getByRole("button", { name: `Marcar llegada de ${nombreCita}` }).click();
  await expect(page.getByRole("button", { name: new RegExp(`${nombreCita}, ${hora}, Llegó`) })).toBeVisible();
});

test("vínculo manual orden↔estudio y desvincular", async ({ page }) => {
  // Paciente demo con estudio CBCT sembrado (no hay carga de DICOM por UI): orden nueva y vínculo desde Estudios.
  await page.goto("/ordenes/nueva");
  await elegirPaciente(page, "DEMO-0001");
  await page.getByRole("checkbox", { name: "Panorámica", exact: true }).check();
  await page.getByRole("button", { name: "Crear orden" }).click();
  await expect(page).toHaveURL(/\/ordenes\/(?!nueva)[^/]+$/);
  const ordenUrl = page.url();
  const titulo = await page.getByRole("heading", { level: 1, name: /Orden #/ }).innerText();
  const numero = titulo.match(/#\d+/)![0];

  await page.goto("/estudios");
  const fila = page.getByRole("row", { name: /paciente cbct demo/i });
  await fila.getByRole("button", { name: "Más acciones" }).click();
  await page.getByRole("menuitem", { name: /^(Vincular|Cambiar) orden$/ }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("combobox").click();
  await page.getByRole("option", { name: new RegExp(`${numero}\\b`) }).click();
  await dlg.getByRole("button", { name: "Vincular", exact: true }).click();
  await expect(page.getByText("Estudio vinculado")).toBeVisible();

  await page.goto(ordenUrl);
  await expect(page.getByText("Aún no hay estudios vinculados")).toHaveCount(0);
  await page.getByRole("button", { name: "Desvincular" }).click();
  await expect(page.getByText("Aún no hay estudios vinculados")).toBeVisible();
});

test("búsqueda global Ctrl/⌘+K encuentra pacientes y navega a la ficha", async ({ page }) => {
  const { doc, nombre, pacienteId } = leerEstado();
  await page.goto("/inicio");
  await expect(page.getByRole("button", { name: "Buscar pacientes y órdenes" })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  const dlg = page.getByRole("dialog", { name: "Búsqueda global" });
  await expect(dlg).toBeVisible();
  await dlg.getByPlaceholder("Paciente, documento o n.º de orden").fill(doc!);
  // El paciente aparece primero; sus órdenes también coinciden por nombre (grupo "Órdenes").
  await dlg.getByRole("option", { name: new RegExp(nombre!, "i") }).first().click();
  await expect(page).toHaveURL(new RegExp(`/pacientes/${pacienteId}$`));
});

test("búsqueda global por n.º de orden y botón del encabezado", async ({ page }) => {
  await page.goto("/inicio");
  await page.getByRole("button", { name: "Buscar pacientes y órdenes" }).click();
  const dlg = page.getByRole("dialog", { name: "Búsqueda global" });
  await dlg.getByPlaceholder("Paciente, documento o n.º de orden").fill(leerEstado().ordenNumero!.replace("#", ""));
  await expect(dlg.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dlg).toBeHidden();
});

test("búsqueda global no devuelve pacientes de otro centro", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: authFile("admin2") });
  const page = await ctx.newPage();
  await page.goto("/inicio");
  await page.getByRole("button", { name: "Buscar pacientes y órdenes" }).click();
  const dlg = page.getByRole("dialog", { name: "Búsqueda global" });
  await dlg.getByPlaceholder("Paciente, documento o n.º de orden").fill(leerEstado().doc!);
  await expect(dlg.getByText("Sin resultados.")).toBeVisible();
  await expect(dlg.getByRole("option")).toHaveCount(0);
  await ctx.close();
});

test("/perfil muestra los datos de la cuenta y el cambio de contraseña", async ({ page }) => {
  await page.goto("/perfil");
  await expect(page.getByRole("heading", { level: 1, name: "Mi perfil" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Nombre" })).toHaveValue("Admin Radex");
  await expect(page.getByRole("textbox", { name: "Correo" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Cambiar contraseña" })).toBeVisible();
});

test("/convenios no es accesible para el doctor remitente", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: authFile("doctor") });
  const page = await ctx.newPage();
  const r = await page.goto("/convenios");
  expect(r?.status()).not.toBe(200);
  await ctx.close();
});

test("convenio ajeno: admin2 no ve los convenios de Radex", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: authFile("admin2") });
  const page = await ctx.newPage();
  await page.goto("/convenios");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(CONVENIO)).toHaveCount(0);
  await ctx.close();
});
