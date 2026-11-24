import { createHash, randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { authFile } from "./helpers";
import { sesionQa, sql } from "./qa-usuarios";

// QA de gestión diaria: carrera de citas por API, anticipos, anulación de pagos y permisos clínicos de recepción.
test.use({ storageState: authFile("admin") });
test.describe.configure({ mode: "serial" });

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080";
const SUFIJO = String(Date.now()).slice(-7);

test.describe("carrera de citas por API v1", () => {
  const token = `dvk_${randomBytes(6).toString("base64url").slice(0, 8)}_${randomBytes(32).toString("base64url")}`;
  let org = "";
  let sala = "";
  let pacientes: string[] = [];

  test.beforeAll(() => {
    org = sql(`select id from "Organization" where slug='radex-demo';`);
    sala = sql(`select id from "Sala" where "organizationId"='${org}' and activa order by nombre limit 1;`);
    pacientes = sql(`select id from "PacienteTenant" where "organizationId"='${org}' order by id limit 2;`).split("\n");
    const hash = createHash("sha256").update(token).digest("hex");
    sql(`insert into "TokenApi"(id,"organizationId",nombre,prefijo,"tokenHash",permisos) values ('qa-race-${SUFIJO}','${org}','QA carrera ${SUFIJO}','${token.slice(0, 12)}','${hash}',array['citas:escribir','citas:leer']);`);
  });
  test.afterAll(() => {
    sql(`delete from "Cita" where notas like 'QA carrera ${SUFIJO}%'; delete from "TokenApi" where id='qa-race-${SUFIJO}';`);
  });

  test("dos POST /api/v1/citas simultáneos al mismo hueco: una gana y la otra recibe 409 claro", async ({ playwright }) => {
    const api = await playwright.request.newContext({ baseURL: BASE, storageState: undefined });
    // Hueco lejano y distinto por corrida (07:00-19:00 Bogotá = 12:00-24:00 UTC).
    const dia = new Date(Date.now() + (400 + (Number(SUFIJO) % 300)) * 86_400_000).toISOString().slice(0, 10);
    const cuerpo = (i: number) => ({ salaId: sala, pacienteId: pacientes[i], inicio: `${dia}T10:00:00-05:00`, duracion: 30, notas: `QA carrera ${SUFIJO} ${i}` });
    const h = { Authorization: `Bearer ${token}` };
    const [a, b] = await Promise.all([0, 1].map((i) => api.post("/api/v1/citas", { headers: h, data: cuerpo(i) })));
    const estados = [a!.status(), b!.status()].sort();
    expect(estados, `${await a!.text()} | ${await b!.text()}`).toEqual([201, 409]);
    const perdedora = a!.status() === 409 ? a! : b!;
    const err = await perdedora.json();
    expect(JSON.stringify(err)).toContain("Ya hay una cita en esa sala a esa hora");
    expect(Number(sql(`select count(*) from "Cita" where "salaId"='${sala}' and notas like 'QA carrera ${SUFIJO}%';`))).toBe(1);
    await api.dispose();
  });
});

const dinero = (t: string | null) => Number((t ?? "").replace(/[^\d-]/g, ""));
/** Valor numérico de una tarjeta de resumen de Cartera. */
async function kpi(page: Page, titulo: string) {
  const t = page.locator("section[aria-label='Resumen de cartera'] > div").filter({ hasText: titulo }).first().locator("p").first();
  return dinero(await t.textContent());
}
const aviso = (page: Page, texto: string) => page.locator("[data-sonner-toast]").filter({ hasText: texto }).first();

test.describe("anticipos, anulación de pagos y cartera", () => {
  const nota = `QA21 ${SUFIJO}`;
  let org = "";
  let paciente = "";
  let facAnticipo = "";
  let facPago = "";

  /** Cuenta abierta ficticia del paciente con un ítem; devuelve su id. */
  const crearCuenta = (total: number, sufijo: string) => {
    const id = `qa21-f${sufijo}-${SUFIJO}`;
    sql(`insert into "Factura"(id,"organizationId",numero,"pacienteId",total,notas) values ('${id}','${org}',(select coalesce(max(numero),0)+1 from "Factura" where "organizationId"='${org}'),'${paciente}',${total},'${nota}');
      insert into "FacturaItem"(id,"facturaId",descripcion,cantidad,"valorUnitario") values ('${id}-i','${id}','Servicio ficticio',1,${total});`);
    return id;
  };

  test.beforeAll(() => {
    org = sql(`select id from "Organization" where slug='radex-demo';`);
    paciente = sql(`select id from "PacienteTenant" where "organizationId"='${org}' and nombre='Ana Torres' limit 1;`);
    facAnticipo = crearCuenta(100_000, "a");
    facPago = crearCuenta(80_000, "p");
    // Anticipo cobrado por pasarela para una cita (LinkPago con citaId), sin aplicar a ninguna cuenta.
    const sala = sql(`select id from "Sala" where "organizationId"='${org}' and activa order by nombre limit 1;`);
    const pasarela = sql(`select id from "PasarelaPago" where "organizationId"='${org}' and activa limit 1;`);
    sql(`insert into "Cita"(id,"organizationId","salaId","pacienteId",inicio,fin,notas) values ('qa21-c-${SUFIJO}','${org}','${sala}','${paciente}','2033-05-05T15:00:00Z','2033-05-05T15:30:00Z','${nota}');
      insert into "LinkPago"(id,"organizationId","pasarelaId","citaId",referencia,monto,estado) values ('qa21-l-${SUFIJO}','${org}','${pasarela}','qa21-c-${SUFIJO}','qa21ref${SUFIJO}',40000,'APROBADO');
      insert into "Anticipo"(id,"organizationId",estado,"pacienteId","citaId","linkPagoId",valor,medio) values ('qa21-a-${SUFIJO}','${org}','DISPONIBLE','${paciente}','qa21-c-${SUFIJO}','qa21-l-${SUFIJO}',40000,'PASARELA');`);
  });
  test.afterAll(() => {
    sql(`delete from "Pago" where "facturaId" in (select id from "Factura" where notas='${nota}');
      delete from "Anticipo" where id='qa21-a-${SUFIJO}'; delete from "LinkPago" where id='qa21-l-${SUFIJO}'; delete from "Cita" where id='qa21-c-${SUFIJO}';
      delete from "FacturaItem" where "facturaId" in (select id from "Factura" where notas='${nota}');
      delete from "NotaCredito" where "facturaId" in (select id from "Factura" where notas='${nota}');
      delete from "Factura" where notas='${nota}';`);
  });

  test("aplicar un anticipo desde la UI: baja el saldo a favor de Cartera y el pago aplicado cuenta", async ({ page }) => {
    await page.goto("/cartera");
    const favorAntes = await kpi(page, "Saldo a favor");
    const carteraAntes = await kpi(page, "Cartera total");
    expect(favorAntes).toBeGreaterThanOrEqual(40_000);

    await page.goto(`/facturacion/${facAnticipo}`);
    await expect(page.getByText("Anticipos disponibles", { exact: true })).toBeVisible();
    await expect(page.getByText(/disponible \$\s?40\.000/)).toBeVisible();
    await page.getByRole("button", { name: "Aplicar anticipo" }).click();
    await expect(aviso(page, "Anticipo aplicado")).toBeVisible();
    // La cuenta queda con el pago de medio "Anticipo" y saldo 60.000; ya no ofrece el anticipo.
    await expect(page.getByRole("row", { name: /Anticipo/ }).first()).toContainText("$ 40.000".replace(" ", "\u00a0"));
    await expect(page.getByRole("row", { name: /^Saldo/ })).toContainText("60.000");
    await expect(page.getByText("Anticipos disponibles", { exact: true })).toHaveCount(0);
    expect(sql(`select estado::text||"valorAplicado"::text from "Anticipo" where id='qa21-a-${SUFIJO}';`)).toBe("APLICADO40000");

    await page.goto("/cartera");
    expect(await kpi(page, "Cartera total")).toBe(carteraAntes - 40_000);
    const favorDespues = await page.locator("section[aria-label='Resumen de cartera']").getByText("Saldo a favor").count() ? await kpi(page, "Saldo a favor") : 0;
    expect(favorDespues).toBe(favorAntes - 40_000);
  });

  test("anular un pago con motivo: el admin sí (reabre y vuelve a sumar a Cartera), recepción no ve el botón", async ({ page, browser }) => {
    await page.goto(`/facturacion/${facPago}`);
    await page.getByRole("button", { name: "Registrar abono" }).click();
    await page.getByRole("button", { name: "Registrar", exact: true }).click();
    await expect(aviso(page, "Abono registrado")).toBeVisible();
    await expect(page.getByText("Pagada").first()).toBeVisible();

    // Recepción: ve la cuenta pero no puede anular pagos (solo admin).
    const rec = await browser.newContext({ storageState: await sesionQa(browser, "recepcion", BASE), baseURL: BASE });
    const pr = await rec.newPage();
    await pr.goto(`/facturacion/${facPago}`);
    await expect(pr.getByRole("heading", { level: 1 })).toContainText("Cuenta de cobro");
    await expect(pr.getByRole("button", { name: "Anular", exact: true })).toHaveCount(0);
    await expect(pr.getByRole("button", { name: "Nota crédito" })).toHaveCount(0);
    await rec.close();

    await page.goto("/cartera");
    const antes = await kpi(page, "Cartera total");
    await page.goto(`/facturacion/${facPago}`);
    await page.getByRole("button", { name: "Anular", exact: true }).click();
    const dlg = page.getByRole("dialog", { name: "¿Anular el pago?" });
    await dlg.getByLabel("Motivo (obligatorio)").fill("abc");
    await expect(dlg.getByRole("button", { name: "Anular pago" })).toBeDisabled();
    await dlg.getByLabel("Motivo (obligatorio)").fill("Pago registrado por error");
    await dlg.getByRole("button", { name: "Anular pago" }).click();
    await expect(aviso(page, "Pago anulado")).toBeVisible();
    await expect(page.getByText("Pago registrado por error")).toBeVisible();
    await expect(page.getByRole("row", { name: /^Saldo/ })).toContainText("80.000");
    expect(sql(`select estado from "Factura" where id='${facPago}';`)).toBe("ABIERTA");
    expect(sql(`select count(*) from "Evento" where tipo='factura.pago_anulado' and detalle->>'facturaId'='${facPago}';`)).toBe("1");

    await page.goto("/cartera");
    expect(await kpi(page, "Cartera total")).toBe(antes + 80_000);
  });
});

test.describe("recepción en lo clínico del paciente", () => {
  test("ve odontograma, plan y notas en solo lectura: sin formularios ni botones de edición", async ({ browser }) => {
    const org = sql(`select id from "Organization" where slug='radex-demo';`);
    const paciente = sql(`select id from "PacienteTenant" where "organizationId"='${org}' and nombre='Ana Torres' limit 1;`);
    const ctx = await browser.newContext({ storageState: await sesionQa(browser, "recepcion", BASE), baseURL: BASE });
    const page = await ctx.newPage();
    await page.goto(`/pacientes/${paciente}`);
    await page.getByRole("tab", { name: /Módulo clínico/ }).click();
    await expect(page.getByRole("radiogroup", { name: "Condición a aplicar" })).toHaveCount(0);
    await expect(page.getByText("Numeración FDI. Solo lectura.")).toBeVisible();
    await page.getByRole("tab", { name: /Plan de tratamiento/ }).click();
    await expect(page.getByLabel("Descripción")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Agregar", exact: true })).toHaveCount(0);
    await page.getByRole("tab", { name: /Notas clínicas/ }).click();
    await expect(page.getByLabel("Nueva nota clínica")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Agregar nota" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Corregir" })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible(); // la ficha sigue en pie (no 404)
    await ctx.close();
  });

  test("el especialista sí puede escribir notas y corregirlas (la original no cambia)", async ({ browser }) => {
    const org = sql(`select id from "Organization" where slug='radex-demo';`);
    const paciente = sql(`select id from "PacienteTenant" where "organizationId"='${org}' and nombre='Ana Torres' limit 1;`);
    const ctx = await browser.newContext({ storageState: await sesionQa(browser, "especialista", BASE), baseURL: BASE });
    const page = await ctx.newPage();
    const texto = `QA21 nota ${SUFIJO}`;
    try {
      await page.goto(`/pacientes/${paciente}`);
      await page.getByRole("tab", { name: /Módulo clínico/ }).click();
      await page.getByRole("tab", { name: /Notas clínicas/ }).click();
      await page.getByLabel("Nueva nota clínica").fill(texto);
      await page.getByRole("button", { name: "Agregar nota" }).click();
      await expect(aviso(page, "Nota agregada")).toBeVisible();
      const original = page.getByRole("listitem").filter({ hasText: texto }).first();
      await original.getByRole("button", { name: "Corregir" }).click();
      await page.getByLabel("Texto de la corrección").fill("Corregida");
      await page.getByRole("button", { name: "Guardar corrección" }).click();
      await expect(aviso(page, "Corrección agregada como nota nueva")).toBeVisible();
      expect(sql(`select count(*) from "NotaClinica" where "pacienteId"='${paciente}' and texto='${texto}';`)).toBe("1");
      expect(Number(sql(`select count(*) from "NotaClinica" where "pacienteId"='${paciente}' and texto like '[Corrige la nota del %] Corregida';`))).toBeGreaterThanOrEqual(1);
    } finally {
      sql(`delete from "NotaClinica" where "pacienteId"='${paciente}' and (texto='${texto}' or texto like '[Corrige la nota del %] Corregida');`);
      await ctx.close();
    }
  });
});

test.describe("búsquedas", () => {
  test("sin tildes, con comodines y con números enormes no se rompe ni devuelve todo", async ({ page }) => {
    await page.goto("/pacientes?q=gomez");
    await expect(page.getByText(/^\d+ pacientes?$/)).toBeVisible(); // "Gómez" aparece al buscar "gomez"
    await expect(page.getByRole("link", { name: /Ver ficha de .*Gómez/ }).first()).toBeVisible();
    await page.goto("/pacientes?q=%25");
    await expect(page.getByText("Sin resultados")).toBeVisible();
    for (const ruta of ["/facturacion", "/ordenes"]) {
      const r = await page.goto(`${ruta}?q=9999999999999`);
      expect(r?.status(), ruta).toBe(200);
      const r2 = await page.goto(`${ruta}?q=gomez`);
      expect(r2?.status(), ruta).toBe(200);
    }
  });
});
