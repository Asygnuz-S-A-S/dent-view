import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { authFile } from "./helpers";
import { sesionQa, sql } from "./qa-usuarios";

// Plan de tratamiento: se crea desde una cotización aceptada (precios congelados), recibe un anticipo, se piden 2 de 3 ítems en una orden,
// al atender la orden el saldo baja y el avance llega a 67 %, cancelar una orden devuelve el ítem a pendiente y un ítem no puede estar en dos órdenes.
// Aislamiento entre centros y módulo ausente en el radiológico. El plan solo existe en tipos odontológicos: radex-demo y radex-2-demo pasan a
// CENTRO_ODONTOLOGICO durante el spec y se restauran al final. Datos propios "QA Plan <sufijo>".
test.describe.configure({ mode: "serial", timeout: 120_000 });

const SUF = String(Date.now()).slice(-7);
const NOMBRE = `QA Plan ${SUF}`;
const DOC = `QAPL${SUF}`;
const TIPO = (slug: string, tipo: string) => `update "ConfigCentro" set "tipoCentro"='${tipo}' where "organizationId"=(select id from "Organization" where slug='${slug}');`;

let org = "", pacienteId = "", presupuestoId = "", planId = "";
let rec: BrowserContext, recPage: Page;
const serv = (n: string) => `qaplsv${n}${SUF}`;

test.beforeAll(async ({ browser, baseURL }) => {
  sql(TIPO("radex-demo", "CENTRO_ODONTOLOGICO") + TIPO("radex-2-demo", "CENTRO_ODONTOLOGICO"));
  org = sql(`select id from "Organization" where slug='radex-demo'`);
  pacienteId = `qaplpac${SUF}`;
  presupuestoId = `qaplpre${SUF}`;
  // Catálogo a 100.000 y cotización a 90.000 por ítem: el plan debe congelar lo cotizado, no el catálogo de hoy.
  sql(`insert into "Persona"(id,"tipoDocumento","numeroDocumento",nombre) values ('qaplper${SUF}','CC','${DOC}','${NOMBRE}');
       insert into "PacienteTenant"(id,"organizationId","personaId",nombre) values ('${pacienteId}','${org}','qaplper${SUF}','${NOMBRE}');
       insert into "Servicio"(id,"organizationId",categoria,nombre,"precioDigital","precioImpreso",descuento) values
         ('${serv("A")}','${org}','OTRO','QA Plan A ${SUF}',100000,100000,0),('${serv("B")}','${org}','OTRO','QA Plan B ${SUF}',100000,100000,0),('${serv("C")}','${org}','OTRO','QA Plan C ${SUF}',100000,100000,0);
       insert into "Presupuesto"(id,"organizationId",numero,"pacienteId",estado,titulo,"validoHasta","aceptadoEn","actualizadoEn")
         values ('${presupuestoId}','${org}',(select coalesce(max(numero),0)+1 from "Presupuesto" where "organizationId"='${org}'),'${pacienteId}','ACEPTADO','Rehabilitación QA ${SUF}',current_date+10,now(),now());
       insert into "ItemPresupuesto"(id,"organizationId","presupuestoId","servicioId",descripcion,fase,cantidad,"valorUnitario",posicion) values
         ('qaplit1${SUF}','${org}','${presupuestoId}','${serv("A")}','QA Plan A ${SUF}',1,1,90000,0),
         ('qaplit2${SUF}','${org}','${presupuestoId}','${serv("B")}','QA Plan B ${SUF}',1,1,90000,1),
         ('qaplit3${SUF}','${org}','${presupuestoId}','${serv("C")}','QA Plan C ${SUF}',2,1,90000,2);`);
  rec = await browser.newContext({ storageState: await sesionQa(browser, "recepcion", baseURL!), baseURL: baseURL! });
  recPage = await rec.newPage();
});

test.afterAll(async () => {
  await rec?.close();
  try {
    sql(`delete from "Anticipo" where "pacienteId"='${pacienteId}';
         delete from "Evento" where "pacienteId"='${pacienteId}';
         delete from "OrdenItem" where "ordenId" in (select id from "Orden" where "pacienteId"='${pacienteId}');
         delete from "Orden" where "pacienteId"='${pacienteId}';
         delete from "PlanTratamiento" where "pacienteId"='${pacienteId}';
         delete from "Presupuesto" where id='${presupuestoId}';
         delete from "Servicio" where id in ('${serv("A")}','${serv("B")}','${serv("C")}');
         delete from "PacienteTenant" where id='${pacienteId}';
         delete from "Persona" where "numeroDocumento"='${DOC}';`);
    sql(TIPO("radex-demo", "CENTRO_RADIOLOGICO") + TIPO("radex-2-demo", "CENTRO_RADIOLOGICO"));
  } catch { /* sin docker: restaurar a mano el tipo de radex-demo y radex-2-demo */ }
});

const estados = () => sql(`select estado from "PlanItem" where "planId"='${planId}' order by posicion`).split("\n");

/** Abre /ordenes/nueva con el plan, marca los ítems pedidos (por posición) y crea la orden; devuelve la página para ver el resultado. */
async function pedirOrden(page: Page, posiciones: number[]) {
  await page.goto(`/ordenes/nueva?paciente=${pacienteId}&plan=${planId}`);
  const marcas = page.locator('button[id^="p-"]');
  await expect(marcas.first()).toBeVisible();
  for (const n of posiciones) await marcas.nth(n).click();
}

test("desde una cotización aceptada se crea el plan con los precios congelados", async () => {
  const page = recPage;
  await page.goto(`/presupuestos/${presupuestoId}`);
  await page.getByRole("button", { name: "Crear plan de tratamiento" }).click();
  await page.waitForURL(/\/planes\/(?!nuevo)[^/?]+$/);
  planId = page.url().split("/").pop()!;
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Rehabilitación QA");
  await expect(page.getByText("Total del plan")).toBeVisible();
  await expect(page.getByTestId("plan-saldo")).toContainText("270.000");
  await expect(page.getByTestId("plan-avance")).toContainText("0 %");
  await expect(page.getByTestId("plan-item")).toHaveCount(3);
  expect(sql(`select total from "PlanTratamiento" where id='${planId}'`)).toBe("270000");
  // Con plan, la cotización ya no se convierte en orden completa (se evitaría cobrar dos veces).
  await page.goto(`/presupuestos/${presupuestoId}`);
  await expect(page.getByRole("button", { name: "Convertir en orden" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /ver plan de tratamiento/ })).toBeVisible();
  // Un segundo plan de la misma cotización no se crea.
  expect(sql(`select count(*) from "PlanTratamiento" where "presupuestoId"='${presupuestoId}'`)).toBe("1");
});

test("anticipo del plan: queda como anticipo disponible del paciente", async () => {
  const page = recPage;
  await page.goto(`/planes/${planId}`);
  await page.getByLabel("Monto del anticipo (COP)").fill("50000");
  await page.getByRole("button", { name: "Registrar anticipo" }).click();
  await expect(page.getByTestId("plan-anticipo")).toContainText("50.000");
  expect(sql(`select valor||'/'||estado||'/'||medio from "Anticipo" where "planId"='${planId}'`)).toBe("50000/DISPONIBLE/EFECTIVO");
});

test("orden por cita con 2 de 3 ítems: precio congelado y ítems en orden", async () => {
  const page = recPage;
  await page.goto(`/planes/${planId}`);
  await page.getByRole("link", { name: "Crear orden con ítems pendientes" }).click();
  await page.waitForURL(/\/ordenes\/nueva/);
  const marcas = page.locator('button[id^="p-"]');
  await expect(marcas).toHaveCount(3);
  await marcas.nth(0).click();
  await marcas.nth(1).click();
  await expect(page.getByText("Precio del plan").first()).toBeVisible();
  await page.getByRole("button", { name: "Crear orden" }).click();
  await page.waitForURL(/\/ordenes\/(?!nueva)[^/?]+$/);
  // 2 × 90.000 (precio del plan), no 2 × 100.000 del catálogo.
  expect(sql(`select sum(precio) from "OrdenItem" where "ordenId"='${page.url().split("/").pop()}'`)).toBe("180000");
  expect(estados()).toEqual(["EN_ORDEN", "EN_ORDEN", "PENDIENTE"]);
  await page.goto(`/planes/${planId}`);
  await expect(page.getByTestId("plan-avance")).toContainText("0 %");
});

test("atender la orden: saldo baja y el avance es 67 %", async () => {
  const page = recPage;
  const ordenId = sql(`select "ordenId" from "OrdenItem" where "planItemId" in (select id from "PlanItem" where "planId"='${planId}') limit 1`);
  await page.goto(`/ordenes/${ordenId}`);
  await page.getByRole("button", { name: /Marcar como agendada/ }).click();
  await expect(page.getByRole("button", { name: /Marcar como tomada/ })).toBeVisible();
  expect(estados()).toEqual(["EN_ORDEN", "EN_ORDEN", "PENDIENTE"]); // agendar no realiza
  await page.getByRole("button", { name: /Marcar como tomada/ }).click();
  await expect(page.getByRole("button", { name: /Marcar como informada/ })).toBeVisible();
  expect(estados()).toEqual(["REALIZADO", "REALIZADO", "PENDIENTE"]);
  await page.goto(`/planes/${planId}`);
  await expect(page.getByTestId("plan-avance")).toContainText("67 %");
  await expect(page.getByTestId("plan-saldo")).toContainText("90.000");
});

test("cancelar la orden devuelve el ítem a pendiente", async () => {
  const page = recPage;
  await pedirOrden(page, [0]);
  await page.getByRole("button", { name: "Crear orden" }).click();
  await page.waitForURL(/\/ordenes\/(?!nueva)[^/?]+$/);
  expect(estados()).toEqual(["REALIZADO", "REALIZADO", "EN_ORDEN"]);
  await page.getByRole("button", { name: "Cancelar orden" }).first().click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar orden" }).click();
  await expect(page.getByText("Cancelada").first()).toBeVisible();
  await expect.poll(estados).toEqual(["REALIZADO", "REALIZADO", "PENDIENTE"]);
});

test("un ítem no puede estar en dos órdenes: el segundo reclamo falla", async () => {
  const a = recPage, b = await rec.newPage();
  await pedirOrden(a, [0]);
  await pedirOrden(b, [0]); // las dos pantallas ven el ítem como pendiente
  await a.getByRole("button", { name: "Crear orden" }).click();
  await a.waitForURL(/\/ordenes\/(?!nueva)[^/?]+$/);
  await b.getByRole("button", { name: "Crear orden" }).click();
  await expect(b.getByText(/ya no está disponible/)).toBeVisible();
  await expect(b).toHaveURL(/\/ordenes\/nueva/);
  expect(sql(`select count(*) from "OrdenItem" oi join "Orden" o on o.id=oi."ordenId" where oi."planItemId" in (select id from "PlanItem" where "planId"='${planId}') and o.estado<>'CANCELADA'`)).toBe("3");
  await b.close();
  // Al atender la última orden el plan se completa.
  const ordenId = a.url().split("/").pop()!;
  await a.getByRole("button", { name: /Marcar como agendada/ }).click();
  await expect(a.getByRole("button", { name: /Marcar como tomada/ })).toBeVisible();
  await a.getByRole("button", { name: /Marcar como tomada/ }).click();
  await expect(a.getByRole("button", { name: /Marcar como informada/ })).toBeVisible();
  expect(ordenId).toBeTruthy();
  await a.goto(`/planes/${planId}`);
  await expect(a.getByTestId("plan-avance")).toContainText("100 %");
  await expect(a.getByTestId("plan-saldo")).toContainText("0");
  await expect(a.getByText("Completado").first()).toBeVisible();
  expect(sql(`select estado from "PlanTratamiento" where id='${planId}'`)).toBe("COMPLETADO");
  await a.goto("/planes");
  await expect(a.getByRole("row").filter({ hasText: NOMBRE.toLowerCase() })).toContainText("100 %");
});

test("plan manual desde la ficha del paciente", async () => {
  const page = recPage;
  await page.goto(`/pacientes/${pacienteId}`);
  await page.getByRole("link", { name: "Plan de tratamiento" }).click();
  await page.waitForURL(/\/planes\/nuevo/);
  await page.locator("#plan-serv-0").selectOption(serv("A"));
  await page.locator("#plan-cant-0").fill("2");
  await expect(page.getByText(/Total .*200\.000/)).toBeVisible();
  await page.getByRole("button", { name: "Crear plan" }).click();
  await page.waitForURL(/\/planes\/(?!nuevo)[^/?]+$/);
  await expect(page.getByTestId("plan-saldo")).toContainText("200.000");
  await expect(page.getByTestId("plan-item")).toHaveCount(2);
});

test("a11y y móvil: sin violaciones serias y sin desborde horizontal", async ({ browser, baseURL }) => {
  const movil = await browser.newContext({ storageState: await sesionQa(browser, "recepcion", baseURL!), baseURL: baseURL!, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await movil.newPage();
  await page.goto(`/planes/${planId}`);
  await expect(page.getByRole("progressbar", { name: "Avance del plan" })).toHaveAttribute("aria-valuenow", "100");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  await page.goto("/planes");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await movil.close();
});

test("aislamiento: otro centro no ve el plan (404) ni lo lista", async ({ browser, baseURL }) => {
  const otro = await browser.newContext({ storageState: authFile("admin2"), baseURL: baseURL! });
  const page = await otro.newPage();
  expect((await page.goto(`/planes/${planId}`))?.status()).toBe(404);
  await page.goto("/planes");
  await expect(page.getByText(NOMBRE, { exact: false })).toHaveCount(0);
  await otro.close();
});

test("un centro radiológico no tiene el módulo: ni menú ni rutas", async () => {
  sql(TIPO("radex-demo", "CENTRO_RADIOLOGICO"));
  const page = recPage;
  await page.goto("/inicio");
  await expect(page.getByRole("link", { name: "Planes de tratamiento" })).toHaveCount(0);
  expect((await page.goto("/planes"))?.status()).toBe(404);
  expect((await page.goto(`/planes/${planId}`))?.status()).toBe(404);
  expect((await page.goto(`/planes/nuevo?paciente=${pacienteId}`))?.status()).toBe(404);
  sql(TIPO("radex-demo", "CENTRO_ODONTOLOGICO"));
  await page.goto("/inicio");
  await expect(page.getByRole("link", { name: "Planes de tratamiento" })).toBeVisible();
});
