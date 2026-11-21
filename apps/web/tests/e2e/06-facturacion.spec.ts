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
