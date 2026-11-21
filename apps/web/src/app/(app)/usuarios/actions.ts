"use server";

import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ADMIN } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";
import { agregarAlCentro } from "@/lib/usuarios";
import { ROLES_STAFF, validarCambioMiembro } from "@/lib/usuarios-reglas";

const rol = z.enum(ROLES_STAFF);
const nuevoUsuario = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre").max(80),
  correo: z.string().trim().email("Correo no válido"),
  rol,
});

export async function agregarUsuario(entrada: z.input<typeof nuevoUsuario>) {
  const ctx = await exigirContexto(ADMIN);
  const p = nuevoUsuario.safeParse(entrada);
  if (!p.success) return { ok: false as const, error: p.error.issues[0]!.message };

  const r = await agregarAlCentro({ organizationId: ctx.organizationId, inviterId: ctx.usuario.id, correo: p.data.correo, nombre: p.data.nombre, role: p.data.rol });
  if (r.resultado === "miembro") return { ok: false as const, error: "Esa persona ya es miembro de este centro" };
  revalidatePath("/usuarios");
  // Mismo resultado exista o no la cuenta: la clave temporal solo viene si la cuenta es nueva.
  return { ok: true as const, claveTemporal: r.resultado === "nueva" ? r.claveTemporal : null, correo: p.data.correo.toLowerCase() };
}

/** rolNuevo null = quitar del centro. Valida que el miembro sea del centro activo. */
async function cambiar(memberId: string, rolNuevo: string | null) {
  const ctx = await exigirContexto(ADMIN);
  const m = await prisma.member.findFirst({ where: { id: memberId, organizationId: ctx.organizationId } });
  if (!m) return { ok: false as const, error: "Miembro no encontrado" };
  const admins = await prisma.member.count({ where: { organizationId: ctx.organizationId, role: "admin_tenant" } });
  const error = validarCambioMiembro({
    actorId: ctx.usuario.id,
    objetivoId: m.userId,
    rolActual: m.role,
    rolNuevo,
    admins,
  });
  if (error) return { ok: false as const, error };
  if (rolNuevo) await prisma.member.update({ where: { id: m.id }, data: { role: rolNuevo } });
  else await prisma.member.delete({ where: { id: m.id } });
  revalidatePath("/usuarios");
  return { ok: true as const };
}

export async function cambiarRol(memberId: string, nuevo: string) {
  const p = rol.safeParse(nuevo);
  return p.success ? cambiar(memberId, p.data) : { ok: false as const, error: "Rol no válido" };
}

export async function quitarUsuario(memberId: string) {
  return cambiar(memberId, null);
}
