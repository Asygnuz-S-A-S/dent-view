import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { authFile } from "./helpers";

// Datos propios: doctores ficticios con órdenes en fechas pasadas, insertados por SQL (como el resto de specs del stack local).
const ORG = "4c39bb28-e7f6-4f62-928d-f70339b8aabd"; // radex-demo
const RUN = Date.now().toString(36);
const FRIO = { id: `qa-docf-${RUN}`, nombre: `QA Doctor Frio ${RUN}` };
const NUEVO = { id: `qa-docn-${RUN}`, nombre: `QA Doctor Nuevo ${RUN}` };

const sql = (q: string) => execFileSync("docker", ["exec", "-i", "dent-view-postgres-1", "psql", "-U", "dentview", "-d", "dentview", "-tA"], { input: q }).toString().trim();

function crearDoctor(d: { id: string; nombre: string }) {
  sql(`INSERT INTO "User"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES ('${d.id}','${d.nombre}','${d.id}@example.test',true,now(),now());
       INSERT INTO "Member"(id,"organizationId","userId",role,"createdAt") VALUES ('m-${d.id}','${ORG}','${d.id}','doctor_remitente',now() - interval '200 days');`);
}
/** Una orden por cada "hace N días" (consecutivo alto para no chocar con otras corridas). */
function crearOrdenes(doctorId: string, haceDias: number[], paciente: string, facturaTotal?: number, desde = 0) {
  haceDias.forEach((n, j) => {
    const i = j + desde;
    const id = `qa-ord-${doctorId}-${i}`;
    sql(`INSERT INTO "Orden"(id,"organizationId",numero,"pacienteId","doctorRemitenteId",estado,"creadoEn","actualizadoEn")
         SELECT '${id}','${ORG}',COALESCE(MAX(numero),0)+1,'${paciente}','${doctorId}','TOMADA',now() - interval '${n} days',now() FROM "Orden" WHERE "organizationId"='${ORG}';`);
    if (facturaTotal && i === 0)
      sql(`INSERT INTO "Factura"(id,"organizationId",numero,"ordenId",total,fecha) SELECT 'qa-fac-${doctorId}','${ORG}',COALESCE(MAX(numero),0)+1,'${id}',${facturaTotal},now() - interval '${n} days' FROM "Factura" WHERE "organizationId"='${ORG}';`);
  });
}
const limpiar = () => sql(`
  DELETE FROM "Factura" WHERE id LIKE 'qa-fac-qa-doc_-${RUN}';
  DELETE FROM "Orden" WHERE id LIKE 'qa-ord-qa-doc_-${RUN}%';
  DELETE FROM "SeguimientoDoctor" WHERE "doctorId" IN ('${FRIO.id}','${NUEVO.id}');
  DELETE FROM "Member" WHERE "userId" IN ('${FRIO.id}','${NUEVO.id}');
  DELETE FROM "User" WHERE id IN ('${FRIO.id}','${NUEVO.id}');`);

test.describe.serial("seguimiento de doctores", () => {
  let paciente = "", nombrePaciente = "";
  test.beforeAll(() => {
    [paciente, nombrePaciente] = sql(`SELECT id||'|'||nombre FROM "PacienteTenant" WHERE "organizationId"='${ORG}' LIMIT 1;`).split("|");
    crearDoctor(FRIO); crearDoctor(NUEVO);
    // Remitía cada 15 días y lleva 40 sin enviar: en riesgo (umbral 2 × 15 = 30 días, aún no inactivo).
    crearOrdenes(FRIO.id, [40, 55, 70, 85, 100, 115], paciente, 500000);
    crearOrdenes(NUEVO.id, [3], paciente);
  });
  test.afterAll(() => limpiar());

  test.describe("admin", () => {
    test.use({ storageState: authFile("admin") });

    test("la lista muestra KPIs y el semáforo: en riesgo y nuevo", async ({ page }) => {
      await page.goto(`/seguimiento-doctores?q=${encodeURIComponent(`QA Doctor`)}`);
      await expect(page.getByRole("heading", { level: 1, name: "Seguimiento de doctores" })).toBeVisible();
      for (const k of ["Activos", "En riesgo", "Inactivos", "Ingresos en riesgo"]) await expect(page.getByText(k, { exact: true }).first()).toBeVisible();
      const frio = page.getByRole("row", { name: new RegExp(FRIO.nombre) });
      await expect(frio.getByText("En riesgo", { exact: true })).toBeVisible();
      await expect(frio).toContainText(/500\.000/);
      await expect(page.getByRole("row", { name: new RegExp(NUEVO.nombre) }).getByText("Nuevo", { exact: true })).toBeVisible();
      // Filtro por URL.
      await page.goto(`/seguimiento-doctores?estado=EN_RIESGO&q=${RUN}`);
      await expect(page.getByRole("row", { name: new RegExp(FRIO.nombre) })).toBeVisible();
      await expect(page.getByRole("row", { name: new RegExp(NUEVO.nombre) })).toHaveCount(0);
      if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/seguimiento-doctores-lista.png`, fullPage: true });
    });

    test("crear seguimiento desde la lista y generar en riesgo es idempotente", async ({ page }) => {
      await page.goto(`/seguimiento-doctores?q=${RUN}`);
      await page.getByRole("button", { name: `Crear seguimiento: ${FRIO.nombre}` }).click();
      await page.getByLabel(/^Nota/).fill("Llamar para retomar remisiones");
      await page.getByRole("button", { name: "Guardar" }).click();
      await expect(page.getByText("Seguimiento creado")).toBeVisible();
      await expect(page.getByRole("row", { name: new RegExp(FRIO.nombre) }).getByText("Pendiente", { exact: true })).toBeVisible();
      for (let i = 0; i < 2; i++) {
        await page.getByRole("button", { name: /Generar seguimientos de doctores en riesgo/ }).click();
        await expect(page.getByText(/seguimiento\(s\) creados|No hay doctores nuevos/).last()).toBeVisible();
        await page.reload(); // los avisos tapan el botón
      }
      expect(sql(`SELECT count(*) FROM "SeguimientoDoctor" WHERE "doctorId"='${FRIO.id}' AND estado IN ('PENDIENTE','CONTACTADO','PROGRAMADO');`)).toBe("1");
    });

    test("ficha: registra contacto, pasa a Contactado, deja auditoría y no muestra pacientes", async ({ page }) => {
      await page.goto(`/seguimiento-doctores/${FRIO.id}`);
      await expect(page.getByRole("heading", { level: 1, name: FRIO.nombre })).toBeVisible();
      await expect(page.getByText("Remisiones por mes")).toBeVisible();
      await expect(page.getByText("Convenio y descuentos")).toBeVisible();
      await page.getByRole("button", { name: "Registrar contacto" }).click();
      await page.getByLabel("Resultado").fill("Contestó, retoma remisiones");
      await page.getByLabel(/^Nota/).fill("Visita acordada");
      await page.getByRole("button", { name: "Guardar" }).click();
      await expect(page.getByText("Contacto registrado")).toBeVisible();
      await expect(page.getByRole("cell", { name: "Contestó, retoma remisiones" })).toBeVisible();
      await expect(page.getByTestId("seguimiento-abierto")).toContainText("Contactado");
      expect(sql(`SELECT count(*) FROM "Evento" WHERE "organizationId"='${ORG}' AND tipo='seguimiento_doctor.contacto' AND detalle->>'doctorId'='${FRIO.id}';`)).toBe("1");
      await expect(page.locator("body")).not.toContainText(nombrePaciente);
      if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/seguimiento-doctores-ficha.png`, fullPage: true });
    });

    test("al volver a remitir el seguimiento queda RECUPERADO", async ({ page }) => {
      crearOrdenes(FRIO.id, [0], paciente, undefined, 9);
      await page.goto(`/seguimiento-doctores/${FRIO.id}`);
      await expect(page.getByText(/Cerrados: Recuperado/)).toBeVisible();
      await expect(page.getByTestId("seguimiento-abierto")).toHaveCount(0);
      expect(sql(`SELECT estado FROM "SeguimientoDoctor" WHERE "doctorId"='${FRIO.id}';`)).toBe("RECUPERADO");
    });
  });

  test.describe("doctor remitente", () => {
    test.use({ storageState: authFile("doctor") });
    test("no ve la sección (404)", async ({ page }) => {
      const r = await page.goto("/seguimiento-doctores");
      expect(r?.status()).toBe(404);
      expect((await page.goto(`/seguimiento-doctores/${FRIO.id}`))?.status()).toBe(404);
    });
  });
});
