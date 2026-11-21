import { randomUUID } from "node:crypto";
import { prisma } from "@dent-view/db";

const VIGENCIA_DIAS = 7;
const ROLES_INVITABLES = ["admin_tenant", "recepcion", "especialista", "doctor_remitente"];

export const ETIQUETA_ROL: Record<string, string> = { admin_tenant: "administrador", recepcion: "recepción", especialista: "especialista", doctor_remitente: "doctor remitente" };

type Invitacion = { status: string; expiresAt: Date; email: string; role: string | null };

/** Una invitación solo la responde su destinatario (correo de la sesión), mientras esté pendiente y vigente. */
export function invitacionVigente(inv: Invitacion, correoSesion: string, ahora = new Date()) {
  return inv.status === "pending" && inv.expiresAt > ahora && inv.email.toLowerCase() === correoSesion.toLowerCase();
}

/** Deja una única invitación pendiente por centro y correo (reemplaza la anterior). */
export async function crearInvitacion(organizationId: string, inviterId: string, email: string, role: string) {
  const correo = email.toLowerCase();
  await prisma.invitation.deleteMany({ where: { organizationId, email: correo, status: "pending" } });
  return prisma.invitation.create({
    data: { id: randomUUID(), organizationId, email: correo, role, inviterId, expiresAt: new Date(Date.now() + VIGENCIA_DIAS * 86_400_000) },
  });
}

/** Aceptar crea la membresía con el rol invitado; rechazar solo cierra la invitación. */
export async function responderInvitacion(id: string, usuario: { id: string; email: string; emailVerified: boolean }, aceptar: boolean): Promise<{ ok: true } | { error: string }> {
  const inv = await prisma.invitation.findUnique({ where: { id } });
  if (!inv || !invitacionVigente(inv, usuario.email)) return { error: "La invitación no existe o ya no está vigente" };
  // N1: una cuenta creada por un tercero (clave temporal conocida por él) no prueba ser dueña del correo.
  // Con SMTP el correo se verifica al fijar la clave con el enlace recibido (usuarios.ts); sin SMTP queda sin verificar.
  if (aceptar && !usuario.emailVerified) return { error: "Debes verificar tu correo antes de aceptar invitaciones. Contacta al centro." };
  if (aceptar && (!inv.role || !ROLES_INVITABLES.includes(inv.role))) return { error: "La invitación no es válida" };
  const cerrada = await prisma.$transaction(async (tx) => {
    // Condicionado al estado pendiente: dos clics simultáneos no la procesan dos veces.
    const { count } = await tx.invitation.updateMany({ where: { id, status: "pending" }, data: { status: aceptar ? "accepted" : "rejected" } });
    if (!count) return false;
    if (aceptar) {
      await tx.member.upsert({
        where: { organizationId_userId: { organizationId: inv.organizationId, userId: usuario.id } },
        update: {}, // ya es miembro: no se cambia su rol
        create: { id: randomUUID(), organizationId: inv.organizationId, userId: usuario.id, role: inv.role! },
      });
      await tx.session.updateMany({ where: { userId: usuario.id, activeOrganizationId: null }, data: { activeOrganizationId: inv.organizationId } });
    }
    return true;
  });
  return cerrada ? { ok: true } : { error: "La invitación ya fue respondida" };
}
