import { randomBytes, randomUUID } from "node:crypto";
import { prisma, type Prisma } from "@dent-view/db";
import { auth } from "./auth";
import { smtpConfigurado } from "./conectores";
import { crearInvitacion } from "./invitaciones";

/**
 * Busca un usuario por correo o lo crea.
 * Con SMTP: la clave aleatoria no la conoce nadie y la persona recibe un enlace (de un solo uso) para fijar la suya;
 * al usarlo el correo queda verificado (N1/N10). Sin SMTP (respaldo): claveTemporal viene para mostrarla una vez al admin.
 * Las cuentas creadas por un tercero quedan sin verificar y obligan a cambiar la clave en el primer ingreso.
 */
export async function crearOBuscarUsuario(correo: string, nombre: string, perfil?: Prisma.PerfilDoctorCreateWithoutUserInput, membresia?: { organizationId: string; role: string }) {
  const email = correo.trim().toLowerCase();
  const existente = await prisma.user.findUnique({ where: { email } });
  if (existente) return { usuario: existente, claveTemporal: null };

  const ctx = await auth.$context;
  const id = randomUUID();
  const claveTemporal = randomBytes(9).toString("base64url");
  const usuario = await prisma.user.create({
    data: {
      id,
      email,
      name: nombre.trim(),
      emailVerified: false,
      debeCambiarClave: true,
      ...(perfil && { perfilDoctor: { create: perfil } }),
      accounts: {
        create: {
          id: randomUUID(),
          providerId: "credential",
          accountId: id, // Better Auth exige accountId = userId en cuentas "credential"
          password: await ctx.password.hash(claveTemporal),
        },
      },
    },
  });
  if (!smtpConfigurado()) return { usuario, claveTemporal };
  // La membresía va antes del correo: así el enlace de bienvenida lleva la marca del centro.
  if (membresia) await asegurarMembresia(membresia.organizationId, usuario.id, membresia.role);
  await auth.api.requestPasswordReset({ body: { email, redirectTo: "/recuperar/nueva" } });
  return { usuario, claveTemporal: null };
}

/** Agrega (o actualiza el rol de) un usuario en un centro. */
export function asegurarMembresia(organizationId: string, userId: string, role: string) {
  return prisma.member.upsert({
    where: { organizationId_userId: { organizationId, userId } },
    update: { role },
    create: { id: randomUUID(), organizationId, userId, role },
  });
}

type Alta = { organizationId: string; inviterId: string; correo: string; nombre: string; role: string; perfil?: Prisma.PerfilDoctorCreateWithoutUserInput };

/**
 * Agrega a alguien a un centro sin tocar cuentas ajenas: si el correo no tiene cuenta, se crea (enlace por correo o,
 * sin SMTP, clave temporal) y ya es miembro; si ya tiene cuenta NO se vincula: se deja una invitación pendiente que el titular acepta o rechaza.
 */
export async function agregarAlCentro(a: Alta) {
  const email = a.correo.trim().toLowerCase();
  const existente = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!existente) {
    const { usuario, claveTemporal } = await crearOBuscarUsuario(email, a.nombre, a.perfil, { organizationId: a.organizationId, role: a.role });
    await asegurarMembresia(a.organizationId, usuario.id, a.role);
    return { resultado: "nueva" as const, claveTemporal };
  }
  const miembro = await prisma.member.findUnique({
    where: { organizationId_userId: { organizationId: a.organizationId, userId: existente.id } },
  });
  if (miembro) return { resultado: "miembro" as const, role: miembro.role };
  await crearInvitacion(a.organizationId, a.inviterId, email, a.role);
  return { resultado: "invitada" as const };
}
