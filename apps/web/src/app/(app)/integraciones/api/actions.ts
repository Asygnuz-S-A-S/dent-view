"use server";

import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { bogotaAUtc, esFecha, hoyBogota } from "@/lib/agenda";
import { generarTokenApi, permisosValidos, validarCombinacion } from "@/lib/api-token";
import { registrarEvento } from "@/lib/eventos";
import { ADMIN } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

const esquema = z.object({
  nombre: z.string().trim().min(2, "Pon un nombre de al menos 2 letras").max(80, "Nombre muy largo"),
  permisos: z.array(z.string()).max(50),
  /** Último día de vigencia ("YYYY-MM-DD", hora de Bogotá); vacío = no vence. */
  vence: z.string().refine((f) => f === "" || (esFecha(f) && f >= hoyBogota()), "El vencimiento debe ser hoy o una fecha futura").optional(),
});

export type ResultadoToken = { error: string } | { token: string; prefijo: string };

/** Crea un token. El valor completo se devuelve una sola vez; en la BD solo queda su hash. */
export async function crearToken(entrada: z.input<typeof esquema>): Promise<ResultadoToken> {
  const ctx = await exigirContexto(ADMIN);
  if (ctx.suplantadoPor) return { error: "Un superadmin dentro del centro no puede crear tokens" };
  const r = esquema.safeParse(entrada);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const permisos = permisosValidos(r.data.permisos);
  if (!permisos.length) return { error: "Elige al menos un permiso" };
  const incoherente = validarCombinacion(permisos);
  if (incoherente) return { error: incoherente };
  const { token, prefijo, tokenHash } = generarTokenApi();
  const vence = r.data.vence ? bogotaAUtc(r.data.vence, 24 * 60) : null;
  await prisma.$transaction(async (tx) => {
    const creado = await tx.tokenApi.create({ data: { organizationId: ctx.organizationId, nombre: r.data.nombre, prefijo, tokenHash, permisos, vence, creadoPorId: ctx.usuario.id } });
    // Nunca se registra el token, solo su prefijo.
    await registrarEvento({ organizationId: ctx.organizationId, actorId: ctx.usuario.id, tipo: "integracion.token_creado", detalle: { tokenId: creado.id, prefijo, nombre: r.data.nombre, permisos } }, tx);
  });
  revalidatePath("/integraciones/api");
  return { token, prefijo };
}

export async function revocarToken(id: string): Promise<{ error?: string }> {
  const ctx = await exigirContexto(ADMIN);
  if (ctx.suplantadoPor) return { error: "Un superadmin dentro del centro no puede revocar tokens" };
  const token = await prisma.tokenApi.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!token) return { error: "Token no encontrado" };
  if (token.revocadoEn) return {};
  await prisma.$transaction(async (tx) => {
    await tx.tokenApi.updateMany({ where: { id, organizationId: ctx.organizationId, revocadoEn: null }, data: { revocadoEn: new Date() } });
    await registrarEvento({ organizationId: ctx.organizationId, actorId: ctx.usuario.id, tipo: "integracion.token_revocado", detalle: { tokenId: id, prefijo: token.prefijo, nombre: token.nombre } }, tx);
  });
  revalidatePath("/integraciones/api");
  return {};
}
