import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { dicomSintetico } from "./dicom-sintetico";
import { authFile, CBCT_UID } from "./helpers";
import { sql } from "./qa-usuarios";

// Remisión entre centros: admin2 (Radex 2) es el ORIGEN, admin (Radex) el DESTINO y doctor el doctor remitente del destino.
// Datos propios creados y borrados aquí; los usuarios y centros demo ya existen.
test.describe.configure({ mode: "serial" });

const MAILPIT = "http://127.0.0.1:8025/api/v1";
const S = String(Date.now()).slice(-8);
const DOC = (n: number) => `32${S}${n}`;
const STUDY_UID = `1.2.826.0.1.3680043.8.498.32.${S}`;
const MENSAJE_SOLICITUD = "Si el código es correcto, enviamos tu solicitud al otro centro";
const CELULAR = `3009${S}`;
const CORREO = `qa32.${S}@paciente.test`;
const NOTA = `nota-privada-${S}`;
const PDF_HEX = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n").toString("hex");

let origen = "", destino = "", nombreOrigen = "", nombreDestino = "";
let p1 = "", p2 = "", p3 = "", personaIds: string[] = [], preExistente = "";
let r1 = "", r2 = "", r3 = "";
let pacienteDestino = "", ordenDestino = "", informeId = "", estudioId = "";
const desde = Date.now() - 2000;

const orthanc = (py: string) => execFileSync("docker", ["exec", "dent-view-orthanc-1", "python3", "-c", `import json,urllib.request as u\nB='http://localhost:8042'\n${py}`], { encoding: "utf8" }).trim();

function limpiar() {
  const ordenes = sql(`SELECT "ordenDestinoId" FROM "Remision" WHERE "origenId"='${origen}' AND "destinoId"='${destino}' AND "ordenDestinoId" IS NOT NULL;`).split("\n").filter(Boolean).map((i) => `'${i}'`).join(",") || "'-'";
  for (const orthancId of sql(`SELECT "orthancId" FROM "Estudio" WHERE "studyInstanceUid" LIKE '${STUDY_UID}%';`).split("\n").filter(Boolean)) orthanc(`u.urlopen(u.Request(B+'/studies/${orthancId}',method='DELETE'))`);
  sql(`DELETE FROM "RemisionEvento" WHERE "remisionId" IN (SELECT id FROM "Remision" WHERE "origenId"='${origen}' AND "destinoId"='${destino}');
       DELETE FROM "Remision" WHERE "origenId"='${origen}' AND "destinoId"='${destino}';
       DELETE FROM "VinculoCentro" WHERE ("solicitanteId"='${origen}' AND "receptorId"='${destino}') OR ("solicitanteId"='${destino}' AND "receptorId"='${origen}');
       DELETE FROM "Mensaje" WHERE tipo IN ('VINCULO_SOLICITADO','REMISION_RECIBIDA','REMISION_RESPONDIDA') AND "organizationId" IN ('${origen}','${destino}');
       DELETE FROM "Informe" WHERE "ordenId" IN (${ordenes});
       DELETE FROM "Estudio" WHERE "studyInstanceUid" LIKE '${STUDY_UID}%';
       DELETE FROM "Orden" WHERE id IN (${ordenes});
       DELETE FROM "Evento" WHERE "pacienteId" IN (SELECT id FROM "PacienteTenant" WHERE "personaId" IN (SELECT id FROM "Persona" WHERE "numeroDocumento" LIKE '32${S}%'));
       DELETE FROM "Autorizacion" WHERE "pacienteId" IN (SELECT id FROM "PacienteTenant" WHERE "personaId" IN (SELECT id FROM "Persona" WHERE "numeroDocumento" LIKE '32${S}%'));
       DELETE FROM "PacienteTenant" WHERE "personaId" IN (SELECT id FROM "Persona" WHERE "numeroDocumento" LIKE '32${S}%');
       DELETE FROM "Persona" WHERE "numeroDocumento" LIKE '32${S}%';`);
}

test.beforeAll(() => {
  origen = sql(`SELECT id FROM "Organization" WHERE slug='radex-2-demo';`);
  destino = sql(`SELECT id FROM "Organization" WHERE slug='radex-demo';`);
  nombreOrigen = sql(`SELECT name FROM "Organization" WHERE id='${origen}';`);
  nombreDestino = sql(`SELECT name FROM "Organization" WHERE id='${destino}';`);
  // Un vínculo o remisión de una corrida anterior se limpia para empezar sin estado.
  sql(`DELETE FROM "RemisionEvento" WHERE "remisionId" IN (SELECT id FROM "Remision" WHERE "origenId"='${origen}' AND "destinoId"='${destino}');
       DELETE FROM "Remision" WHERE "origenId"='${origen}' AND "destinoId"='${destino}';
       DELETE FROM "VinculoCentro" WHERE ("solicitanteId"='${origen}' AND "receptorId"='${destino}') OR ("solicitanteId"='${destino}' AND "receptorId"='${origen}');`);
  p1 = `qa32a${S}`; p2 = `qa32b${S}`; p3 = `qa32c${S}`; preExistente = `qa32d${S}`;
  personaIds = [1, 2, 3].map((n) => `qa32p${n}${S}`);
  sql(`INSERT INTO "Persona"(id,"tipoDocumento","numeroDocumento",nombre) VALUES ${personaIds.map((id, i) => `('${id}','CC','${DOC(i + 1)}','QA Persona ${i + 1}')`).join(",")};
       INSERT INTO "PacienteTenant"(id,"organizationId","personaId",nombre,celular,correo,notas) VALUES
         ('${p1}','${origen}','${personaIds[0]}','QA Remitido Uno ${S}','${CELULAR}','${CORREO}','${NOTA}'),
         ('${p2}','${origen}','${personaIds[1]}','QA Remitido Dos ${S}',NULL,NULL,NULL),
         ('${p3}','${origen}','${personaIds[2]}','QA Remitido Tres ${S}',NULL,NULL,NULL),
         ('${preExistente}','${destino}','${personaIds[1]}','QA Nombre Previo ${S}',NULL,NULL,NULL);`);
});

test.afterAll(() => limpiar());

async function remitir(page: Page, pacienteId: string) {
  await page.goto(`/remisiones/nueva?paciente=${pacienteId}`);
  await page.getByRole("combobox", { name: "Centro destino" }).click();
  await page.getByRole("option", { name: nombreDestino, exact: true }).click();
  await page.getByLabel("Motivo de la remisión").fill("Evaluación por especialista QA");
  await page.getByLabel("Estudios solicitados").fill("Tomografía de una zona");
  await page.getByLabel(/El paciente autorizó expresamente/).check();
  await page.getByRole("button", { name: "Enviar remisión" }).click();
  await expect(page).toHaveURL(/\/remisiones\/(?!nueva|vinculos)[^/]+$/);
  return page.url().split("/").pop()!;
}

async function correo(request: import("@playwright/test").APIRequestContext, para: string, asunto: string) {
  let id = "";
  await expect.poll(async () => {
    const lista = await (await request.get(`${MAILPIT}/search?query=${encodeURIComponent(`to:${para} subject:"${asunto}"`)}`)).json();
    id = (lista.messages as { ID: string; Created: string }[]).find((x) => new Date(x.Created).getTime() >= desde)?.ID ?? "";
    return !!id;
  }, { timeout: 30_000 }).toBe(true);
  return (await (await request.get(`${MAILPIT}/message/${id}`)).json()) as { Text: string; HTML: string; Subject: string };
}

test.describe("1. vínculo entre centros", () => {
  test("código inexistente y código real responden igual; sin vínculo no hay destino; el destino acepta", async ({ browser }) => {
    const c2 = await browser.newContext({ storageState: authFile("admin2") });
    const pg = await c2.newPage();
    await pg.goto("/remisiones/vinculos");
    for (const codigo of [`no-existe-${S}`, "radex-demo"]) {
      await pg.getByLabel("Código del otro centro").fill(codigo);
      await pg.getByRole("button", { name: "Solicitar vínculo" }).click();
      await expect(pg.getByText(MENSAJE_SOLICITUD).first()).toBeVisible();
      await expect(pg.getByLabel("Código del otro centro")).toHaveValue("");
    }
    expect(sql(`SELECT count(*) FROM "VinculoCentro" WHERE "solicitanteId"='${origen}' AND "receptorId"='${destino}' AND estado='PENDIENTE';`)).toBe("1");
    // Mientras está pendiente no hay centros destino.
    await pg.goto(`/remisiones/nueva?paciente=${p1}`);
    await expect(pg.getByText("Aún no tienes centros vinculados")).toBeVisible();
    await expect(pg.getByRole("combobox", { name: "Centro destino" })).toHaveCount(0);
    await c2.close();

    const cd = await browser.newContext({ storageState: authFile("admin") });
    const pd = await cd.newPage();
    await pd.goto("/remisiones/vinculos");
    const fila = pd.getByRole("listitem").filter({ hasText: nombreOrigen });
    await fila.getByRole("button", { name: "Aceptar" }).click();
    await expect(pd.getByText("Vínculo aceptado")).toBeVisible();
    expect(sql(`SELECT estado FROM "VinculoCentro" WHERE "solicitanteId"='${origen}' AND "receptorId"='${destino}';`)).toBe("ACTIVO");
    await cd.close();
  });
});

test.describe("origen (admin2)", () => {
  test.use({ storageState: authFile("admin2") });

  test("2. el consentimiento es obligatorio: el servidor rechaza y no se crea la remisión", async ({ page }) => {
    await page.goto(`/remisiones/nueva?paciente=${p1}`);
    await page.getByRole("combobox", { name: "Centro destino" }).click();
    await page.getByRole("option", { name: nombreDestino, exact: true }).click();
    await page.getByLabel("Motivo de la remisión").fill("Evaluación por especialista QA");
    await page.getByLabel("Estudios solicitados").fill("Tomografía de una zona");
    const boton = page.getByRole("button", { name: "Enviar remisión" });
    await expect(boton).toBeDisabled();
    // El botón solo se habilita con la casilla; se altera la petición para probar la validación del servidor.
    await page.getByLabel(/El paciente autorizó expresamente/).check();
    let alterada = false;
    await page.route("**/remisiones/nueva**", async (route) => {
      const cuerpo = route.request().method() === "POST" ? route.request().postData() : null;
      if (!cuerpo?.includes('"autorizado":true')) return route.continue();
      alterada = true;
      await route.continue({ postData: cuerpo.replace('"autorizado":true', '"autorizado":false') });
    });
    await boton.click();
    await expect(page.getByText("Confirma que el paciente autorizó compartir sus datos")).toBeVisible();
    expect(alterada).toBe(true);
    expect(sql(`SELECT count(*) FROM "Remision" WHERE "pacienteOrigenId" IN ('${p1}','${p2}','${p3}');`)).toBe("0");
  });

  test("3. envío con alcance limitado (sin CONTACTO): el destino ve nombre, documento y motivo, no celular, correo ni notas", async ({ page, browser, request }) => {
    r1 = await remitir(page, p1);
    expect(sql(`SELECT estado||'|'||COALESCE(celular,'-')||'|'||array_to_string(alcance,',') FROM "Remision" WHERE id='${r1}';`)).toBe("ENVIADA|-|IDENTIFICACION");
    expect(sql(`SELECT count(*) FROM "Autorizacion" WHERE "organizationId"='${origen}' AND "pacienteId"='${p1}' AND finalidad LIKE 'remisión de datos a%' AND otorgada;`)).toBe("1");
    const cd = await browser.newContext({ storageState: authFile("admin") });
    const pd = await cd.newPage();
    await pd.goto(`/remisiones/${r1}`);
    await expect(pd.getByText(`QA Remitido Uno ${S}`).first()).toBeVisible();
    await expect(pd.getByText("Evaluación por especialista QA")).toBeVisible();
    const html = await pd.content();
    for (const privado of [CELULAR, CORREO, NOTA]) expect(html).not.toContain(privado);
    await cd.close();
    // El correo al destino no lleva el nombre del paciente ni su documento.
    const m = await correo(request, "admin@radex.demo", "remisión nueva");
    for (const t of [m.Text, m.HTML, m.Subject]) { expect(t).not.toContain(`QA Remitido Uno`); expect(t).not.toContain(DOC(1)); }
    expect(m.Text).toContain(`/remisiones/${r1}`);
  });
});

test.describe("destino (admin)", () => {
  test.use({ storageState: authFile("admin") });

  test("4. recibir crea el paciente y, si ya existe, no sobrescribe su nombre", async ({ page, browser }) => {
    await page.goto(`/remisiones/${r1}`);
    await page.getByRole("button", { name: "Recibir" }).click();
    await expect(page.getByText("Remisión recibida")).toBeVisible();
    pacienteDestino = sql(`SELECT "pacienteDestinoId" FROM "Remision" WHERE id='${r1}';`);
    expect(sql(`SELECT nombre||'|'||COALESCE(celular,'-')||'|'||COALESCE(correo,'-') FROM "PacienteTenant" WHERE id='${pacienteDestino}' AND "organizationId"='${destino}';`)).toBe(`QA Remitido Uno ${S}|-|-`);

    const c2 = await browser.newContext({ storageState: authFile("admin2") });
    const po = await c2.newPage();
    r2 = await remitir(po, p2);
    r3 = await remitir(po, p3);
    await c2.close();
    await page.goto(`/remisiones/${r2}`);
    await page.getByRole("button", { name: "Recibir" }).click();
    await expect(page.getByText("Remisión recibida")).toBeVisible();
    expect(sql(`SELECT "pacienteDestinoId" FROM "Remision" WHERE id='${r2}';`)).toBe(preExistente);
    expect(sql(`SELECT nombre FROM "PacienteTenant" WHERE id='${preExistente}';`)).toBe(`QA Nombre Previo ${S}`);
  });

  test("5. crear la orden pone la remisión EN_PROCESO; reutilizar el remisionId falla sin segunda orden", async ({ page }) => {
    await page.goto(`/remisiones/${r1}`);
    await page.getByRole("link", { name: "Crear orden" }).click();
    await expect(page).toHaveURL(new RegExp(`/ordenes/nueva\\?paciente=${pacienteDestino}&remision=${r1}`));
    await page.getByRole("checkbox", { name: "Panorámica", exact: true }).check();
    await page.getByRole("button", { name: "Crear orden" }).click();
    await expect(page).toHaveURL(/\/ordenes\/(?!nueva)[^/]+$/);
    ordenDestino = page.url().split("/").pop()!;
    await expect(page.getByText(`Remisión de ${nombreOrigen}`)).toBeVisible();
    expect(sql(`SELECT estado||'|'||"ordenDestinoId" FROM "Remision" WHERE id='${r1}';`)).toBe(`EN_PROCESO|${ordenDestino}`);
    // Segundo intento con el mismo remisionId.
    await page.goto(`/ordenes/nueva?paciente=${pacienteDestino}&remision=${r1}`);
    await page.getByRole("checkbox", { name: "Panorámica", exact: true }).check();
    await page.getByRole("button", { name: "Crear orden" }).click();
    await expect(page.getByText("La remisión ya no está disponible para crear la orden")).toBeVisible();
    expect(sql(`SELECT count(*) FROM "Orden" WHERE "pacienteId"='${pacienteDestino}';`)).toBe("1");
  });

  test("6. devolver falla sin informe emitido; con estudio e informe pasa a DEVUELTA y avisa al origen", async ({ page, request }) => {
    await page.goto(`/remisiones/${r1}`);
    await page.getByRole("button", { name: "Devolver estudio e informe" }).click();
    await expect(page.getByText("Emite el informe antes de devolver")).toBeVisible();
    expect(sql(`SELECT estado FROM "Remision" WHERE id='${r1}';`)).toBe("EN_PROCESO");

    // Estudio sintético en Orthanc ligado a la orden del destino, publicado, y un informe emitido (PDF mínimo).
    const up = await page.request.post(`/api/estudios/cargar?pacienteId=${pacienteDestino}&ordenId=${ordenDestino}`, { headers: { "content-type": "application/dicom" }, data: dicomSintetico({ patientId: DOC(1), studyUid: STUDY_UID }) });
    expect(up.status()).toBe(200);
    estudioId = sql(`SELECT id FROM "Estudio" WHERE "studyInstanceUid"='${STUDY_UID}';`);
    informeId = `qa32i${S}`;
    sql(`UPDATE "Estudio" SET estado='PUBLICADO' WHERE id='${estudioId}';
         INSERT INTO "Informe"(id,"organizationId","grupoId",estado,"pacienteId","ordenId",codigo,pdf,"emitidoEn","actualizadoEn")
         VALUES ('${informeId}','${destino}','qa32g${S}','EMITIDO','${pacienteDestino}','${ordenDestino}','Q32${S}',decode('${PDF_HEX}','hex'),now(),now());`);
    await page.reload();
    await page.getByRole("button", { name: "Devolver estudio e informe" }).click();
    await expect(page.getByText("Estudio e informe devueltos")).toBeVisible();
    expect(sql(`SELECT estado||'|'||"informeId"||'|'||array_to_string("estudioUids",',') FROM "Remision" WHERE id='${r1}';`)).toBe(`DEVUELTA|${informeId}|${STUDY_UID}`);
    const m = await correo(request, "admin@radex2.demo", "respondió");
    expect(m.Text).toContain(`/remisiones/${r1}`);
    expect(m.Text).not.toContain("QA Remitido Uno");
  });
});

test.describe("7. origen consume lo devuelto", () => {
  test.use({ storageState: authFile("admin2") });

  test("PDF 200 application/pdf y visor 200 (solo lectura) para el uid devuelto", async ({ page }) => {
    const pdf = await page.request.get(`/api/remisiones/${r1}/informe`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect(pdf.headers()["cache-control"]).toContain("no-store");
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
    expect((await page.request.get(`/dicom-web/studies?StudyInstanceUID=${STUDY_UID}`)).status()).toBe(200);
    expect((await page.request.post(`/dicom-web/studies?StudyInstanceUID=${STUDY_UID}`, { data: "x" })).status()).toBe(403);
    await page.goto(`/remisiones/${r1}`);
    await expect(page.getByRole("link", { name: "Descargar informe" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Ver en visor/ })).toBeVisible();
  });

  test("8. AISLAMIENTO: el origen no llega a nada del destino", async ({ page }) => {
    for (const ruta of [`/pacientes/${pacienteDestino}`, `/ordenes/${ordenDestino}`, `/informes/${informeId}`, `/estudios/${estudioId}`]) {
      expect((await page.goto(ruta))?.status(), ruta).toBe(404);
    }
    for (const ruta of [`/api/informes/${informeId}/pdf`, `/api/estudios/${estudioId}/descargar`]) {
      expect([401, 403, 404], ruta).toContain((await page.request.get(ruta)).status());
    }
    // Un uid que NO fue remitido sigue prohibido.
    expect((await page.request.get(`/dicom-web/studies?StudyInstanceUID=${CBCT_UID}`)).status()).toBe(403);
    // La página de la remisión del origen no expone ids del lado destino.
    await page.goto(`/remisiones/${r1}`);
    const html = await page.content();
    for (const id of [pacienteDestino, ordenDestino]) expect(html).not.toContain(id);
  });
});

test.describe("destino: aislamiento inverso y doctor", () => {
  test("9. el destino no llega al paciente del origen ni ve ids del origen en su página", async ({ browser }) => {
    const cd = await browser.newContext({ storageState: authFile("admin") });
    const page = await cd.newPage();
    expect((await page.goto(`/pacientes/${p1}`))?.status()).toBe(404);
    await page.goto(`/remisiones/${r1}`);
    const html = await page.content();
    const autorizacion = sql(`SELECT "autorizacionId" FROM "Remision" WHERE id='${r1}';`);
    for (const id of [p1, autorizacion]) expect(html).not.toContain(id);
    // Una remisión de otro par de centros no existe para el destino.
    expect((await page.goto(`/remisiones/inexistente-${S}`))?.status()).toBe(404);
    await cd.close();
  });

  test("10. el doctor remitente no ve remisiones ni el visor de lo remitido", async ({ browser }) => {
    const cd = await browser.newContext({ storageState: authFile("doctor") });
    const page = await cd.newPage();
    expect((await page.goto("/remisiones"))?.status()).toBe(404);
    expect((await page.goto(`/remisiones/${r1}`))?.status()).toBe(404);
    expect((await page.request.get(`/dicom-web/studies?StudyInstanceUID=${STUDY_UID}`)).status()).toBe(403);
    await cd.close();
  });
});

test.describe("11. cancelación", () => {
  test.use({ storageState: authFile("admin2") });

  test("una remisión cancelada no entrega PDF (404) ni visor (403)", async ({ page }) => {
    await page.goto(`/remisiones/${r3}`);
    await page.getByRole("button", { name: "Cancelar remisión" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar remisión" }).click();
    await expect(page.getByText("Remisión cancelada")).toBeVisible();
    expect(sql(`SELECT estado FROM "Remision" WHERE id='${r3}';`)).toBe("CANCELADA");
    expect((await page.request.get(`/api/remisiones/${r3}/informe`)).status()).toBe(404);
    // R1 pasa a CANCELADA por SQL (simula que deja de valer): el acceso devuelto desaparece.
    sql(`UPDATE "Remision" SET estado='CANCELADA' WHERE id='${r1}';`);
    expect((await page.request.get(`/api/remisiones/${r1}/informe`)).status()).toBe(404);
    expect((await page.request.get(`/dicom-web/studies?StudyInstanceUID=${STUDY_UID}`)).status()).toBe(403);
  });
});

test.describe("pantallas: accesibilidad, claro/oscuro y móvil", () => {
  test.use({ storageState: authFile("admin") });
  for (const tema of ["light", "dark"] as const) {
    test(`axe sin violaciones serias ni críticas (${tema})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: tema });
      for (const ruta of ["/remisiones", "/remisiones?vista=recibidas", "/remisiones/vinculos", `/remisiones/${r2}`]) {
        await page.goto(ruta);
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
        const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${ruta}: ${v.id}`)).toEqual([]);
      }
    });
  }

  test("móvil 390 px sin desborde horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const ruta of ["/remisiones?vista=recibidas", `/remisiones/${r2}`, "/remisiones/vinculos"]) {
      await page.goto(ruta);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), ruta).toBe(true);
    }
  });
});
