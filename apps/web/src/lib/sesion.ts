import { prisma } from "@dent-view/db";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";
import { debeActivarMfa } from "./perfil";
import { moduloHabilitado, type Modulo } from "./tipo-centro";
import { tipoDeCentro } from "./tipo-centro-servidor";

/** Sesión de Better Auth (una consulta por request). */
export const obtenerSesion = cache(async () => auth.api.getSession({ headers: await headers() }));

/** Sesión + organización activa + rol del usuario en ella. null si falta cualquiera. */
export async function contextoActivo() {
  const sesion = await obtenerSesion();
  const organizationId = sesion?.session.activeOrganizationId;
  if (!sesion || !organizationId) return null;
  const miembro = await prisma.member.findUnique({
    where: { organizationId_userId: { organizationId, userId: sesion.user.id } },
  });
  if (!miembro) return null;
  // suplantadoPor: id del superadmin cuando la sesión es una suplantación ("Entrar al centro").
  return { usuario: sesion.user, organizationId, rol: miembro.role, suplantadoPor: sesion.session.impersonatedBy ?? null };
}

/** Contexto activo exigiendo uno de los roles dados; sin sesión → /ingresar, sin rol → 404. */
export async function exigirContexto(roles?: readonly string[]) {
  const ctx = await contextoActivo();
  if (!ctx) {
    // Un superadmin sin centro activo vive en /plataforma.
    const sesion = await obtenerSesion();
    redirect(sesion?.user.role === "admin" ? "/plataforma" : "/ingresar");
  }
  // Cuenta con clave temporal: nada funciona hasta cambiarla en /perfil.
  if (ctx.usuario.debeCambiarClave) redirect("/perfil");
  // MFA obligatorio para administradores: hasta activarlo solo pueden estar en /perfil.
  if (debeActivarMfa(ctx.usuario, ctx.rol, !!ctx.suplantadoPor)) redirect("/perfil");
  if (roles && !roles.includes(ctx.rol)) notFound();
  return ctx;
}

/** Solo superadmin de la plataforma (user.role "admin"); sin sesión → /ingresar, otro usuario → 404. */
export async function exigirSuperadmin() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/ingresar");
  if (sesion.user.role !== "admin") notFound();
  if (debeActivarMfa(sesion.user, null, !!sesion.session.impersonatedBy)) redirect("/perfil");
  return sesion.user;
}

/** Un módulo deshabilitado para el tipo del centro no existe: ocultarlo en el menú no basta, las acciones y rutas API también deben negarse. */
export const modulosHabilitadoEnCentro = async (organizationId: string, modulo: Modulo) => moduloHabilitado(await tipoDeCentro(organizationId), modulo);

/** Páginas y server actions: 404 si el módulo está deshabilitado en el centro del contexto (incluye al superadmin suplantando: sigue las reglas del centro). */
export async function exigirModulo(ctx: { organizationId: string }, modulo: Modulo) {
  if (!(await modulosHabilitadoEnCentro(ctx.organizationId, modulo))) notFound();
}

/** Rutas /api: Response 404 si el módulo está deshabilitado; null si puede seguir. */
export async function respuestaSinModulo(ctx: { organizationId: string }, modulo: Modulo): Promise<Response | null> {
  return (await modulosHabilitadoEnCentro(ctx.organizationId, modulo)) ? null : new Response(null, { status: 404 });
}
