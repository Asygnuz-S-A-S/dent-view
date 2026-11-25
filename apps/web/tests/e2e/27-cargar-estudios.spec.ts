import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { zipSync } from "fflate";
import sharp from "sharp";
import { dicomSintetico } from "./dicom-sintetico";
import { authFile } from "./helpers";
import { sesionQa, sql } from "./qa-usuarios";

// Datos propios (paciente, órdenes, objetos de Orthanc) creados y borrados aquí; los usuarios demo ya existen.
test.describe.configure({ mode: "serial" });

const S = String(Date.now()).slice(-8);
const DOC = `27${S}`;
const STUDY_UID = `1.2.826.0.1.3680043.8.498.27.${S}`;
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
let org = "", orgAjeno = "", pacienteId = "", pacienteAjeno = "", ordenId = "", ordenDoctor = "", ordenOtro = "", personaAjena = "", persona = "";
let recepcion = "";

const orthanc = (py: string) => execFileSync("docker", ["exec", "dent-view-orthanc-1", "python3", "-c", `import json,urllib.request as u\nB='http://localhost:8042'\n${py}`], { encoding: "utf8" }).trim();

test.beforeAll(async ({ browser, baseURL }) => {
  recepcion = await sesionQa(browser, "recepcion", baseURL!);
  org = sql(`SELECT id FROM "Organization" WHERE slug='radex-demo';`);
  orgAjeno = sql(`SELECT id FROM "Organization" WHERE slug='radex-2-demo';`);
  const doctor = sql(`SELECT id FROM "User" WHERE email='doctor@pepito.demo';`);
  const admin = sql(`SELECT id FROM "User" WHERE email='admin@radex.demo';`);
  persona = `qa27p${S}`; personaAjena = `qa27a${S}`; pacienteId = `qa27pt${S}`; pacienteAjeno = `qa27pa${S}`;
  ordenId = `qa27o1${S}`; ordenDoctor = `qa27o2${S}`; ordenOtro = `qa27o3${S}`;
  const orden = (id: string, estado: string, doc: string) => `INSERT INTO "Orden"(id,"organizationId",numero,"pacienteId","doctorRemitenteId",estado,"actualizadoEn")
    SELECT '${id}','${org}',COALESCE(MAX(numero),0)+1,'${pacienteId}',${doc},'${estado}',now() FROM "Orden" WHERE "organizationId"='${org}';`;
  sql(`INSERT INTO "Persona"(id,"tipoDocumento","numeroDocumento",nombre) VALUES ('${persona}','CC','${DOC}','QA Cargar ${S}'),('${personaAjena}','CC','${DOC}9','QA Ajeno ${S}');
       INSERT INTO "PacienteTenant"(id,"organizationId","personaId",nombre) VALUES ('${pacienteId}','${org}','${persona}','QA Cargar ${S}'),('${pacienteAjeno}','${orgAjeno}','${personaAjena}','QA Ajeno ${S}');
       ${orden(ordenId, "AGENDADA", "NULL")}
       ${orden(ordenDoctor, "SOLICITADA", `'${doctor}'`)}
       ${orden(ordenOtro, "SOLICITADA", `'${admin}'`)}`);
});

test.afterAll(async ({ browser }) => {
  // Los documentos se borran por la API (limpia también S3); lo demás, por SQL.
  const ctx = await browser.newContext({ storageState: authFile("admin") });
  for (const id of sql(`SELECT id FROM "ImagenEstudio" WHERE "pacienteId"='${pacienteId}';`).split("\n").filter(Boolean)) await ctx.request.delete(`/api/imagenes/${id}`);
  await ctx.close();
  for (const orthancId of sql(`SELECT "orthancId" FROM "Estudio" WHERE "studyInstanceUid" LIKE '${STUDY_UID}%';`).split("\n").filter(Boolean)) orthanc(`u.urlopen(u.Request(B+'/studies/${orthancId}',method='DELETE'))`);
  sql(`DELETE FROM "Evento" WHERE "pacienteId"='${pacienteId}';
       DELETE FROM "ImagenEstudio" WHERE "pacienteId"='${pacienteId}';
       DELETE FROM "Estudio" WHERE "studyInstanceUid" LIKE '${STUDY_UID}%';
       DELETE FROM "Orden" WHERE id IN ('${ordenId}','${ordenDoctor}','${ordenOtro}');
       DELETE FROM "PacienteTenant" WHERE id IN ('${pacienteId}','${pacienteAjeno}');
       DELETE FROM "Persona" WHERE id IN ('${persona}','${personaAjena}');`);
});

// La sesión de recepción (usuario QA) se crea en beforeAll: el contexto se arma a mano con ese estado.
const rtest = test.extend({
  context: async ({ browser, baseURL }, use) => {
    const c = await browser.newContext({ storageState: recepcion, baseURL: baseURL! });
    // eslint-disable-next-line react-hooks/rules-of-hooks -- `use` es el callback del fixture de Playwright
    await use(c);
    await c.close();
  },
});

test.describe("recepción", () => {
  rtest("sube foto, orden en PDF y DICOM desde Cargar estudios y los ve en la ficha y en la orden", async ({ page }) => {
    test.setTimeout(120_000);
    const jpg = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#2a6f97" } }).jpeg().toBuffer();
    await page.goto("/inicio");
    await expect(page.getByRole("link", { name: "Cargar estudios" })).toBeVisible();
    await page.goto("/cargar");
    await expect(page.getByRole("heading", { level: 1, name: "Cargar estudios" })).toBeVisible();
    // Buscador de paciente (con tildes/mayúsculas indiferentes) y orden opcional.
    await page.getByRole("textbox", { name: /Buscar paciente/ }).fill(DOC);
    await page.getByRole("button", { name: new RegExp(`QA Cargar ${S}`, "i") }).click();
    await page.getByLabel("Orden (opcional)").selectOption(ordenId);
    await expect(page.getByLabel("Orden (opcional)")).not.toHaveValue("");
    // Un archivo falso con extensión .jpg se rechaza por su firma real.
    await page.getByTestId("cargar-archivos").setInputFiles({ name: "falso.jpg", mimeType: "image/jpeg", buffer: Buffer.from("esto no es una imagen") });
    await expect(page.getByRole("alert").filter({ hasText: /Formato no reconocido/ })).toBeVisible();
    await page.getByRole("button", { name: "Quitar falso.jpg" }).click();
    // Archivo de 26 MB (firma JPEG válida): rechazado en el cliente.
    await page.getByTestId("cargar-archivos").setInputFiles({ name: "enorme.jpg", mimeType: "image/jpeg", buffer: Buffer.concat([jpg.subarray(0, 4), Buffer.alloc(26 * 1024 * 1024)]) });
    await expect(page.getByRole("alert").filter({ hasText: /supera el máximo de 25 MB/ })).toBeVisible();
    await page.getByRole("button", { name: "Quitar enorme.jpg" }).click();

    await page.getByTestId("cargar-archivos").setInputFiles([
      { name: "foto-intraoral.jpg", mimeType: "image/jpeg", buffer: jpg },
      { name: "orden-remision.pdf", mimeType: "application/pdf", buffer: PDF },
      { name: "estudio.dcm", mimeType: "application/dicom", buffer: dicomSintetico({ patientId: "OTRO-ID-999", studyUid: STUDY_UID }) },
    ]);
    await expect(page.getByLabel("Tipo de foto-intraoral.jpg")).toHaveValue("foto");
    await expect(page.getByLabel("Tipo de orden-remision.pdf")).toHaveValue("orden");
    await expect(page.getByLabel("Tipo de estudio.dcm")).toHaveValue("radiografia");
    await page.getByRole("button", { name: /Subir 3 archivos/ }).click();
    await expect(page.getByText("Subido", { exact: true })).toHaveCount(3, { timeout: 60_000 });
    if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/cargar-resultado.png`, fullPage: true });

    // El DICOM quedó con el documento del paciente elegido (no con OTRO-ID-999), el centro y la orden elegida.
    expect(sql(`SELECT "pacienteId"||'|'||"ordenId"||'|'||estado FROM "Estudio" WHERE "studyInstanceUid"='${STUDY_UID}';`)).toBe(`${pacienteId}|${ordenId}|ASIGNADO`);
    const oid = sql(`SELECT "orthancId" FROM "Estudio" WHERE "studyInstanceUid"='${STUDY_UID}';`);
    expect(orthanc(`d=json.load(u.urlopen(B+'/studies/${oid}'))\nprint(d['PatientMainDicomTags']['PatientID'],d.get('Labels'))`)).toBe(`${DOC} ['tenant-${org}']`);
    expect(sql(`SELECT count(*) FROM "Evento" WHERE "pacienteId"='${pacienteId}' AND tipo IN ('estudio.cargado','documento.cargado','imagen.subida');`)).toBe("3");
    expect(sql(`SELECT estado FROM "Orden" WHERE id='${ordenId}';`)).toBe("TOMADA");

    // Ficha del paciente: las cuatro secciones.
    await page.goto(`/pacientes/${pacienteId}`);
    await page.getByRole("tab", { name: /^Estudios/ }).click();
    await expect(page.getByRole("heading", { name: "Fotografías (1)" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Radiografías e imágenes (0)" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Estudios DICOM (1)" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Órdenes y documentos (1)" })).toBeVisible();
    await expect(page.getByText("orden-remision.pdf")).toBeVisible();
    await expect(page.getByRole("link", { name: "Cargar archivos" })).toBeVisible();
    // El PDF se sirve inline por la ruta autenticada.
    const docId = sql(`SELECT id FROM "ImagenEstudio" WHERE "pacienteId"='${pacienteId}' AND mime='application/pdf';`);
    const r = await page.request.get(`/api/imagenes/${docId}?v=original`);
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toBe("application/pdf");
    expect(r.headers()["content-disposition"]).toBe("inline");
    expect(r.headers()["x-content-type-options"]).toBe("nosniff");
    expect((await r.body()).subarray(0, 5).toString()).toBe("%PDF-");
    // Recepción no elimina documentos.
    await expect(page.getByRole("button", { name: /Eliminar orden-remision/ })).toHaveCount(0);
    expect((await page.request.delete(`/api/imagenes/${docId}`)).status()).toBe(403);

    // Detalle de la orden: documento adjunto y estudio vinculado.
    await page.goto(`/ordenes/${ordenId}`);
    await expect(page.getByText("Documentos adjuntos (2)")).toBeVisible();
    await expect(page.getByText("orden-remision.pdf")).toBeVisible();
    await expect(page.getByText("QA carga web")).toBeVisible();
    await page.getByRole("link", { name: "Cargar archivos" }).click();
    await expect(page).toHaveURL(new RegExp(`/cargar\\?pacienteId=${pacienteId}&ordenId=${ordenId}`));
    await expect(page.getByLabel("Orden (opcional)")).toHaveValue(ordenId);
  });

  rtest("paciente de otro centro: 404 en las dos rutas de carga y no aparece en el buscador", async ({ page }) => {
    const dcm = dicomSintetico({ patientId: DOC, studyUid: `${STUDY_UID}.9` });
    const r1 = await page.request.post(`/api/estudios/cargar?pacienteId=${pacienteAjeno}`, { headers: { "content-type": "application/dicom" }, data: dcm });
    expect(r1.status()).toBe(404);
    const r2 = await page.request.post("/api/imagenes", { multipart: { pacienteId: pacienteAjeno, categoria: "orden", archivos: { name: "o.pdf", mimeType: "application/pdf", buffer: PDF } } });
    expect(r2.status()).toBe(404);
    // Orden de este centro con paciente ajeno: tampoco.
    const r3 = await page.request.post(`/api/estudios/cargar?pacienteId=${pacienteAjeno}&ordenId=${ordenId}`, { headers: { "content-type": "application/dicom" }, data: dcm });
    expect(r3.status()).toBe(404);
    await page.goto("/cargar");
    await page.getByRole("textbox", { name: /Buscar paciente/ }).fill(`Ajeno ${S}`);
    await expect(page.getByText(/Sin resultados/)).toBeVisible();
  });

  rtest("la API rechaza por firma un .jpg falso, un DICOM falso, un ZIP con rutas peligrosas y 26 MB", async ({ page }) => {
    const falso = await page.request.post("/api/imagenes", { multipart: { pacienteId, categoria: "foto", archivos: { name: "falso.jpg", mimeType: "image/jpeg", buffer: Buffer.from("no soy imagen") } } });
    expect(falso.status()).toBe(400);
    expect(JSON.stringify(await falso.json())).toContain("Formato no reconocido");
    const grande = await page.request.post("/api/imagenes", { multipart: { pacienteId, categoria: "foto", archivos: { name: "g.jpg", mimeType: "image/jpeg", buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(26 * 1024 * 1024)]) } } });
    expect(grande.status()).toBe(400);
    expect(JSON.stringify(await grande.json())).toContain("25 MB");
    const dcmFalso = await page.request.post(`/api/estudios/cargar?pacienteId=${pacienteId}`, { headers: { "content-type": "application/dicom" }, data: Buffer.from("no es dicom".repeat(20)) });
    expect(dcmFalso.status()).toBe(415);
    // ZIP con una entrada "../x.dcm" (construido a mano: cabecera local sin compresión).
    const nombre = Buffer.from("../x.dcm");
    const cab = Buffer.alloc(30); cab.writeUInt32LE(0x04034b50, 0); cab.writeUInt16LE(20, 4); cab.writeUInt16LE(nombre.length, 26);
    const zip = await page.request.post(`/api/estudios/cargar?pacienteId=${pacienteId}`, { headers: { "content-type": "application/zip" }, data: Buffer.concat([cab, nombre, Buffer.alloc(200)]) });
    expect([415, 422]).toContain(zip.status());
    expect(sql(`SELECT count(*) FROM "Estudio" WHERE "pacienteId"='${pacienteId}';`)).toBe("1"); // solo el DICOM bueno del primer test
    // ZIP real: una entrada con ".." se rechaza entera; un ZIP bueno se descomprime en streaming y queda ligado al paciente.
    const dcm = dicomSintetico({ patientId: DOC, studyUid: `${STUDY_UID}.5` });
    const mala = await page.request.post(`/api/estudios/cargar?pacienteId=${pacienteId}`, { headers: { "content-type": "application/zip" }, data: Buffer.from(zipSync({ "../x.dcm": dcm })) });
    expect(mala.status()).toBe(422);
    expect((await mala.json()).error).toMatch(/rutas no permitidas/);
    const buena = await page.request.post(`/api/estudios/cargar?pacienteId=${pacienteId}`, { headers: { "content-type": "application/zip" }, data: Buffer.from(zipSync({ "estudio/1.dcm": dcm })) });
    expect(buena.status()).toBe(200);
    expect(sql(`SELECT count(*) FROM "Estudio" WHERE "pacienteId"='${pacienteId}' AND "studyInstanceUid"='${STUDY_UID}.5';`)).toBe("1");
  });

  rtest("responsive 390 px y modo oscuro: sin desbordes", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(`/cargar?pacienteId=${pacienteId}`);
    await expect(page.getByRole("button", { name: /Zona para soltar archivos/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/cargar-movil-oscuro.png`, fullPage: true });
  });
});

test.describe("administrador", () => {
  test.use({ storageState: authFile("admin") });
  test("elimina un documento con confirmación y queda en la bitácora", async ({ page }) => {
    await page.goto(`/pacientes/${pacienteId}`);
    await page.getByRole("tab", { name: /^Estudios/ }).click();
    await page.getByRole("button", { name: /Eliminar orden-remision/ }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Eliminar" }).click();
    await expect(page.getByText("Documento eliminado")).toBeVisible();
    expect(sql(`SELECT count(*) FROM "Evento" WHERE "pacienteId"='${pacienteId}' AND tipo='documento.eliminado';`)).toBe("1");
  });
});

test.describe("doctor remitente", () => {
  test.use({ storageState: authFile("doctor") });
  test("no ve Cargar estudios; adjunta la orden médica a SU orden y recibe 404 con la de otro doctor", async ({ page }) => {
    await page.goto("/inicio");
    await expect(page.getByRole("link", { name: "Cargar estudios" })).toHaveCount(0);
    expect((await page.goto("/cargar"))?.status()).toBe(404);
    // Ruta de DICOM: solo personal clínico.
    expect((await page.request.post(`/api/estudios/cargar?pacienteId=${pacienteId}`, { headers: { "content-type": "application/dicom" }, data: Buffer.alloc(200) })).status()).toBe(403);

    await page.goto(`/ordenes/${ordenDoctor}`);
    await page.getByTestId("adjuntar-orden").setInputFiles({ name: "remision-doctor.pdf", mimeType: "application/pdf", buffer: PDF });
    await expect(page.getByText("Orden médica adjuntada")).toBeVisible();
    await expect(page.getByText("remision-doctor.pdf")).toBeVisible();
    await expect(page.getByRole("button", { name: /Eliminar remision-doctor/ })).toHaveCount(0);

    const ajena = await page.request.post("/api/imagenes", { multipart: { pacienteId, ordenId: ordenOtro, categoria: "orden", archivos: { name: "x.pdf", mimeType: "application/pdf", buffer: PDF } } });
    expect(ajena.status()).toBe(404);
    const otraCategoria = await page.request.post("/api/imagenes", { multipart: { pacienteId, ordenId: ordenDoctor, categoria: "foto", archivos: { name: "x.pdf", mimeType: "application/pdf", buffer: PDF } } });
    expect(otraCategoria.status()).toBe(403);
    expect((await page.goto(`/ordenes/${ordenOtro}`))?.status()).toBe(404);
    expect(sql(`SELECT count(*) FROM "ImagenEstudio" WHERE "ordenId"='${ordenOtro}';`)).toBe("0");
  });
});
