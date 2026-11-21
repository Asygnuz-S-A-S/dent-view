"use server";

import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { registrarEvento } from "@/lib/eventos";
import { GESTION } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";
import { agregarAlCentro } from "@/lib/usuarios";

const opcional = z.string().trim().max(120).transform((v) => v || null);
const perfil = {
  tarjetaProfesional: opcional,
  especialidad: opcional,
  telefono: opcional,
  consultorio: opcional,
};
const esquemaNuevo = z.object({
  nombre: z.string().trim().min(3, "Escribe el nombre del doctor").max(120),
  correo: z.email("Correo inválido"),
  ...perfil,
});
export type ResultadoDoctor = { error: string } | { ok: true; claveTemporal: string | null };

/**
 * Agrega un doctor al centro. Si el correo ya tiene cuenta NO se vincula: queda una invitación pendiente.
 * El perfil profesional solo se prellena en cuentas nuevas; después lo edita únicamente su titular (/perfil).
 */
export async function agregarDoctor(formData: FormData): Promise<ResultadoDoctor> {
  const ctx = await exigirContexto(GESTION);
  const p = esquemaNuevo.safeParse(Object.fromEntries(formData));
  if (!p.success) return { error: p.error.issues[0].message };
  const { nombre, correo, ...perfil } = p.data;

  const r = await agregarAlCentro({ organizationId: ctx.organizationId, inviterId: ctx.usuario.id, correo, nombre, role: "doctor_remitente", perfil });
  if (r.resultado === "miembro") return { error: "Esa persona ya pertenece al equipo del centro" };
  await registrarEvento({
    organizationId: ctx.organizationId,
    actorId: ctx.usuario.id,
    tipo: "doctor.agregado",
    detalle: { correo: correo.toLowerCase(), nuevo: r.resultado === "nueva", invitacion: r.resultado === "invitada" },
  });
  revalidatePath("/doctores");
  return { ok: true, claveTemporal: r.resultado === "nueva" ? r.claveTemporal : null };
}

/** Quita al doctor del centro: borra solo la membresía; su cuenta y sus órdenes/estudios se conservan. */
export async function quitarDoctor(userId: string): Promise<{ error?: string }> {
  const ctx = await exigirContexto(GESTION);
  const { count } = await prisma.member.deleteMany({
    where: { organizationId: ctx.organizationId, userId, role: "doctor_remitente" },
  });
  if (!count) return { error: "Doctor no encontrado" };
  await registrarEvento({ organizationId: ctx.organizationId, actorId: ctx.usuario.id, tipo: "doctor.quitado", detalle: { doctorId: userId } });
  revalidatePath("/doctores");
  return {};
}
