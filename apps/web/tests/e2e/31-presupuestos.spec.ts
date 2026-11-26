import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { authFile } from "./helpers";
import { sesionQa, sql } from "./qa-usuarios";

// Cotización virtual de punta a punta: recepción crea la cotización desde una valoración completada (SQL), la envía (correos separados, sin PHI),
// el paciente (sin sesión, iPhone 390 px) abre con código malo y bueno, pregunta, acepta; el tablero lo refleja y se convierte en orden.
// Además: rechazo, vencida, anulada, costo/margen solo admin, aislamiento entre centros, doctor remitente y especialista ajeno en 404, y el flujo desde un lead.
// Datos propios "QA Presupuesto <sufijo>"; limpia al terminar.
test.describe.configure({ mode: "serial", timeout: 120_000 });

const MAILPIT = "http://127.0.0.1:8025/api/v1";
const SUF = String(Date.now()).slice(-7);
const NOMBRE = `QA Presupuesto ${SUF}`;
const DOC = `QAPR${SUF}`;
const CORREO = `qa-presupuesto-${SUF}@dentview.demo`;
const LEAD_DOC = `QAPL${SUF}`;
const INICIO = Date.now() - 5_000;

let org = "", servicioId = "";
let pacienteId = "", personaId = "", valoracionId = "", leadId = "";
let rec: BrowserContext, paciente: BrowserContext;
let recPage: Page;
let presupuestoId = "", enlace = "", codigo = "";

async function correo(request: APIRequestContext, para: string, asunto: string, desde: number) {
  let id = "";
  await expect.poll(async () => {
    const lista = await (await request.get(`${MAILPIT}/search?query=${encodeURIComponent(`to:${para} subject:"${asunto}"`)}`)).json();
    id = (lista.messages as { ID: string; Created: string }[]).find((x) => new Date(x.Created).getTime() >= desde)?.ID ?? "";
    return !!id;
  }, { timeout: 30_000 }).toBe(true);
  return (await request.get(`${MAILPIT}/message/${id}`)).json() as Promise<{ Text: string; HTML: string; Subject: string }>;
}

/** Lee enlace y código del diálogo del personal y lo cierra. */
async function credenciales(page: Page) {
  const e = (await page.getByTestId("presupuesto-enlace").textContent())!.trim();
  const c = (await page.getByTestId("presupuesto-codigo").textContent())!.trim();
  await page.getByRole("button", { name: "Listo" }).click();
  return { enlace: e, codigo: c };
}

/** Abre el enlace en un contexto del paciente (sin sesión) y entra con el código. */
async function entrar(url: string, cod: string, ctx: BrowserContext = paciente) {
  const page = await ctx.newPage();
  await page.goto(url);
  // Con la cookie vigente de ESE enlace la cotización abre directo.
  if (await page.getByLabel("Código de acceso").isVisible()) {
    await page.getByLabel("Código de acceso").fill(cod);
    await page.getByRole("button", { name: "Continuar" }).click();
  }
  return page;
}
const contextoPaciente = (browser: Browser) => browser.newContext({ ignoreHTTPSErrors: true, storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

/** Duplica la cotización de la ficha actual, guarda el borrador y la envía; devuelve su id, enlace y código. */
async function duplicarYEnviar(page: Page, desdeId: string) {
  await page.goto(`/presupuestos/${desdeId}`);
  await page.getByRole("button", { name: "Duplicar" }).click();
  await page.waitForURL(/\/presupuestos\/[^/]+\/editar$/);
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await page.waitForURL(/\/presupuestos\/(?!nuevo)[^/?]+$/);
  const id = page.url().split("/").pop()!;
  await page.getByRole("button", { name: "Enviar al paciente" }).click();
  return { id, ...(await credenciales(page)) };
}

test.beforeAll(async ({ browser, baseURL }) => {
  org = sql(`select id from "Organization" where slug='radex-demo'`);
  servicioId = sql(`select id from "Servicio" where "organizationId"='${org}' and nombre='Panorámica' and activo limit 1`);
  personaId = `qaprper${SUF}`; pacienteId = `qaprpac${SUF}`; valoracionId = `qaprval${SUF}`; leadId = `qaprlead${SUF}`;
  sql(`insert into "Persona"(id,"tipoDocumento","numeroDocumento",nombre) values ('${personaId}','CC','${DOC}','${NOMBRE}');
       insert into "PacienteTenant"(id,"organizationId","personaId",nombre,correo,celular) values ('${pacienteId}','${org}','${personaId}','${NOMBRE}','${CORREO}','3001234567');
       insert into "Valoracion"(id,"organizationId","pacienteId",nombre,correo,motivo,estado,"tokenHash","expiraEn","presupuestoEstimado","tratamientoSugerido","completadaEn","actualizadoEn")
         values ('${valoracionId}','${org}','${pacienteId}','${NOMBRE}','${CORREO}','Dolor QA','COMPLETADA','qaprhash${SUF}',now()+interval '7 days',800000,'Restauración molar QA',now(),now());
       insert into "Lead"(id,"organizationId",nombre,origen,etapa,correo,telefono,"actualizadoEn") values ('${leadId}','${org}','QA Presupuesto Lead ${SUF}','WEB','CONTACTADO','qa-presupuesto-lead-${SUF}@dentview.demo','3009876543',now());`);
  rec = await browser.newContext({ storageState: await sesionQa(browser, "recepcion", baseURL!), baseURL: baseURL! });
  recPage = await rec.newPage();
  paciente = await contextoPaciente(browser);
});

test.afterAll(async () => {
  await rec?.close();
  await paciente?.close();
  try {
    sql(`delete from "Evento" where "pacienteId" in (select id from "PacienteTenant" where "personaId" in (select id from "Persona" where "numeroDocumento" in ('${DOC}','${LEAD_DOC}')));
         delete from "Presupuesto" where "organizationId"='${org}' and ("pacienteId" in (select id from "PacienteTenant" where "personaId" in (select id from "Persona" where "numeroDocumento" in ('${DOC}','${LEAD_DOC}'))));
         delete from "OrdenItem" where "ordenId" in (select id from "Orden" where "pacienteId" in (select id from "PacienteTenant" where "personaId" in (select id from "Persona" where "numeroDocumento" = '${DOC}')));
         delete from "Orden" where "pacienteId" in (select id from "PacienteTenant" where "personaId" in (select id from "Persona" where "numeroDocumento" = '${DOC}'));
         delete from "Mensaje" where tipo like 'PRESUPUESTO_%' and "organizationId"='${org}' and "creadoEn" >= to_timestamp(${INICIO / 1000});
         delete from "Valoracion" where id='${valoracionId}';
         delete from "Lead" where id='${leadId}';
         delete from "PacienteTenant" where "personaId" in (select id from "Persona" where "numeroDocumento" in ('${DOC}','${LEAD_DOC}'));
         delete from "Persona" where "numeroDocumento" in ('${DOC}','${LEAD_DOC}');`);
  } catch { /* sin docker */ }
});

test("recepción crea la cotización desde una valoración completada y no ve costo ni lo clínico", async () => {
  const page = recPage;
  await page.goto(`/presupuestos/nuevo?valoracion=${valoracionId}`);
  await expect(page.getByRole("heading", { name: "Nueva cotización" })).toBeVisible();
  await expect(page.getByText(NOMBRE).first()).toBeVisible();
  // Precarga: el presupuesto estimado queda como nota; el tratamiento sugerido (clínico) no, porque recepción no lo ve.
  await expect(page.getByLabel(/Notas para el paciente/)).toHaveValue(/800\.000/);
  await expect(page.getByLabel(/Notas para el paciente/)).not.toHaveValue(/Restauración/);
  await expect(page.getByLabel("Costo unitario")).toHaveCount(0);

  await page.locator("#it-serv-0").selectOption(servicioId);
  await page.locator("#it-cant-0").fill("2");
  await page.getByRole("button", { name: "Agregar ítem" }).click();
  await page.locator("#it-desc-1").fill("Blanqueamiento en consultorio");
  await page.locator("#it-valor-1").fill("300000");
  await page.locator("#it-desct-1").fill("20000");
  await page.locator("#it-fase-1").fill("2");
  await page.locator("#it-diente-1").fill("11");
  await expect(page.getByTestId("total-editor")).toContainText("360.000"); // 2 × (50.000 − 10.000) + 300.000 − 20.000
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await page.waitForURL(/\/presupuestos\/(?!nuevo)[^/?]+$/);
  presupuestoId = page.url().split("/").pop()!;
  await expect(page.getByTestId("total-ficha")).toContainText("360.000");
  await expect(page.getByText("Borrador").first()).toBeVisible();
  await expect(page.getByText("Costo y margen", { exact: true })).toHaveCount(0);
  // Los totales y el estado se guardaron en el servidor.
  expect(sql(`select count(*) from "ItemPresupuesto" where "presupuestoId"='${presupuestoId}'`)).toBe("2");
  expect(sql(`select "valoracionId" from "Presupuesto" where id='${presupuestoId}'`)).toBe(valoracionId);
});

test("validaciones del servidor: la vigencia en el pasado se rechaza y un borrador se edita", async () => {
  const page = recPage;
  await page.goto(`/presupuestos/${presupuestoId}/editar`);
  await page.getByLabel("Vigente hasta").evaluate((el: HTMLInputElement) => { el.removeAttribute("min"); });
  await page.getByLabel("Vigente hasta").fill("2020-01-01");
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(page.getByText(/vigencia no puede estar en el pasado/i)).toBeVisible();
  await page.reload();
  await page.locator("#it-cant-0").fill("2");
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await page.waitForURL(`**/presupuestos/${presupuestoId}`);
});

test("enviar: correos separados sin PHI, enlace y código solo una vez", async ({ request }) => {
  const page = recPage;
  await page.goto("/presupuestos");
  await expect(page.getByRole("link", { name: "Presupuestos" }).first()).toBeVisible(); // entrada del menú
  await page.goto(`/presupuestos/${presupuestoId}`);
  const desde = Date.now() - 2_000;
  await page.getByRole("button", { name: "Enviar al paciente" }).click();
  ({ enlace, codigo } = await credenciales(page));
  expect(enlace).toMatch(/\/presupuesto\/[A-Za-z0-9_-]{43}$/);
  expect(codigo).toMatch(/^\d{6}$/);
  await expect(page.getByText("Enviada").first()).toBeVisible();
  // Inmutable: ya no hay botón de editar y la ruta de edición vuelve a la ficha.
  await expect(page.getByRole("link", { name: "Editar" })).toHaveCount(0);
  await page.goto(`/presupuestos/${presupuestoId}/editar`);
  await expect(page).toHaveURL(new RegExp(`/presupuestos/${presupuestoId}$`));

  const mEnlace = await correo(request, CORREO, "tu cotización está lista", desde);
  const mCodigo = await correo(request, CORREO, "Código de acceso a tu cotización", desde);
  expect(mEnlace.Text).toContain("/presupuesto/");
  expect(mEnlace.Text).not.toContain(codigo);
  expect(mCodigo.Text).toContain(codigo);
  expect(mCodigo.Text).not.toContain("/presupuesto/");
  for (const m of [mEnlace, mCodigo]) {
    for (const prohibido of [NOMBRE, "360.000", "Blanqueamiento", "Panorámica"]) { expect(m.Text).not.toContain(prohibido); expect(m.HTML).not.toContain(prohibido); expect(m.Subject).not.toContain(prohibido); }
  }
  // En la BD solo hay hashes.
  const guardado = sql(`select "tokenHash" || '|' || "codigoHash" from "Presupuesto" where id='${presupuestoId}'`);
  expect(guardado).not.toContain(codigo);
  expect(guardado).not.toContain(enlace.split("/").pop()!);
});

test("el paciente: código malo (mensaje genérico), código bueno, ve la cotización móvil y queda VISTO", async ({ request }) => {
  const desde = Date.now() - 2_000;
  const page = await paciente.newPage();
  await page.goto(enlace);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await page.getByLabel("Código de acceso").fill(codigo === "000000" ? "111111" : "000000");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.locator("#codigo-error")).toContainText("El enlace o el código no son válidos, o ya vencieron.");
  await page.getByLabel("Código de acceso").fill(codigo);
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: /Cotización P-\d{4}/ })).toBeVisible();
  await expect(page.getByTestId("total-publico")).toContainText("360.000");
  await expect(page.getByText("Fase 1")).toBeVisible();
  await expect(page.getByText("Fase 2")).toBeVisible();
  await expect(page.getByText(/diente 11/)).toBeVisible();
  await expect(page.getByText("Los valores son estimados")).toBeVisible();
  // Sin costo ni margen y sin desbordar el ancho del iPhone.
  await expect(page.getByText(/costo|margen/i)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.close();

  // Primera apertura: VISTO en el tablero y aviso al responsable sin datos del paciente.
  expect(sql(`select estado || '|' || ("vistoEn" is not null) from "Presupuesto" where id='${presupuestoId}'`)).toBe("VISTO|true");
  const aviso = await correo(request, "qa-recepcion@radex.demo", "Novedad en la cotización P-", desde);
  expect(aviso.Text).not.toContain(NOMBRE);
  expect(aviso.Text).toContain("/presupuestos/");
  await recPage.goto("/presupuestos?estado=VISTO");
  await expect(recPage.getByRole("link", { name: /^P-\d{4}$/ }).first()).toBeVisible();
});

test("la sesión del paciente no vale para otro enlace y el código se bloquea tras 5 intentos", async ({ browser }) => {
  // Cotización aparte (duplicada y enviada) para no gastar los intentos de la principal.
  const { id, enlace: otroEnlace, codigo: otroCodigo } = await duplicarYEnviar(recPage, presupuestoId);
  const ctx = await contextoPaciente(browser);
  try {
    // La cookie de la primera cotización no abre la segunda.
    const p1 = await entrar(enlace, codigo, ctx);
    await expect(p1.getByRole("heading", { name: /Cotización P-\d{4}/ })).toBeVisible();
    await p1.goto(otroEnlace);
    await expect(p1.getByLabel("Código de acceso")).toBeVisible();
    // Con 4 intentos ya gastados (por SQL, para no agotar el límite por IP de la suite): el quinto malo cuenta y luego ni el código bueno entra.
    sql(`update "Presupuesto" set "intentosCodigo"=4 where id='${id}'`);
    const malo = otroCodigo === "123456" ? "654321" : "123456";
    await p1.getByLabel("Código de acceso").fill(malo);
    await p1.getByRole("button", { name: "Continuar" }).click();
    await expect(p1.locator("#codigo-error")).toContainText("El enlace o el código no son válidos");
    await p1.getByLabel("Código de acceso").fill(otroCodigo);
    await p1.getByRole("button", { name: "Continuar" }).click();
    await expect(p1.locator("#codigo-error")).toContainText("El enlace o el código no son válidos");
    expect(sql(`select "intentosCodigo" from "Presupuesto" where id='${id}'`)).toBe("5");
  } finally { await ctx.close(); }
});

test("el paciente pregunta y acepta con nombre y documento; el tablero y la ficha lo muestran", async () => {
  const page = await entrar(enlace, codigo);
  await page.getByRole("button", { name: "Tengo una pregunta" }).click();
  await page.getByLabel("Tu pregunta para el centro").fill("¿Se puede pagar en cuotas?");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(page.getByText("Enviamos tu pregunta al centro")).toBeVisible();

  await page.getByRole("button", { name: "Aceptar cotización" }).click();
  await expect(page.getByTestId("texto-aceptacion")).toContainText("estimados");
  // Sin casilla, sin documento o con nombre incompleto: no acepta.
  await page.getByRole("button", { name: "Confirmar aceptación" }).click();
  await expect(page.getByTestId("error-respuesta")).toBeVisible();
  await page.locator("#acepta-nombre").fill(NOMBRE);
  await page.locator("#acepta-doc").fill(DOC);
  await page.getByRole("button", { name: "Confirmar aceptación" }).click();
  await expect(page.getByTestId("error-respuesta")).toContainText("casilla");
  await page.locator("#acepta-casilla").click();
  await page.getByRole("button", { name: "Confirmar aceptación" }).click();
  await expect(page.getByText("Aceptaste esta cotización")).toBeVisible();
  await expect(page.getByRole("button", { name: "Aceptar cotización" })).toHaveCount(0);
  await page.close();

  expect(sql(`select estado || '|' || "aceptadoNombre" || '|' || "aceptadoDocumento" || '|' || "textoAceptacionVersion" || '|' || (length("textoAceptacionHash")=64) || '|' || (length("aceptadoIpHash")=64) from "Presupuesto" where id='${presupuestoId}'`))
    .toBe(`ACEPTADO|${NOMBRE}|${DOC}|2026-11-v1|true|true`);

  await recPage.goto("/presupuestos?estado=ACEPTADO");
  await expect(recPage.getByRole("row", { name: /P-\d{4}/ }).filter({ hasText: "Aceptada" }).first()).toBeVisible();
  await recPage.goto(`/presupuestos/${presupuestoId}`);
  await expect(recPage.getByText("Aceptada").first()).toBeVisible();
  await expect(recPage.getByText("(coincide con el del paciente)")).toBeVisible();
  await expect(recPage.getByText("¿Se puede pagar en cuotas?")).toBeVisible();
});

test("convertir en orden: muestra la diferencia con lo cotizado, exige confirmar y no se duplica", async () => {
  const page = recPage;
  await page.goto(`/presupuestos/${presupuestoId}`);
  await page.getByRole("button", { name: "Convertir en orden" }).click();
  const vista = page.getByTestId("vista-conversion");
  await expect(vista).toContainText("Panorámica");
  await expect(vista).toContainText("Blanqueamiento en consultorio");
  await expect(vista).toContainText("solo nota");
  const crear = page.getByRole("button", { name: "Crear orden" });
  await expect(crear).toBeDisabled(); // el ítem libre no pasa a la orden: difiere de lo cotizado
  await page.getByLabel(/Confirmo que quiero crear la orden/).click();
  await expect(crear).toBeEnabled();
  await crear.click();
  await page.waitForURL(/\/ordenes\/[^/]+$/);
  const ordenId = page.url().split("/").pop()!;
  expect(sql(`select estado || '|' || "ordenId" from "Presupuesto" where id='${presupuestoId}'`)).toBe(`CONVERTIDO|${ordenId}`);
  expect(sql(`select count(*) from "OrdenItem" where "ordenId"='${ordenId}'`)).toBe("2"); // 2 × Panorámica
  expect(sql(`select observaciones from "Orden" where id='${ordenId}'`)).toContain("Blanqueamiento en consultorio");
  await page.goto(`/presupuestos/${presupuestoId}`);
  await expect(page.getByRole("button", { name: "Convertir en orden" })).toHaveCount(0);
  await expect(page.getByText("Convertida en orden").first()).toBeVisible();
});

test("rechazo: el paciente rechaza con motivo y la cotización queda rechazada", async () => {
  const { id, enlace: e, codigo: c } = await duplicarYEnviar(recPage, presupuestoId);
  const page = await entrar(e, c);
  await page.getByRole("button", { name: "Rechazar", exact: true }).click();
  await page.getByLabel(/por qué/).fill("Es más de lo que puedo pagar");
  await page.getByRole("button", { name: "Rechazar cotización" }).click();
  await expect(page.getByText("Rechazaste esta cotización")).toBeVisible();
  await page.close();
  expect(sql(`select estado || '|' || "rechazoMotivo" from "Presupuesto" where id='${id}'`)).toBe("RECHAZADO|Es más de lo que puedo pagar");
  await recPage.goto(`/presupuestos/${id}`);
  await expect(recPage.getByText("Rechazada").first()).toBeVisible();
  await expect(recPage.getByText(/Es más de lo que puedo pagar/)).toBeVisible();
});

test("vencida: el paciente ve el aviso y no puede aceptar; el tablero la marca vencida", async () => {
  const { id, enlace: e, codigo: c } = await duplicarYEnviar(recPage, presupuestoId);
  sql(`update "Presupuesto" set "validoHasta"=(current_date - 3) where id='${id}'`);
  const page = await entrar(e, c);
  await expect(page.getByRole("status")).toContainText("venció");
  await expect(page.getByRole("button", { name: "Aceptar cotización" })).toHaveCount(0);
  await page.close();
  expect(sql(`select estado from "Presupuesto" where id='${id}'`)).not.toBe("ACEPTADO");
  await recPage.goto("/presupuestos?estado=VENCIDA");
  await expect(recPage.getByRole("link", { name: /^P-\d{4}$/ }).first()).toBeVisible();
  await recPage.goto(`/presupuestos/${id}`);
  await expect(recPage.getByText("Vencida").first()).toBeVisible();
  await expect(recPage.getByRole("button", { name: /Reenviar/ })).toHaveCount(0); // vencida: se duplica
});

test("anular revoca el enlace de inmediato", async () => {
  const { id, enlace: e, codigo: c } = await duplicarYEnviar(recPage, presupuestoId);
  await recPage.getByRole("button", { name: "Anular" }).click();
  await recPage.getByLabel("Motivo (obligatorio)").fill("El paciente cambió de odontólogo");
  await recPage.getByRole("button", { name: "Anular cotización" }).click();
  await expect(recPage.getByText("Anulada").first()).toBeVisible();
  const page = await entrar(e, c);
  await expect(page.locator("#codigo-error")).toContainText("El enlace o el código no son válidos");
  await page.close();
  expect(sql(`select estado || '|' || ("tokenHash" is null) from "Presupuesto" where id='${id}'`)).toBe("VENCIDO|true");
});

test("costo y margen solo para el administrador; el especialista ajeno y otros centros no la ven", async ({ browser, baseURL }) => {
  const admin = await browser.newContext({ storageState: authFile("admin"), baseURL: baseURL! });
  const ap = await admin.newPage();
  await ap.goto("/presupuestos/nuevo?paciente=" + pacienteId);
  await ap.locator("#it-desc-0").fill("Ítem con costo QA");
  await ap.locator("#it-valor-0").fill("100000");
  await expect(ap.getByLabel("Costo unitario")).toBeVisible();
  await ap.getByLabel("Costo unitario").fill("50000");
  await expect(ap.getByText(/Margen sobre costo/)).toBeVisible();
  await ap.getByRole("button", { name: "Guardar borrador" }).click();
  await ap.waitForURL(/\/presupuestos\/(?!nuevo)[^/?]+$/);
  const conCosto = ap.url().split("/").pop()!;
  await expect(ap.getByText("Costo y margen", { exact: true })).toBeVisible();
  await expect(ap.getByText("100 %", { exact: true })).toBeVisible();
  expect(sql(`select "costoUnitario" from "ItemPresupuesto" where "presupuestoId"='${conCosto}'`)).toBe("50000");
  expect(Number(sql(`select margen from "Presupuesto" where id='${conCosto}'`))).toBe(100);

  // Recepción ve la cotización pero ni el costo ni el margen; y al editarla no pierde el costo que puso el admin.
  await recPage.goto(`/presupuestos/${conCosto}`);
  await expect(recPage.getByText("Costo y margen", { exact: true })).toHaveCount(0);
  await expect(recPage.getByText(/costo 50/)).toHaveCount(0);
  await recPage.goto(`/presupuestos/${conCosto}/editar`);
  await expect(recPage.getByLabel("Costo unitario")).toHaveCount(0);
  await recPage.getByRole("button", { name: "Guardar borrador" }).click();
  await recPage.waitForURL(`**/presupuestos/${conCosto}`);
  expect(sql(`select "costoUnitario" from "ItemPresupuesto" where "presupuestoId"='${conCosto}'`)).toBe("50000");

  // Otro centro (radex-2-demo): 404 aunque tenga el id. Doctor remitente: 404 en la lista y en la ficha.
  const otro = await browser.newContext({ storageState: authFile("admin2"), baseURL: baseURL! });
  const op = await otro.newPage();
  expect((await op.goto(`/presupuestos/${conCosto}`))?.status()).toBe(404);
  expect((await op.goto(`/presupuestos/${presupuestoId}/editar`))?.status()).toBe(404);
  await otro.close();
  const doc = await browser.newContext({ storageState: authFile("doctor"), baseURL: baseURL! });
  const dp = await doc.newPage();
  expect((await dp.goto("/presupuestos"))?.status()).toBe(404);
  expect((await dp.goto(`/presupuestos/${conCosto}`))?.status()).toBe(404);
  await doc.close();
  // El especialista solo ve lo que creó o tiene a su nombre.
  const esp = await browser.newContext({ storageState: await sesionQa(browser, "especialista", baseURL!), baseURL: baseURL! });
  const ep = await esp.newPage();
  expect((await ep.goto("/presupuestos"))?.status()).toBe(200);
  expect((await ep.goto(`/presupuestos/${conCosto}`))?.status()).toBe(404);
  await esp.close();
  await admin.close();
});

test("desde un lead que aún no es paciente: pide el documento, lo registra, envía y el lead pasa a PROPUESTA", async ({ request }) => {
  const page = recPage;
  await page.goto(`/presupuestos/nuevo?lead=${leadId}`);
  await page.getByLabel("Número de documento").fill(LEAD_DOC);
  await page.locator("#it-desc-0").fill("Valoración especializada");
  await page.locator("#it-valor-0").fill("120000");
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await page.waitForURL(/\/presupuestos\/(?!nuevo)[^/?]+$/);
  const id = page.url().split("/").pop()!;
  expect(sql(`select "pacienteId" is not null from "Lead" where id='${leadId}'`)).toBe("t");
  expect(sql(`select etapa from "Lead" where id='${leadId}'`)).toBe("CONTACTADO"); // registrar al paciente no cambia la etapa
  const desde = Date.now() - 2_000;
  await page.getByRole("button", { name: "Enviar al paciente" }).click();
  await credenciales(page);
  expect(sql(`select etapa from "Lead" where id='${leadId}'`)).toBe("PROPUESTA");
  await correo(request, `qa-presupuesto-lead-${SUF}@dentview.demo`, "tu cotización está lista", desde);
  // (La ficha del lead vive en el módulo CRM, que radex-demo —centro radiológico— no tiene: no se prueba la insignia aquí.)
  expect(sql(`select count(*) from "Presupuesto" where id='${id}' and "leadId"='${leadId}'`)).toBe("1");
});
