import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { authFile } from "./helpers";

// Crea sus propios datos (paciente, orden, informe): no depende del estado de otros specs.
test.use({ storageState: authFile("admin") });
test.describe.configure({ mode: "serial" });

const doc = String(Date.now()).slice(-10);
const nombre = `QA Imagenes ${doc}`;
let pacienteId = "";
let informeId = "";

test("subir una imagen JPG sintética, verla en el modal y descargarla", async ({ page }) => {
  test.setTimeout(120_000);
  const shots = process.env.SHOTS_DIR;
  await page.goto("/pacientes");
  await page.getByRole("button", { name: "Nuevo paciente" }).click();
  const dlg = page.getByRole("dialog", { name: "Nuevo paciente" });
  await dlg.getByLabel("Número de documento").fill(doc);
  await dlg.getByLabel("Nombre completo").fill(nombre);
  await dlg.getByLabel("Celular").fill("3001112233");
  await dlg.getByRole("button", { name: "Guardar" }).click();
  await expect(page).toHaveURL(/\/pacientes\/[^/]+$/);
  pacienteId = page.url().split("/").pop()!;

  await page.getByRole("tab", { name: /^Estudios/ }).click();
  const jpg = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#2a6f97" } }).jpeg().toBuffer();
  // Un archivo con extensión .jpg pero contenido falso se rechaza por su firma real.
  await page.getByTestId("subir-imagenes").setInputFiles({ name: "falso.jpg", mimeType: "image/jpeg", buffer: Buffer.from("esto no es una imagen") });
  await expect(page.getByText(/falso\.jpg: Solo se aceptan/)).toBeVisible();
  await page.getByTestId("subir-imagenes").setInputFiles({ name: "panoramica-sintetica.jpg", mimeType: "image/jpeg", buffer: jpg });
  await expect(page.getByText("Imagen subida")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Imágenes (1)" })).toBeVisible();

  await page.getByRole("button", { name: /panoramica-sintetica\.jpg/ }).click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByRole("img", { name: "panoramica-sintetica.jpg" })).toBeVisible();
  await modal.getByRole("button", { name: "Acercar" }).click();
  await expect(modal.getByText("125%")).toBeVisible();
  await modal.getByRole("button", { name: "Rotar" }).click();
  await modal.getByLabel("Título de la imagen").fill("Panorámica QA");
  await modal.getByLabel("Título de la imagen").press("Enter");
  await expect(page.getByText("Título guardado")).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/imagenes-modal.png` });

  const [descarga] = await Promise.all([page.waitForEvent("download"), modal.getByRole("link", { name: "Copia web" }).click()]);
  expect(descarga.suggestedFilename()).toBe("Panoramica-QA.jpg");
  // Sin sesión no hay acceso: la ruta es autenticada.
  const href = await modal.getByRole("link", { name: "Original" }).getAttribute("href");
  const anonimo = await page.context().browser()!.newContext({ storageState: { cookies: [], origins: [] } });
  expect((await anonimo.request.get(new URL(href!, page.url()).toString())).status()).toBe(401);
  await anonimo.close();
  const r = await page.request.get(href!);
  expect(r.status()).toBe(200);
  expect((await r.body()).subarray(0, 3).toString("hex")).toBe("ffd8ff");
});

test("incluir la imagen en un informe y bajar el PDF con el nombre del centro", async ({ page }) => {
  test.setTimeout(120_000);
  const shots = process.env.SHOTS_DIR;
  await page.goto("/ordenes/nueva");
  await page.getByRole("combobox", { name: "Paciente" }).click();
  await page.getByPlaceholder("Nombre o documento").fill(doc);
  await page.getByRole("option").filter({ hasText: doc }).click();
  await page.getByRole("checkbox", { name: "Panorámica", exact: true }).check();
  await page.getByRole("button", { name: "Crear orden" }).click();
  await expect(page).toHaveURL(/\/ordenes\/(?!nueva)[^/]+$/);
  await page.getByRole("button", { name: "Marcar como agendada" }).click();
  await expect(page.getByText("Agendada", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Marcar como tomada" }).click();
  await expect(page.getByText("Orden tomada")).toBeVisible();
  await page.getByRole("button", { name: "Redactar informe" }).click();
  await expect(page).toHaveURL(/\/informes\/[^/]+$/);
  informeId = page.url().split("/").pop()!;

  const selector = page.getByTestId("selector-capturas");
  await selector.getByRole("button", { name: "Agregar" }).first().click();
  await selector.getByLabel("Leyenda de la captura 1").fill("Panorámica de control");
  await page.getByRole("textbox", { name: "Hallazgos" }).fill("Hallazgos de prueba E2E de imágenes.");
  await page.getByRole("textbox", { name: "Impresión diagnóstica" }).fill("Sin alteraciones (QA).");
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(page.getByText("Borrador guardado")).toBeVisible();
  await page.reload(); // la selección persiste
  await expect(page.getByLabel("Leyenda de la captura 1")).toHaveValue("Panorámica de control");
  if (shots) await page.screenshot({ path: `${shots}/imagenes-selector.png`, fullPage: true });

  await page.getByRole("button", { name: "Firmar y emitir" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Firmar y emitir" }).click();
  await expect(page.getByText("Emitido", { exact: true })).toBeVisible();

  const r = await page.request.get(`/api/informes/${informeId}/pdf`);
  expect(r.status()).toBe(200);
  expect(r.headers()["content-type"]).toContain("application/pdf");
  const pdf = await r.body();
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.includes(Buffer.from("/Subtype /Image"))).toBe(true); // la captura va incrustada
  // El nombre del centro (membrete) queda como autor del PDF: texto plano si es ASCII, UTF-16BE si lleva acentos.
  expect(pdf.includes(Buffer.from("Radex")) || pdf.includes(Buffer.from("Radex", "utf16le").swap16())).toBe(true);
});
