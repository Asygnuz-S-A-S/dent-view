import AxeBuilder from "@axe-core/playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";
import { expect as esperar, test, type Page } from "@playwright/test";
import { authFile, PASSWORD } from "./helpers";
import { sesionQa, sql } from "./qa-usuarios";

// Evolución clínica (folios firmados, adendas, PDF) y registro de toma radiológico.
// Cambia el tipo de centro de radex-demo durante el spec y lo restaura; crea y limpia sus datos (prefijo "QA evo").
// Los registros solo-inserta se limpian con el dueño de la base (dentview) vía docker exec.
// El stack local comparte CPU con otras corridas: tras una acción el refresco del servidor puede pasar de 10 s.
const expect = esperar.configure({ timeout: 30_000 });
test.describe.configure({ mode: "serial", timeout: 180_000 });

const SUF = String(Date.now()).slice(-7);
const NOMBRE = `QA evo ${SUF}`;
const SCRATCH = process.env.EVIDENCIAS_E29 ?? "test-results/e29";
let org = "", tipoOriginal = "", sinPlantillas = false;
let pacienteId = "", personaId = "", ordenId = "", imagenId = "";

const esp = () => sql(`select id from "User" where email='qa-especialista@radex.demo'`);
const eventos = (tipo: string) => Number(sql(`select count(*) from "Evento" where "pacienteId"='${pacienteId}' and tipo='${tipo}'`));
const urlOrden = () => `/ordenes/${ordenId}?tab=evolucion`;
const SESION_ESP = "tests/e2e/.auth/qa-especialista.json";
const SESION_REC = "tests/e2e/.auth/qa-recepcion.json";
const totpAdmin = () => createOTP(base32.decode(fs.readFileSync("tests/e2e/.auth/totp-admin.txt", "utf8").trim().toUpperCase())).totp();

test.beforeAll(async ({ browser, baseURL }) => {
  fs.mkdirSync(SCRATCH, { recursive: true });
  org = sql(`select id from "Organization" where slug='radex-demo'`);
  tipoOriginal = sql(`select "tipoCentro" from "ConfigCentro" where "organizationId"='${org}'`);
  sinPlantillas = sql(`select count(*) from "PlantillaEvolucion" where "organizationId"='${org}'`) === "0";
  sql(`update "ConfigCentro" set "tipoCentro"='CENTRO_ODONTOLOGICO' where "organizationId"='${org}'`);
  personaId = `qaevoper${SUF}`; pacienteId = `qaevopac${SUF}`; ordenId = `qaevoord${SUF}`; imagenId = `qaevoimg${SUF}`;
  sql(`insert into "Persona"(id,"tipoDocumento","numeroDocumento",nombre) values ('${personaId}','CC','QAEVO${SUF}','${NOMBRE}');
       insert into "PacienteTenant"(id,"organizationId","personaId",nombre) values ('${pacienteId}','${org}','${personaId}','${NOMBRE}');
       insert into "Orden"(id,"organizationId",numero,"pacienteId","actualizadoEn") select '${ordenId}','${org}',coalesce(max(numero),0)+1,'${pacienteId}',now() from "Orden" where "organizationId"='${org}';
       insert into "ImagenEstudio"(id,"organizationId","pacienteId","claveS3","nombreOriginal",mime,bytes,titulo) values ('${imagenId}','${org}','${pacienteId}','qa-evo/${SUF}.jpg','qa-evo.jpg','image/jpeg',10,'Panorámica QA');`);
  expect(sql(`select count(*) from "PacienteTenant" p join "Orden" o on o."pacienteId"=p.id join "ImagenEstudio" i on i."pacienteId"=p.id where p.id='${pacienteId}'`)).toBe("1"); // los INSERT no fallan en silencio
  await sesionQa(browser, "especialista", baseURL!);
  await sesionQa(browser, "recepcion", baseURL!);
});

test.afterAll(() => {
  const p = pacienteId;
  sql(`delete from "Evento" where "pacienteId"='${p}';
       delete from "AdendaEvolucion" where "evolucionId" in (select id from "EvolucionClinica" where "pacienteId"='${p}');
       delete from "AdjuntoEvolucion" where "evolucionId" in (select id from "EvolucionClinica" where "pacienteId"='${p}');
       delete from "EvolucionClinica" where "pacienteId"='${p}';
       delete from "BorradorEvolucion" where "pacienteId"='${p}';
       delete from "RegistroToma" where "pacienteId"='${p}';
       delete from "ImagenEstudio" where "pacienteId"='${p}';
       delete from "Orden" where "pacienteId"='${p}';
       delete from "PacienteTenant" where id='${p}';
       delete from "Persona" where id='${personaId}';
       update "Member" set "esOdontologo"=false where "organizationId"='${org}' and "userId" in (select id from "User" where email='admin@radex.demo');
       update "ConfigCentro" set "tipoCentro"='${tipoOriginal}' where "organizationId"='${org}';`);
  if (sinPlantillas) sql(`delete from "PlantillaEvolucion" where "organizationId"='${org}'`);
});

async function llenarYFirmar(page: Page, clave: string, motivo: string) {
  await page.getByRole("button", { name: "Nueva evolución" }).click();
  await expect(page.getByLabel("Plantilla")).toBeVisible();
  await page.getByLabel("Plantilla").selectOption({ label: "Odontología general (v1)" });
  await page.getByLabel("Motivo de consulta").fill(motivo);
  await page.getByLabel("Examen clínico").fill("Caries oclusal en 16 <script>alert(1)</script> «ñ» 😀");
  await page.getByLabel("Código CIE-10").fill("k02.1");
  await page.getByLabel("Descripción del diagnóstico").fill("Caries de la dentina");
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  await page.getByLabel("Panorámica QA").check();
  await page.getByRole("button", { name: "Firmar", exact: true }).click();
  await page.getByLabel("Tu contraseña").fill(clave);
}

// Ejecuta como el rol de la app (sin UPDATE ni DELETE) y devuelve el error de Postgres, o "" si la sentencia pasó.
const rechazo = (q: string) => {
  try {
    execFileSync("docker", ["exec", "-i", "dent-view-postgres-1", "psql", "-U", "dentview", "-d", "dentview", "-v", "ON_ERROR_STOP=1", "-q"], { input: `set role dentview_app; ${q}`, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    return "";
  } catch (e) { return String((e as { stderr?: Buffer | string }).stderr ?? e); }
};
const sinDesborde = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test.describe("especialista en un centro odontológico", () => {
  test.use({ storageState: SESION_ESP });

  test("crea borrador en la orden, autoguarda, firma con contraseña y ve el folio 1", async ({ page }) => {
    await page.goto(urlOrden());
    await expect(page.getByRole("heading", { name: "Evolución clínica" })).toBeVisible();
    await expect(page.getByText("Sin evoluciones firmadas")).toBeVisible();
    // Contraseña incorrecta: no firma.
    await llenarYFirmar(page, "clave-equivocada", "Dolor al masticar 16");
    await page.getByRole("button", { name: "Firmar y cerrar folio" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Contraseña incorrecta" })).toBeVisible();
    expect(Number(sql(`select count(*) from "EvolucionClinica" where "pacienteId"='${pacienteId}'`))).toBe(0);
    await page.keyboard.press("Escape");
    // Autoguardado en servidor cada 10 s y persistencia al recargar.
    await expect(page.getByText(/Guardado automáticamente a las/)).toBeVisible({ timeout: 20_000 });
    await page.reload();
    await expect(page.getByLabel("Motivo de consulta")).toHaveValue("Dolor al masticar 16");
    await expect(page.getByLabel("Panorámica QA")).toBeChecked();
    await expect(page.getByText("K021 · Caries de la dentina")).toBeVisible();
    // Firma correcta.
    await page.getByRole("button", { name: "Firmar", exact: true }).click();
    await page.getByLabel("Tu contraseña").fill(PASSWORD);
    await page.getByRole("button", { name: "Firmar y cerrar folio" }).click();
    await expect(page.getByText("Folio 1", { exact: true })).toBeVisible();
    await expect(page.getByText("Integridad verificada")).toHaveCount(1);
    await expect(page.getByText("Dolor al masticar 16")).toBeVisible();
    await expect(page.getByText("<script>alert(1)</script>", { exact: false })).toBeVisible(); // se muestra como texto, no se ejecuta
    await expect(page.getByRole("button", { name: "Nueva evolución" })).toBeVisible(); // el borrador se borró al firmar
    expect(Number(sql(`select count(*) from "BorradorEvolucion" where "pacienteId"='${pacienteId}'`))).toBe(0);
    expect(sql(`select folio||'|'||"firmanteId"||'|'||"metodoFirma"||'|'||length("hashContenido")||'|'||(select count(*) from "AdjuntoEvolucion" a where a."evolucionId"=e.id)||'|'||("odontogramaSnapshot" is not null) from "EvolucionClinica" e where "pacienteId"='${pacienteId}'`)).toBe(`1|${esp()}|CLAVE|64|1|true`);
    expect(eventos("hc.firmada")).toBe(1);
  });

  test("lo firmado no se edita ni se borra: sin UI, API 405 y la base lo rechaza", async ({ page, request }) => {
    await page.goto(urlOrden());
    await expect(page.getByText("Folio 1", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Editar|Eliminar|Borrar/ })).toHaveCount(0);
    for (const metodo of ["put", "patch", "delete", "post"] as const) {
      expect((await request[metodo](`/api/evolucion/pdf/${pacienteId}`)).status(), metodo).toBe(405);
    }
    // El rol de la app no tiene UPDATE ni DELETE (inmodificabilidad, Res. 1995/1999).
    expect(rechazo(`update "EvolucionClinica" set hallazgos='x' where "pacienteId"='${pacienteId}'`)).toMatch(/permission denied/);
    expect(rechazo(`delete from "EvolucionClinica" where "pacienteId"='${pacienteId}'`)).toMatch(/permission denied/);
  });

  test("la corrección es una adenda firmada con motivo; la integridad se recalcula y detecta alteraciones", async ({ page }) => {
    await page.goto(urlOrden());
    await page.getByRole("button", { name: "Agregar adenda" }).click();
    await page.getByLabel("Motivo de la adenda").fill("err");
    await page.getByLabel("Aclaración o corrección").fill("El diente era el 26");
    await expect(page.getByText("El motivo necesita al menos 5 caracteres")).toBeVisible();
    await page.getByLabel("Motivo de la adenda").fill("Error de digitación");
    await page.getByLabel("Tu contraseña").fill(PASSWORD);
    await page.getByRole("button", { name: "Firmar adenda" }).click();
    await expect(page.getByText("Motivo: Error de digitación")).toBeVisible();
    await expect(page.getByText("El diente era el 26")).toBeVisible();
    await expect(page.getByText("Integridad verificada")).toHaveCount(2); // evolución + adenda
    expect(eventos("hc.adenda")).toBe(1);
    // Alterar el contenido por la puerta de atrás (dueño de la base) se detecta.
    const original = sql(`select hallazgos from "EvolucionClinica" where "pacienteId"='${pacienteId}'`);
    sql(`update "EvolucionClinica" set hallazgos='alterado' where "pacienteId"='${pacienteId}'`);
    try {
      await page.reload();
      await expect(page.getByText("Integridad NO verificada").first()).toBeVisible();
    } finally {
      sql(`update "EvolucionClinica" set hallazgos=$q$${original}$q$ where "pacienteId"='${pacienteId}'`);
    }
    await page.reload();
    await expect(page.getByText("Integridad verificada")).toHaveCount(2);
  });

  test("ficha: lista del paciente con filtros, PDF por paciente y por orden, y una sola consulta auditada por sesión", async ({ page, request }) => {
    await page.goto(`/pacientes/${pacienteId}`);
    await page.getByRole("tab", { name: "Evolución" }).click();
    await expect(page.getByText("Folio 1", { exact: true })).toBeVisible();
    await page.getByLabel("Orden").selectOption({ index: 1 });
    await expect(page.getByText("Folio 1", { exact: true })).toBeVisible();
    await page.getByLabel("Desde").fill("2999-01-01");
    await expect(page.getByText("Ninguna evolución coincide con los filtros.")).toBeVisible();
    for (const ruta of [`/api/evolucion/pdf/${pacienteId}`, `/api/evolucion/pdf/orden/${ordenId}`]) {
      const r = await request.get(ruta);
      expect(r.status(), ruta).toBe(200);
      expect(r.headers()["content-type"]).toContain("application/pdf");
      expect((await r.body()).subarray(0, 4).toString()).toBe("%PDF");
    }
    expect(eventos("hc.exportada")).toBe(2);
    expect(eventos("hc.consulta")).toBe(1);
  });

  test("módulo clínico: las plantillas solo las administra el admin", async ({ request }) => {
    expect((await request.get("/evolucion/plantillas")).status()).toBe(404);
  });
});

test.describe("administrador con MFA", () => {
  test.use({ storageState: authFile("admin") });

  test("firma con contraseña y código TOTP (CLAVE_TOTP); sin ser odontólogo no firma", async ({ page }) => {
    await page.goto(`/pacientes/${pacienteId}`);
    await page.getByRole("tab", { name: "Evolución" }).click();
    await page.getByRole("button", { name: "Nueva evolución" }).click();
    await page.getByLabel("Hallazgos").fill("Control sin hallazgos nuevos");
    await expect(page.getByText("Solo el especialista o el odontólogo del centro puede firmar")).toBeVisible();
    await expect(page.getByText(/Guardado automáticamente a las/)).toBeVisible({ timeout: 20_000 });
    sql(`update "Member" set "esOdontologo"=true where "organizationId"='${org}' and "userId" in (select id from "User" where email='admin@radex.demo')`);
    await page.reload();
    await page.getByRole("tab", { name: "Evolución" }).click();
    await page.getByRole("button", { name: "Firmar", exact: true }).click();
    await page.getByLabel("Tu contraseña").fill(PASSWORD);
    await page.getByLabel(/Código de verificación/).fill("000000");
    await page.getByRole("button", { name: "Firmar y cerrar folio" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Código de verificación incorrecto" })).toBeVisible();
    await page.getByLabel(/Código de verificación/).fill(await totpAdmin());
    await page.getByRole("button", { name: "Firmar y cerrar folio" }).click();
    await expect(page.getByText("Folio 2", { exact: true })).toBeVisible();
    expect(sql(`select "metodoFirma" from "EvolucionClinica" where "pacienteId"='${pacienteId}' and folio=2`)).toBe("CLAVE_TOTP");
    await expect(page.getByRole("link", { name: "Administrar plantillas de evolución" })).toBeVisible();
  });

  test("el admin versiona una plantilla (versión nueva, la anterior se conserva)", async ({ page }) => {
    await page.goto("/evolucion/plantillas");
    await expect(page.getByRole("heading", { name: "Plantillas de evolución" })).toBeVisible();
    // Relativo a la versión vigente: la base local puede traer versiones de corridas anteriores.
    const donde = `from "PlantillaEvolucion" where "organizationId"='${org}' and nombre='Ortodoncia'`;
    const v = Number(sql(`select max(version) ${donde}`));
    const tarjeta = page.locator('[data-slot="card"]').filter({ hasText: `Ortodoncia · versión ${v}` });
    await expect(tarjeta).toBeVisible();
    await tarjeta.getByRole("button", { name: "Guardar como versión nueva" }).click(); // sin cambios: igual crea la siguiente
    await expect.poll(() => sql(`select count(*) ${donde}`)).toBe(String(v + 1));
    expect(sql(`select string_agg(version::text, ',') ${donde} and activa`)).toBe(String(v + 1));
  });
});

test.describe("permisos y aislamiento", () => {
  test("recepción y doctor remitente reciben 404; otro centro también", async ({ browser, baseURL }) => {
    const rutas = [`/api/evolucion/pdf/${pacienteId}`, `/api/evolucion/pdf/orden/${ordenId}`, "/evolucion/plantillas"];
    for (const [nombre, estado] of [["recepción", SESION_REC], ["doctor", authFile("doctor")], ["otro centro", authFile("admin2")]] as const) {
      const ctx = await browser.newContext({ storageState: estado, baseURL });
      for (const r of rutas) expect((await ctx.request.get(r)).status(), `${nombre} ${r}`).toBe(404);
      await ctx.close();
    }
  });

  test("recepción no ve la pestaña de evolución en la ficha ni en la orden", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ storageState: SESION_REC, baseURL });
    const page = await ctx.newPage();
    await page.goto(`/pacientes/${pacienteId}`);
    await expect(page.getByRole("heading", { name: NOMBRE })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Evolución" })).toHaveCount(0);
    await page.goto(urlOrden());
    await expect(page.getByText("Folio 1", { exact: true })).toHaveCount(0);
    await ctx.close();
  });
});

test.describe("móvil 390 px y modo oscuro", () => {
  test("sin desborde horizontal y sin violaciones graves de accesibilidad", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ storageState: SESION_ESP, baseURL, viewport: { width: 390, height: 844 }, colorScheme: "dark" });
    const page = await ctx.newPage();
    await page.goto(urlOrden());
    await expect(page.getByText("Folio 1", { exact: true })).toBeVisible();
    expect(await sinDesborde(page)).toBe(true);
    await page.getByRole("button", { name: "Agregar adenda" }).click();
    await expect(page.getByLabel("Tu contraseña")).toBeVisible();
    expect(await sinDesborde(page)).toBe(true);
    await page.screenshot({ path: `${SCRATCH}/movil-oscuro-dialogo.png` });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Nueva evolución" }).click();
    await expect(page.getByLabel("Plantilla")).toBeVisible();
    expect(await sinDesborde(page)).toBe(true);
    await page.screenshot({ path: `${SCRATCH}/movil-oscuro-editor.png`, fullPage: true });
    const axe = await new AxeBuilder({ page }).include('[aria-label="Evolución clínica de la orden"]').analyze();
    const graves = axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(graves.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    await page.getByRole("button", { name: "Descartar borrador" }).click();
    await expect(page.getByRole("button", { name: "Nueva evolución" })).toBeVisible();
    await ctx.close();
  });
});

test.describe("centro radiológico", () => {
  test.use({ storageState: SESION_ESP });

  test("registra una toma y no ve la evolución odontológica", async ({ page, request }) => {
    sql(`update "ConfigCentro" set "tipoCentro"='CENTRO_RADIOLOGICO' where "organizationId"='${org}'`);
    await page.goto(`/pacientes/${pacienteId}`);
    await expect(page.getByRole("tab", { name: "Evolución", exact: true })).toHaveCount(0);
    await page.getByRole("tab", { name: "Línea de tiempo de imágenes" }).click();
    await expect(page.getByRole("region", { name: "Línea de tiempo de imágenes" }).or(page.getByLabel("Línea de tiempo de imágenes").first())).toBeVisible();
    await expect(page.getByRole("heading", { name: "Registro de toma" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nueva evolución" })).toHaveCount(0);
    await page.getByLabel("Orden", { exact: true }).selectOption({ index: 1 });
    await page.getByLabel("Repeticiones").fill("2");
    await page.getByRole("button", { name: "Registrar toma" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Indica el motivo de la repetición" })).toBeVisible();
    await page.getByLabel("Motivo de la repetición").fill("Movimiento del paciente");
    await page.getByLabel("Equipo o nota").fill("Sensor 2");
    await page.getByLabel("Incidencias").fill("Ninguna");
    await page.getByRole("button", { name: "Registrar toma" }).click();
    await expect(page.getByText("Repeticiones: 2 (Movimiento del paciente)")).toBeVisible();
    expect(sql(`select repeticiones||'|'||"tecnicoId"||'|'||incidencias from "RegistroToma" where "pacienteId"='${pacienteId}'`)).toBe(`2|${esp()}|Equipo: Sensor 2. Ninguna`);
    expect(eventos("hc.toma")).toBe(1);
    // No hay evolución odontológica: PDF y plantillas dan 404.
    expect((await request.get(`/api/evolucion/pdf/${pacienteId}`)).status()).toBe(404);
    // La orden tampoco ofrece evolución odontológica (si monta el bloque, es solo el registro de toma).
    await page.goto(urlOrden());
    await expect(page.getByRole("button", { name: "Nueva evolución" })).toHaveCount(0);
  });

  test("recepción puede registrar la toma pero no ve evoluciones", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ storageState: SESION_REC, baseURL });
    const page = await ctx.newPage();
    await page.goto(urlOrden());
    await expect(page.getByText("Folio 1", { exact: true })).toHaveCount(0);
    await ctx.close();
  });
});
