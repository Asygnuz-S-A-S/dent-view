"use server";

import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { registrarEvento } from "@/lib/eventos";
import { GESTION } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

type R = { error?: string };

const esquema = z.object({
  pacienteId: z.string(),
  doctorId: z.string().min(1, "Elige un doctor"),
  especialidad: z.string().trim().min(2, "Escribe la especialidad o el tratamiento").max(80),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  nota: z.string().trim().max(500).transform((v) => v || null),
});

/** Registra a mano la relación paciente-doctor-especialidad (recepción/admin). */
export async function agregarDoctorPaciente(input: z.input<typeof esquema>): Promise<R> {
  const ctx = await exigirContexto(GESTION);
  const p = esquema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0].message };
  const d = p.data;
  const org = ctx.organizationId;
  const [paciente, doctor] = await Promise.all([
    prisma.pacienteTenant.findFirst({ where: { id: d.pacienteId, organizationId: org }, select: { id: true } }),
    prisma.member.findFirst({ where: { organizationId: org, userId: d.doctorId, role: "doctor_remitente" }, select: { userId: true } }),
  ]);
  if (!paciente) return { error: "Paciente no encontrado" };
  if (!doctor) return { error: "Doctor no encontrado en el centro" };
  const fecha = new Date(`${d.desde}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime())) return { error: "Fecha inválida" };
  const r = await prisma.doctorPaciente.create({ data: { organizationId: org, pacienteId: d.pacienteId, doctorId: d.doctorId, especialidad: d.especialidad, desde: fecha, nota: d.nota, creadoPorId: ctx.usuario.id } });
  await registrarEvento({ organizationId: org, pacienteId: d.pacienteId, actorId: ctx.usuario.id, tipo: "paciente.doctor_agregado", detalle: { relacionId: r.id, doctorId: d.doctorId, especialidad: d.especialidad } });
  revalidatePath(`/pacientes/${d.pacienteId}`);
  return {};
}

export async function quitarDoctorPaciente(id: string): Promise<R> {
  const ctx = await exigirContexto(GESTION);
  const r = await prisma.doctorPaciente.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!r) return { error: "Relación no encontrada" };
  await prisma.doctorPaciente.delete({ where: { id } });
  await registrarEvento({ organizationId: ctx.organizationId, pacienteId: r.pacienteId, actorId: ctx.usuario.id, tipo: "paciente.doctor_quitado", detalle: { doctorId: r.doctorId, especialidad: r.especialidad } });
  revalidatePath(`/pacientes/${r.pacienteId}`);
  return {};
}
