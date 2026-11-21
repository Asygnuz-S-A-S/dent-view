import { prisma } from "@dent-view/db";

/** Nombres de doctores remitentes del centro por userId (para mostrar "a cargo de"). */
export async function nombresDoctores(organizationId: string, ids: (string | null)[]) {
  const unicos = [...new Set(ids.filter((i): i is string => !!i))];
  if (unicos.length === 0) return new Map<string, string>();
  const us = await prisma.member.findMany({ where: { organizationId, userId: { in: unicos } }, include: { user: true } });
  return new Map(us.map((m) => [m.userId, m.user.name]));
}

type ACargo = { responsable: "PACIENTE" | "DOCTOR" | "CONVENIO"; responsableId: string | null; convenio: string | null };

export const aCargoDe = (f: ACargo, doctores: Map<string, string>, paciente: string) =>
  f.responsable === "DOCTOR" ? (doctores.get(f.responsableId ?? "") ?? "Doctor") : f.responsable === "CONVENIO" ? (f.convenio ?? "Convenio") : paciente;
