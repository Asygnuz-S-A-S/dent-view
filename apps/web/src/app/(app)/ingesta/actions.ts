"use server";

import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { generarToken, hashToken } from "@/lib/entrega";
import { registrarEvento } from "@/lib/eventos";
import { ADMIN } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

export type EstadoEstacion = { error?: string; token?: string } | undefined;

const esquema = z.object({ nombre: z.string().trim().min(1, "Falta el nombre").max(80, "Máximo 80 caracteres") });

/** Crea la estación y devuelve el token una sola vez: en la BD solo queda su hash. */
export async function crearEstacion(_: EstadoEstacion, fd: FormData): Promise<EstadoEstacion> {
  const ctx = await exigirContexto(ADMIN);
  const r = esquema.safeParse(Object.fromEntries(fd));
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const token = generarToken();
  const e = await prisma.estacionIngesta.create({
    data: { organizationId: ctx.organizationId, nombre: r.data.nombre, tokenHash: hashToken(token), creadoPorId: ctx.usuario.id },
  });
  await registrarEvento({ organizationId: ctx.organizationId, tipo: "ingesta.estacion_creada", actorId: ctx.usuario.id, detalle: { estacionId: e.id, nombre: e.nombre } });
  revalidatePath("/ingesta");
  return { token };
}

export async function cambiarEstacionActiva(id: string, activa: boolean) {
  const ctx = await exigirContexto(ADMIN);
  const { count } = await prisma.estacionIngesta.updateMany({ where: { id, organizationId: ctx.organizationId }, data: { activa } });
  if (!count) return;
  await registrarEvento({ organizationId: ctx.organizationId, tipo: activa ? "ingesta.estacion_activada" : "ingesta.estacion_desactivada", actorId: ctx.usuario.id, detalle: { estacionId: id } });
  revalidatePath("/ingesta");
}
