import { expect, test } from "@playwright/test";
import { authFile, guardarEstado, leerEstado } from "./helpers";

test.use({ storageState: authFile("admin") });
test.describe.configure({ mode: "serial" });

test("crear cuenta de cobro desde la orden con el precio congelado", async ({ page }) => {
  await page.goto("/facturacion/nueva");
  await page.getByRole("combobox", { name: "Orden del centro" }).click();
  await page.getByRole("option", { name: new RegExp(`${leerEstado().ordenNumero}\\b`) }).click();
  await expect(page.getByText("$ 190.000").first()).toBeVisible();
  await page.getByRole("button", { name: "Crear cuenta de cobro" }).click();
  await expect(page.getByText("Cuenta de cobro creada")).toBeVisible();
  await expect(page).toHaveURL(/\/facturacion\/(?!nueva)[^/]+$/);
  guardarEstado({ facturaId: page.url().split("/").pop() });
  await expect(page.getByRole("row", { name: /^Saldo/ })).toContainText("$ 190.000");
});

test("abono mayor al saldo es rechazado y el parcial se registra", async ({ page }) => {
  await page.goto(`/facturacion/${leerEstado().facturaId}`);
  await page.getByRole("button", { name: "Registrar abono" }).click();
  const dlg = page.getByRole("dialog", { name: "Registrar abono" });
  await dlg.getByLabel(/^Valor/).fill("999999");
  await expect(dlg.getByRole("button", { name: "Registrar" })).toBeDisabled();
  await dlg.getByLabel(/^Valor/).fill("60000");
  await dlg.getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByText("Abono registrado")).toBeVisible();
  await expect(page.getByRole("row", { name: /^Abonado/ })).toContainText("$ 60.000");
  await expect(page.getByRole("row", { name: /^Saldo/ })).toContainText("$ 130.000");
  await expect(page.getByText("Aún no hay abonos")).toHaveCount(0);
});

test("la cartera refleja el saldo pendiente del responsable", async ({ page }) => {
  await page.goto("/cartera");
  const fila = page.getByRole("row", { name: new RegExp(leerEstado().nombre!.toLowerCase()) });
  await expect(fila).toContainText("$ 130.000");
});

test("el listado de facturación incluye la cuenta creada", async ({ page }) => {
  await page.goto("/facturacion");
  await expect(page.getByRole("link", { name: /FC-\d+/ }).first()).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(leerEstado().nombre!, "i") })).toBeVisible();
});

async function crearCuentaLibre(page: import("@playwright/test").Page, valor: string) {
  await page.goto("/facturacion/nueva");
  await page.getByRole("combobox", { name: "Paciente" }).click();
  await page.getByRole("option", { name: new RegExp(leerEstado().nombre!, "i") }).click();
  await page.getByLabel("Descripción del ítem 1").fill("Consulta QA finanzas");
  await page.getByLabel("Valor del ítem 1").fill(valor);
  await page.getByRole("button", { name: "Crear cuenta de cobro" }).click();
  await expect(page).toHaveURL(/\/facturacion\/(?!nueva)[^/]+$/);
}

test("anular un pago exige motivo, queda tachado con su motivo y la cuenta recupera el saldo", async ({ page }) => {
  await page.goto(`/facturacion/${leerEstado().facturaId}`);
  await page.getByRole("row", { name: /\$ 60\.000/ }).getByRole("button", { name: "Anular" }).click();
  const dlg = page.getByRole("dialog", { name: "¿Anular el pago?" });
  await expect(dlg.getByRole("button", { name: "Anular pago" })).toBeDisabled();
  await dlg.getByLabel(/^Motivo/).fill("ab");
  await expect(dlg.getByRole("button", { name: "Anular pago" })).toBeDisabled();
  await dlg.getByLabel(/^Motivo/).fill("Cobro registrado dos veces");
  await dlg.getByRole("button", { name: "Anular pago" }).click();
  await expect(page.getByText("Pago anulado")).toBeVisible();
  await expect(page.getByRole("row", { name: /^Abonado/ })).toContainText("$ 0");
  await expect(page.getByRole("row", { name: /^Saldo/ })).toContainText("$ 190.000");
  await expect(page.getByText(/Anulado el .*Cobro registrado dos veces/)).toBeVisible();
  // Se deja la cuenta como la esperan las demás pruebas: abono vigente de 60.000.
  await page.getByRole("button", { name: "Registrar abono" }).click();
  const abono = page.getByRole("dialog", { name: "Registrar abono" });
  await abono.getByLabel(/^Valor/).fill("60000");
  await abono.getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByRole("row", { name: /^Saldo/ })).toContainText("$ 130.000");
});

test("anular una cuenta exige motivo y lo muestra anulada", async ({ page }) => {
  await crearCuentaLibre(page, "15000");
  await page.getByRole("button", { name: "Anular", exact: true }).click();
  const dlg = page.getByRole("dialog", { name: "¿Anular la cuenta de cobro?" });
  await expect(dlg.getByRole("button", { name: "Anular", exact: true })).toBeDisabled();
  await dlg.getByLabel(/^Motivo/).fill("Cuenta creada por error");
  await dlg.getByRole("button", { name: "Anular", exact: true }).click();
  await expect(page.getByText("Cuenta de cobro anulada")).toBeVisible();
  await expect(page.getByText("Anulada", { exact: true }).first()).toBeVisible();
});

test("nota crédito sobre una cuenta pagada reduce el total y deja saldo a favor", async ({ page }) => {
  await crearCuentaLibre(page, "20000");
  await page.getByRole("button", { name: "Registrar abono" }).click();
  const abono = page.getByRole("dialog", { name: "Registrar abono" });
  await abono.getByLabel(/^Valor/).fill("20000");
  await abono.getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByText("Pagada", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Nota crédito" }).click();
  const dlg = page.getByRole("dialog", { name: "Nota crédito" });
  await dlg.getByLabel(/^Valor/).fill("25000");
  await dlg.getByLabel(/^Motivo/).fill("Descuento pactado");
  await expect(dlg.getByRole("button", { name: "Crear nota crédito" })).toBeDisabled(); // supera lo pagado
  await dlg.getByLabel(/^Valor/).fill("5000");
  await dlg.getByRole("button", { name: "Crear nota crédito" }).click();
  await expect(page.getByText("Nota crédito creada")).toBeVisible();
  await expect(page.getByRole("row", { name: /^Saldo/ })).toContainText("$ 5.000 a favor");
  await expect(page.getByText(/NC-0001|NC-\d{4} · .* · Descuento pactado/).first()).toBeVisible();
});
