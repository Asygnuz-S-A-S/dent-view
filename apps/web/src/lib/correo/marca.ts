// Resuelve la marca de correo desde la base: del centro, o del usuario (un único centro → ese centro; si no, la plataforma).
import { prisma } from "@dent-view/db";
import { normalizarHex } from "../marca";
import { decodificarLogo, MARCA_PLATAFORMA, type Marca } from "./plantilla";

export async function marcaDeCentro(organizationId: string): Promise<Marca> {
  const [org, cfg] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    prisma.configCentro.findUnique({ where: { organizationId } }),
  ]);
  if (!org) return MARCA_PLATAFORMA;
  return {
    nombre: cfg?.nombre?.trim() || org.name,
    color: normalizarHex(cfg?.colorPrimario) ?? MARCA_PLATAFORMA.color,
    logo: decodificarLogo(cfg?.logo),
    direccion: cfg?.direccion, telefono: cfg?.telefono, correo: cfg?.correo,
  };
}

/** Correos sin contexto de centro (restablecer clave): marca del centro solo si la persona pertenece a uno y es el único. */
export async function marcaDeUsuario(userId: string): Promise<Marca> {
  const miembros = await prisma.member.findMany({ where: { userId }, select: { organizationId: true }, take: 2 });
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return miembros.length === 1 && u?.role !== "admin" ? marcaDeCentro(miembros[0]!.organizationId) : MARCA_PLATAFORMA;
}
