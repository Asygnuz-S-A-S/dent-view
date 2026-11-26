import { expect as expectBase, test } from "@playwright/test";
import { authFile } from "./helpers";
import { sesionQa, sql } from "./qa-usuarios";

// La orden como eje: pestañas, ventanita de precio y RIPS. Datos propios (prefijo qa28) creados y borrados aquí.
// ConfigFacturacion se respalda y se restaura al final.
test.describe.configure({ mode: "serial" });
// El stack local compartido puede ir lento cuando corren varias suites a la vez.
const expect = expectBase.configure({ timeout: 30_000 });
test.use({ actionTimeout: 30_000, navigationTimeout: 60_000 });

const S = String(Date.now()).slice(-8);
const DOC = `28${S}`;
const NOMBRE = `QA28 Paciente ${S}`;
const SERVICIO = `QA28 Panoramica ${S}`;
const CONVENIO = `QA28 Convenio ${S}`;
let org = "", pacienteId = "", ordenId = "", ordenNumero = "", servicioId = "", convenioId = "", ordenConvenio = "";
let respaldoConfig = "";
let recepcion = "", especialista = "";

const configRips = (generaRips: boolean) => sql(`INSERT INTO "ConfigFacturacion"("organizationId", nit, "codigoPrestador", "generaRips", "modalidadDefecto", "grupoServiciosDefecto", "actualizadoEn")
  VALUES ('${org}', '900123456', '110010000001', ${generaRips}, '01', '01', now())
  ON CONFLICT ("organizationId") DO UPDATE SET nit='900123456', "codigoPrestador"='110010000001', "generaRips"=${generaRips}, "modalidadDefecto"='01', "grupoServiciosDefecto"='01';`);

test.beforeAll(async ({ browser, baseURL }) => {
  recepcion = await sesionQa(browser, "recepcion", baseURL!);
  especialista = await sesionQa(browser, "especialista", baseURL!);
  org = sql(`SELECT id FROM "Organization" WHERE slug='radex-demo';`);
  respaldoConfig = sql(`SELECT row_to_json(c) FROM "ConfigFacturacion" c WHERE "organizationId"='${org}';`);
  configRips(true);
});

test.afterAll(() => {
  // Por nombre (no por id): limpia aunque el primer test haya fallado antes de guardar el id.
  const pacientes = `SELECT id FROM "PacienteTenant" WHERE "organizationId"='${org}' AND nombre LIKE 'QA28 %'`;
  sql(`DELETE FROM "Evento" WHERE "pacienteId" IN (${pacientes});
       DELETE FROM "EnvioRips" WHERE "ordenId" IN (SELECT id FROM "Orden" WHERE "pacienteId" IN (${pacientes}));
       DELETE FROM "Factura" WHERE "pacienteId" IN (${pacientes});
       DELETE FROM "Orden" WHERE "pacienteId" IN (${pacientes});
       DELETE FROM "PacienteTenant" WHERE id IN (${pacientes});
       DELETE FROM "Persona" WHERE "numeroDocumento"='${DOC}';
       DELETE FROM "TarifaEspecial" WHERE "servicioId" IN (SELECT id FROM "Servicio" WHERE nombre LIKE 'QA28 %');
       DELETE FROM "Servicio" WHERE "organizationId"='${org}' AND nombre LIKE 'QA28 %';
       DELETE FROM "Convenio" WHERE "organizationId"='${org}' AND nombre LIKE 'QA28 %';
       DELETE FROM "ConfigFacturacion" WHERE "organizationId"='${org}';`);
  if (respaldoConfig) sql(`INSERT INTO "ConfigFacturacion" SELECT * FROM json_populate_record(null::"ConfigFacturacion", '${respaldoConfig.replace(/'/g, "''")}');`);
});

test.describe("administración", () => {
  test.use({ storageState: authFile("admin") });

  test("paciente con campos RIPS: validación y precarga al editar", async ({ page }) => {
    await page.goto("/pacientes");
    await page.getByRole("button", { name: "Nuevo paciente" }).click();
    await page.getByLabel("Número de documento").fill(DOC);
    await page.getByLabel("Nombre completo").fill(NOMBRE);
    await page.getByLabel("Fecha de nacimiento").fill("1990-05-10");
    await page.getByRole("combobox", { name: "Sexo" }).click();
    await page.getByRole("option", { name: /^M · Mujer/ }).click();
    await page.getByRole("combobox", { name: "Zona de residencia" }).click();
    await page.getByRole("option", { name: /^U · Urbana/ }).click();
    await page.getByRole("combobox", { name: "Tipo de usuario habitual" }).click();
    await page.getByRole("option", { name: /^05 / }).click();
    await page.getByLabel("NIT de la aseguradora").fill("800123456");
    // Municipio: solo dígitos y exactamente 5 (el navegador bloquea el envío).
    await page.getByLabel(/Municipio de residencia/).fill("11a0b");
    await expect(page.getByLabel(/Municipio de residencia/)).toHaveValue("110");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByLabel(/Municipio de residencia/).fill("11001");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page).toHaveURL(/\/pacientes\/[^/]+$/);
    pacienteId = page.url().split("/").pop()!;
    expect(sql(`SELECT concat_ws('|', sexo, "codMunicipio", "zonaTerritorial", "tipoUsuarioDefecto", "aseguradoraNit", "codPaisResidencia") FROM "PacienteTenant" WHERE id='${pacienteId}';`)).toBe("M|11001|U|05|800123456|170");
    // Editar: los datos RIPS llegan precargados.
    await page.getByRole("button", { name: "Editar" }).first().click();
    await expect(page.getByLabel(/Municipio de residencia/)).toHaveValue("11001");
    await expect(page.getByRole("combobox", { name: "Sexo" })).toContainText("Mujer");
  });

  test("servicio con CUPS, tipo RIPS y código REPS; convenio con pagador", async ({ page }) => {
    await page.goto("/catalogo");
    await page.getByRole("button", { name: "Nuevo servicio" }).click();
    await page.getByLabel("Nombre", { exact: true }).fill(SERVICIO);
    await page.getByLabel("Precio digital").fill("80000");
    await page.getByRole("combobox", { name: "Código CUPS", exact: true }).click();
    await page.getByPlaceholder("Código CUPS o nombre").fill("panoramica");
    await page.getByRole("option", { name: /870114/ }).click();
    await page.getByLabel("Código de servicio REPS").fill("302");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByText("Servicio guardado")).toBeVisible();
    expect(sql(`SELECT concat_ws('|', id, "codigoCups", "tipoRips", "codServicioReps") FROM "Servicio" WHERE nombre='${SERVICIO}' AND "organizationId"='${org}';`)).toMatch(/\|870114\|PROCEDIMIENTO\|302$/);
    servicioId = sql(`SELECT id FROM "Servicio" WHERE nombre='${SERVICIO}' AND "organizationId"='${org}';`);

    await page.goto("/convenios");
    await page.getByRole("button", { name: "Nuevo convenio" }).click();
    await page.getByLabel("Nombre", { exact: true }).fill(CONVENIO);
    await page.getByLabel("Descuento general (%)").fill("10");
    await page.getByRole("combobox", { name: "Tipo de pagador" }).click();
    await page.getByRole("option", { name: "EPS" }).click();
    await page.getByLabel("NIT del pagador").fill("800999111");
    await page.getByLabel(/CUCON/).fill("CUC-1");
    await page.getByLabel("Cobertura o plan").fill("Plan odontológico");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByText("Convenio guardado")).toBeVisible();
    expect(sql(`SELECT concat_ws('|', "tipoPagador", "nitPagador", cucon, "coberturaPlan") FROM "Convenio" WHERE nombre='${CONVENIO}' AND "organizationId"='${org}';`)).toBe("EPS|800999111|CUC-1|Plan odontológico");
    convenioId = sql(`SELECT id FROM "Convenio" WHERE nombre='${CONVENIO}' AND "organizationId"='${org}';`);
  });

  test("orden: copia el CUPS, pestañas accesibles y lista de verificación hasta LISTA", async ({ page }) => {
    await page.goto("/ordenes/nueva");
    await page.getByRole("combobox", { name: "Paciente" }).click();
    await page.getByPlaceholder("Nombre o documento").fill(DOC);
    await page.getByRole("option").filter({ hasText: DOC }).click();
    await page.getByRole("checkbox", { name: SERVICIO, exact: true }).check();
    await page.getByRole("button", { name: "Crear orden" }).click();
    await expect(page).toHaveURL(/\/ordenes\/(?!nueva)[^/]+$/);
    ordenId = page.url().split("/").pop()!;
    ordenNumero = (await page.getByRole("heading", { level: 1, name: /Orden #/ }).innerText()).match(/#(\d+)/)![1]!;
    expect(sql(`SELECT concat_ws('|', "codigoCups", "tipoRips") FROM "OrdenItem" WHERE "ordenId"='${ordenId}';`)).toBe("870114|PROCEDIMIENTO");

    // Resumen intacto + pestañas con roles y teclado.
    await expect(page.getByRole("row", { name: /Total/ })).toContainText("$ 80.000");
    for (const t of ["Resumen", "Servicios y precio", "RIPS", "Estudios y documentos", "Factura"]) await expect(page.getByRole("tab", { name: t })).toBeVisible();
    // Evolución solo existe en centros odontológicos (el radiológico no tiene historia clínica odontológica).
    const tipo = sql(`SELECT "tipoCentro" FROM "ConfigCentro" WHERE "organizationId"='${org}';`);
    await expect(page.getByRole("tab", { name: "Evolución" })).toHaveCount(tipo === "CENTRO_RADIOLOGICO" ? 0 : 1);
    await page.getByRole("tab", { name: "Resumen" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Servicios y precio" })).toHaveAttribute("aria-selected", "true");

    await page.getByRole("tab", { name: "RIPS" }).click();
    await expect(page).toHaveURL(/tab=rips/);
    const lista = page.getByRole("complementary", { name: "Lista de verificación RIPS" });
    await expect(lista).toContainText("Incompleta");
    await expect(page.getByRole("combobox", { name: "Tipo de usuario" })).toContainText("05"); // por defecto del paciente
    await expect(lista).toContainText("Falta el diagnóstico principal");

    await page.getByRole("combobox", { name: "Finalidad de la atención" }).click();
    await page.getByRole("option", { name: /^15 / }).click();
    await page.getByRole("combobox", { name: "Vía de ingreso" }).click();
    await page.getByRole("option", { name: /^01 / }).click();
    await page.getByRole("combobox", { name: "Diagnóstico principal", exact: true }).click();
    await page.getByPlaceholder("Código CIE-10 o nombre").fill("caries dentina");
    await page.getByRole("option", { name: /K021/ }).click();
    // Procedimiento: con tipo de usuario, finalidad, vía y diagnóstico ya no falta nada obligatorio.
    await expect(lista).not.toContainText("Incompleta");
    await expect(lista).toContainText("No falta ningún dato obligatorio");

    // Relacionados: sin repetidos entre sí ni con el principal.
    const agregar = async (codigo: string) => {
      await expect(page.getByPlaceholder("Código CIE-10 o nombre")).toHaveCount(0); // el selector anterior ya cerró
      await page.getByRole("combobox", { name: "Agregar diagnóstico relacionado" }).scrollIntoViewIfNeeded();
      await page.getByRole("combobox", { name: "Agregar diagnóstico relacionado" }).click();
      await page.getByPlaceholder("Código CIE-10 o nombre").fill(codigo);
      await page.getByRole("option", { name: new RegExp(codigo) }).click();
    };
    await agregar("K053");
    await agregar("K053");
    await expect(page.getByText("Ese diagnóstico ya está agregado")).toBeVisible();
    await agregar("K021");
    await expect(lista).toContainText("Incompleta");
    await expect(lista).toContainText("repite el principal");
    await page.getByRole("button", { name: "Quitar diagnóstico K021" }).click();
    await expect(lista).not.toContainText("Incompleta");

    await page.getByRole("button", { name: "Guardar datos RIPS" }).click();
    await expect(page.getByText("Datos RIPS guardados")).toBeVisible();
    expect(sql(`SELECT concat_ws('|', "tipoUsuario", finalidad, "viaIngreso", "diagnosticoPrincipal", array_to_string("diagnosticosRelacionados",','), ("ripsActualizadoEn" IS NOT NULL)) FROM "Orden" WHERE id='${ordenId}';`)).toBe("05|15|01|K021|K053|t");
    expect(sql(`SELECT count(*) FROM "Evento" WHERE tipo='orden.rips_actualizado' AND "pacienteId"='${pacienteId}';`)).toBe("1");

    // Generar y validar, luego descargar y comprobar la forma del JSON.
    await page.getByRole("button", { name: "Generar y validar" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Validado localmente" })).toBeVisible();
    await expect(page.getByText(/no es lo mismo que aprobado por el Ministerio/i)).toBeVisible();
    expect(sql(`SELECT concat_ws('|', estado, version) FROM "EnvioRips" WHERE "ordenId"='${ordenId}';`)).toBe("VALIDADO_LOCAL|DT1-v003");
    const r = await page.request.get(`/api/rips/${ordenId}`);
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toContain("application/json");
    expect(r.headers()["content-disposition"]).toBe(`attachment; filename="RIPS-${ordenNumero}.json"`);
    const json = await r.json();
    expect(json).toMatchObject({ numDocumentoIdObligado: "900123456", numFactura: null, tipoNota: null, numNota: null });
    const u = json.usuarios[0];
    expect(u).toMatchObject({ tipoDocumentoIdentificacion: "CC", numDocumentoIdentificacion: DOC, tipoUsuario: "05", fechaNacimiento: "1990-05-10", codSexo: "M", codMunicipioResidencia: "11001", codZonaTerritorialResidencia: "U", consecutivo: 1 });
    expect(Object.keys(u.servicios).sort()).toEqual(["consultas", "hospitalizacion", "medicamentos", "otrosServicios", "procedimientos", "recienNacidos", "urgencias"]);
    expect(u.servicios.procedimientos).toHaveLength(1);
    expect(u.servicios.procedimientos[0]).toMatchObject({ codPrestador: "110010000001", codProcedimiento: "870114", codServicio: 302, viaIngresoServicioSalud: "01", finalidadTecnologiaSalud: "15", codDiagnosticoPrincipal: "K021", codDiagnosticoRelacionado: "K053", vrServicio: 80000, tipoDocumentoIdentificacion: null });
    expect(sql(`SELECT count(*) FROM "EnvioRips" WHERE "ordenId"='${ordenId}';`)).toBe("2");
    expect(sql(`SELECT count(*) FROM "Evento" WHERE tipo='rips.generado' AND "pacienteId"='${pacienteId}';`)).toBe("2");
    await page.reload();
    await expect(page.getByRole("complementary", { name: "Lista de verificación RIPS" }).getByText("Validado local").first()).toBeVisible();

    // Sin móvil roto: el formulario cabe en 390 px.
    await page.setViewportSize({ width: 390, height: 844 });
    const desborda = await page.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && !e.closest("[class*=overflow-x-auto]")).slice(0, 5).map((e) => `${e.tagName}.${String(e.className).slice(0, 80)} ${Math.round(e.getBoundingClientRect().right)}`));
    expect(desborda).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("ventanita: precio con convenio y descuento, y solo lectura una vez facturada", async ({ page }) => {
    ordenConvenio = `qa28o2${S}`;
    sql(`INSERT INTO "Orden"(id,"organizationId",numero,"pacienteId","convenioId",estado,"actualizadoEn")
         SELECT '${ordenConvenio}','${org}',COALESCE(MAX(numero),0)+1,'${pacienteId}','${convenioId}','SOLICITADA',now() FROM "Orden" WHERE "organizationId"='${org}';
         INSERT INTO "OrdenItem"(id,"ordenId","servicioId",nombre,precio) VALUES ('qa28i2${S}','${ordenConvenio}','${servicioId}','${SERVICIO}',72000);`);
    await page.goto(`/ordenes/${ordenConvenio}?tab=precio`);
    const fila = page.getByRole("row", { name: new RegExp(SERVICIO) });
    await expect(fila).toContainText("Descuento del convenio");
    await expect(fila).toContainText("$ 80.000");
    await expect(fila).toContainText("$ 8.000");
    await expect(page.getByTestId("total-orden")).toHaveText("$ 72.000");
    await expect(page.getByRole("link", { name: "Crear cuenta de cobro" })).toHaveAttribute("href", `/facturacion/nueva?orden=${ordenConvenio}`);
    sql(`INSERT INTO "Factura"(id,"organizationId",numero,"pacienteId","ordenId",total) SELECT 'qa28f${S}','${org}',COALESCE(MAX(numero),0)+1,'${pacienteId}','${ordenConvenio}',72000 FROM "Factura" WHERE "organizationId"='${org}';`);
    await page.reload();
    await expect(page.getByText("Facturada: solo lectura")).toBeVisible();
    await expect(page.getByRole("link", { name: "Crear cuenta de cobro" })).toHaveCount(0);
    await page.getByRole("tab", { name: "Factura" }).click();
    await expect(page.getByText(/Cuenta de cobro #/)).toBeVisible();
  });

  test("listado: insignia y filtro RIPS", async ({ page }) => {
    await page.goto(`/ordenes?q=${DOC}`);
    await expect(page.getByRole("columnheader", { name: "RIPS" })).toBeVisible();
    await expect(page.getByRole("row", { name: new RegExp(`#${ordenNumero}`) })).toContainText("Lista");
    await page.goto(`/ordenes?q=${DOC}&rips=incompleta`);
    await expect(page.getByRole("row", { name: new RegExp(`#${ordenNumero}`) })).toHaveCount(0);
    await expect(page.getByRole("row", { name: /Incompleta/ }).first()).toBeVisible(); // la orden con convenio no tiene datos RIPS
    await page.goto(`/ordenes?q=${DOC}&rips=lista`);
    await expect(page.getByRole("row", { name: new RegExp(`#${ordenNumero}`) })).toBeVisible();
  });
});

test.describe("permisos y otros centros", () => {
  test("recepción edita lo administrativo pero no el diagnóstico ni la finalidad", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ storageState: recepcion, baseURL: baseURL! });
    const page = await ctx.newPage();
    await page.goto(`/ordenes/${ordenId}?tab=rips`);
    await expect(page.getByRole("combobox", { name: "Finalidad de la atención" })).toBeDisabled();
    await expect(page.getByRole("combobox", { name: "Diagnóstico principal", exact: true })).toBeDisabled();
    await expect(page.getByRole("combobox", { name: "Agregar diagnóstico relacionado" })).toHaveCount(0);
    await page.getByLabel("Número de autorización").fill("AUT-28");
    await page.getByRole("button", { name: "Guardar datos RIPS" }).click();
    await expect(page.getByText("Datos RIPS guardados")).toBeVisible();
    expect(sql(`SELECT concat_ws('|', "numAutorizacion", finalidad, "diagnosticoPrincipal") FROM "Orden" WHERE id='${ordenId}';`)).toBe("AUT-28|15|K021");
    expect((await page.request.get(`/api/rips/${ordenId}`)).status()).toBe(200);
    await ctx.close();
  });

  test("especialista sí registra diagnóstico y finalidad", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ storageState: especialista, baseURL: baseURL! });
    const page = await ctx.newPage();
    await page.goto(`/ordenes/${ordenId}?tab=rips`);
    await expect(page.getByRole("combobox", { name: "Finalidad de la atención" })).toBeEnabled();
    await expect(page.getByRole("combobox", { name: "Diagnóstico principal", exact: true })).toBeEnabled();
    await ctx.close();
  });

  test("doctor remitente y otro centro no acceden al RIPS de la orden", async ({ browser, baseURL }) => {
    const doctor = await browser.newContext({ storageState: authFile("doctor"), baseURL: baseURL! });
    expect((await doctor.request.get(`/api/rips/${ordenId}`)).status()).toBe(403);
    await doctor.close();
    const otro = await browser.newContext({ storageState: authFile("admin2"), baseURL: baseURL! });
    expect((await otro.request.get(`/api/rips/${ordenId}`)).status()).toBe(404);
    expect((await (await otro.newPage()).goto(`/ordenes/${ordenId}?tab=rips`))!.status()).toBe(404);
    await otro.close();
  });

  test("centro odontológico: la pestaña Evolución monta el componente de evolución", async ({ browser, baseURL }) => {
    const previo = sql(`SELECT "tipoCentro" FROM "ConfigCentro" WHERE "organizationId"='${org}';`);
    sql(`UPDATE "ConfigCentro" SET "tipoCentro"='CENTRO_ODONTOLOGICO' WHERE "organizationId"='${org}';`);
    const ctx = await browser.newContext({ storageState: authFile("admin"), baseURL: baseURL! });
    try {
      const page = await ctx.newPage();
      await page.goto(`/ordenes/${ordenId}?tab=evolucion`);
      await expect(page.getByRole("tab", { name: "Evolución" })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("tabpanel")).toBeVisible();
    } finally {
      sql(`UPDATE "ConfigCentro" SET "tipoCentro"='${previo}' WHERE "organizationId"='${org}';`);
      await ctx.close();
    }
  });

  test("con generaRips desactivado no hay pestaña, columna ni API, y la orden sigue funcionando", async ({ browser, baseURL }) => {
    configRips(false);
    const ctx = await browser.newContext({ storageState: authFile("admin"), baseURL: baseURL! });
    const page = await ctx.newPage();
    await page.goto(`/ordenes/${ordenId}?tab=rips`);
    await expect(page.getByRole("tab", { name: "RIPS" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Resumen" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("row", { name: /Total/ })).toContainText("$ 80.000");
    await expect(page.getByRole("link", { name: "Facturar" })).toBeVisible();
    await page.goto(`/ordenes?q=${DOC}`);
    await expect(page.getByRole("columnheader", { name: "RIPS" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Incompletas" })).toHaveCount(0);
    expect((await page.request.get(`/api/rips/${ordenId}`)).status()).toBe(404);
    await ctx.close();
  });
});
