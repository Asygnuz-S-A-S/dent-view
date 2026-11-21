import { prisma } from "@dent-view/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearPacienteEnCentro } from "./pacientes-centro";

// Requiere la BD de desarrollo: se omite si no hay DATABASE_URL.
describe.skipIf(!process.env.DATABASE_URL)("datos del paciente por centro (C2)", () => {
  const sufijo = `${Date.now()}`;
  const clave = { tipoDocumento: "CC", numeroDocumento: `TEST${sufijo}` };
  const orgs = [`c2a-${sufijo}`, `c2b-${sufijo}`];
  const ids: string[] = [];

  beforeAll(async () => {
    for (const slug of orgs) ids.push((await prisma.organization.create({ data: { id: slug, name: slug, slug } })).id);
  });
  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: ids } } });
    await prisma.persona.deleteMany({ where: clave });
    await prisma.$disconnect();
  });

  it("al vincular un documento existente no se copian ni exponen datos del otro centro", async () => {
    const a = await crearPacienteEnCentro(ids[0], clave, { nombre: "Nombre de A", celular: "300A", correo: "a@a.co" });
    const b = await crearPacienteEnCentro(ids[1], clave, { nombre: "Nombre de B" });
    if (!("creado" in a) || !("creado" in b)) throw new Error("debían crearse");
    const pb = await prisma.pacienteTenant.findUniqueOrThrow({ where: { id: b.creado.id } });
    expect(pb).toMatchObject({ nombre: "Nombre de B", celular: null, correo: null });
    expect(await prisma.persona.findUniqueOrThrow({ where: { tipoDocumento_numeroDocumento: clave } })).toMatchObject({ nombre: "", celular: null });
  });

  it("editar en un centro no cambia el otro y repetir el documento en el mismo centro devuelve el existente", async () => {
    const pa = await prisma.pacienteTenant.findFirstOrThrow({ where: { organizationId: ids[0], persona: clave } });
    const pb = await prisma.pacienteTenant.findFirstOrThrow({ where: { organizationId: ids[1], persona: clave } });
    await prisma.pacienteTenant.update({ where: { id: pb.id }, data: { nombre: "B editado", celular: "300B" } });
    expect(await prisma.pacienteTenant.findUniqueOrThrow({ where: { id: pa.id } })).toMatchObject({ nombre: "Nombre de A", celular: "300A" });
    expect(await crearPacienteEnCentro(ids[0], clave, { nombre: "otro" })).toEqual({ existente: pa.id });
  });
});
