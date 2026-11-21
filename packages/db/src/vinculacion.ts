import type { PrismaClient } from "./generated/client.ts";

// Criterio único (web y worker) para ligar un estudio recién asignado a la orden del paciente.
type OrdenCandidata = { id: string; estado: string; creadoEn: Date };

/** La orden AGENDADA/TOMADA más reciente; si dos empatan en fecha hay ambigüedad y no se vincula (null). */
export function elegirOrdenParaEstudio(ordenes: OrdenCandidata[]): string | null {
  const abiertas = ordenes.filter((o) => o.estado === "AGENDADA" || o.estado === "TOMADA").sort((a, b) => b.creadoEn.getTime() - a.creadoEn.getTime());
  if (!abiertas[0]) return null;
  return abiertas[1] && abiertas[1].creadoEn.getTime() === abiertas[0].creadoEn.getTime() ? null : abiertas[0].id;
}

/** Busca la orden a vincular para un paciente del centro. */
export async function ordenParaVincular(db: Pick<PrismaClient, "orden">, organizationId: string, pacienteId: string) {
  const ordenes = await db.orden.findMany({
    where: { organizationId, pacienteId, estado: { in: ["AGENDADA", "TOMADA"] } },
    select: { id: true, estado: true, creadoEn: true },
  });
  return elegirOrdenParaEstudio(ordenes);
}
