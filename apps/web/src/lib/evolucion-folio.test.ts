// Concurrencia real del folio: requiere la base (EVOLUCION_TEST_DATABASE_URL, rol de la app) y el dueño por `docker exec` para limpiar.
// Sin esa variable la prueba se omite. Ver docs: se expone Postgres con un socat temporal (alpine/socat) en 127.0.0.1:55432.
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@dent-view/db";
import { componerContenido, CAMPOS_ESTANDAR } from "./evolucion";
import { hashEvolucion } from "./evolucion-hash";

const url = process.env.EVOLUCION_TEST_DATABASE_URL;
const psql = (q: string) => execFileSync("docker", ["exec", "-i", "dent-view-postgres-1", "psql", "-U", "dentview", "-d", "dentview", "-At", "-q"], { input: q, encoding: "utf8" }).trim();

describe.skipIf(!url)("folio consecutivo bajo concurrencia (base real)", () => {
  let db: PrismaClient;
  let org = "", paciente = "", persona = "";
  let crear: typeof import("./evolucion-folio").crearEvolucionFirmada;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    const { prisma } = await import("@dent-view/db");
    db = prisma;
    ({ crearEvolucionFirmada: crear } = await import("./evolucion-folio"));
    org = psql(`select id from "Organization" where slug='radex-demo'`);
    const sufijo = Date.now();
    persona = (await db.persona.create({ data: { tipoDocumento: "CC", numeroDocumento: `QA-FOLIO-${sufijo}`, nombre: "QA Folio" } })).id;
    paciente = (await db.pacienteTenant.create({ data: { organizationId: org, personaId: persona, nombre: `QA Folio ${sufijo}` } })).id;
  });

  afterAll(async () => {
    if (paciente) {
      psql(`delete from "Evento" where "pacienteId"='${paciente}'; delete from "AdendaEvolucion" where "evolucionId" in (select id from "EvolucionClinica" where "pacienteId"='${paciente}'); delete from "AdjuntoEvolucion" where "evolucionId" in (select id from "EvolucionClinica" where "pacienteId"='${paciente}'); delete from "EvolucionClinica" where "pacienteId"='${paciente}'; delete from "PacienteTenant" where id='${paciente}'; delete from "Persona" where id='${persona}';`);
    }
    await db?.$disconnect();
  });

  const datos = (i: number) => ({
    organizationId: org, pacienteId: paciente, ordenId: null, citaId: null, plantillaId: null, plantillaVersion: null,
    contenido: componerContenido(CAMPOS_ESTANDAR, { hallazgos: `Hallazgo ${i}` }), diagnosticos: [], proximaCita: null,
    firmante: { id: "qa-firmante", nombre: "QA Firmante", tarjeta: null }, metodoFirma: "CLAVE" as const,
  });

  it("10 firmas simultáneas dan folios 1..10 sin huecos ni duplicados y con hash verificable", async () => {
    const r = await Promise.all(Array.from({ length: 10 }, (_, i) => crear(db, datos(i))));
    expect(r.map((x) => x.folio).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const filas = await db.evolucionClinica.findMany({ where: { pacienteId: paciente } });
    expect(filas).toHaveLength(10);
    for (const f of filas) expect(hashEvolucion(f)).toBe(f.hashContenido);
  }, 60_000);

  it("el rol de la app no puede modificar ni borrar una evolución firmada (inmodificabilidad)", async () => {
    const f = await db.evolucionClinica.findFirstOrThrow({ where: { pacienteId: paciente } });
    await expect(db.$executeRaw`update "EvolucionClinica" set hallazgos='alterado' where id=${f.id}`).rejects.toThrow();
    await expect(db.$executeRaw`delete from "EvolucionClinica" where id=${f.id}`).rejects.toThrow();
  });
});
