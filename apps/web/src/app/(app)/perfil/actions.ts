"use server";

import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ROLES_PROFESIONALES } from "@/lib/perfil";
import { obtenerSesion } from "@/lib/sesion";

const opcional = z.string().trim().max(120).transform((v) => v || null);
const esquema = z.object({ tarjetaProfesional: opcional, especialidad: opcional, telefono: opcional, consultorio: opcional });

/** Solo el titular edita su perfil profesional (el userId sale de la sesión, nunca del formulario). */
export async function guardarPerfilProfesional(formData: FormData): Promise<{ error: string } | { ok: true }> {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.session.impersonatedBy) return { error: "Sesión no válida" };
  const p = esquema.safeParse(Object.fromEntries(formData));
  if (!p.success) return { error: p.error.issues[0].message };
  const esProfesional =
    sesion.user.role === "admin" ||
    !!(await prisma.member.findFirst({ where: { userId: sesion.user.id, role: { in: [...ROLES_PROFESIONALES] } }, select: { id: true } }));
  if (!esProfesional) return { error: "Tu cuenta no tiene perfil profesional" };
  await prisma.perfilDoctor.upsert({ where: { userId: sesion.user.id }, update: p.data, create: { userId: sesion.user.id, ...p.data } });
  revalidatePath("/perfil");
  return { ok: true };
}
