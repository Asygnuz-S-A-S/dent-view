import { prisma } from "@dent-view/db";
import { esquemaPacientePatch } from "@/lib/api-esquemas";
import { noEncontrado, rutaApi } from "@/lib/api-ruta";
import { pacienteJson } from "@/lib/api-serializar";
import { registrarEvento } from "@/lib/eventos";

type P = { id: string };

export const GET = rutaApi<P>("pacientes:leer", async (c) => {
  const p = await prisma.pacienteTenant.findFirst({ where: { id: c.params.id, organizationId: c.organizationId }, include: { persona: true } });
  if (!p) return noEncontrado("Paciente");
  return { status: 200, body: { paciente: pacienteJson(p) } };
});

export const PATCH = rutaApi<P>("pacientes:escribir", (c) =>
  c.escribir(esquemaPacientePatch, async (d) => {
    const { count } = await prisma.pacienteTenant.updateMany({ where: { id: c.params.id, organizationId: c.organizationId }, data: d });
    if (!count) return noEncontrado("Paciente");
    await registrarEvento({ organizationId: c.organizationId, pacienteId: c.params.id, actorId: null, tipo: "paciente.actualizado", detalle: { origen: "api", token: c.token.prefijo, campos: Object.keys(d) } });
    const p = await prisma.pacienteTenant.findFirstOrThrow({ where: { id: c.params.id, organizationId: c.organizationId }, include: { persona: true } });
    // M3: sin pacientes:leer el PATCH no devuelve la ficha.
    return { status: 200, body: { paciente: c.token.permisos.includes("pacientes:leer") ? pacienteJson(p) : { id: p.id } } };
  }),
);
