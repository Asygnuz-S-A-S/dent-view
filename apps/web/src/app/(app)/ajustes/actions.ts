"use server";

import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { COLORES_SALA } from "@/lib/agenda";
import { esquemaLogo, normalizarHex } from "@/lib/marca";
import { ADMIN } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

const esquema = z.object({
  id: z.string().optional(),
  nombre: z.string().trim().min(1, "Falta el nombre"),
  color: z.string().refine((c) => c in COLORES_SALA, "Color inválido"),
});

export type EstadoSala = { error?: string; ok?: boolean } | undefined;

export async function guardarSala(_: EstadoSala, fd: FormData): Promise<EstadoSala> {
  const ctx = await exigirContexto(ADMIN);
  const r = esquema.safeParse(Object.fromEntries(fd));
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const { id, ...data } = r.data;
  if (id) {
    const { count } = await prisma.sala.updateMany({ where: { id, organizationId: ctx.organizationId }, data });
    if (!count) return { error: "Sala no encontrada" };
  } else {
    await prisma.sala.create({ data: { ...data, organizationId: ctx.organizationId } });
  }
  revalidatePath("/ajustes");
  return { ok: true };
}

export async function cambiarSalaActiva(id: string, activa: boolean) {
  const ctx = await exigirContexto(ADMIN);
  await prisma.sala.updateMany({ where: { id, organizationId: ctx.organizationId }, data: { activa } });
  revalidatePath("/ajustes");
}

const esquemaMarca = z.object({
  nombre: z.string().trim().max(120, "Nombre muy largo").optional(),
  // undefined = deja el logo actual; null = lo quita.
  logo: esquemaLogo.nullish(),
  color: z.string().trim().refine((c) => c === "" || normalizarHex(c), "Color inválido: usa un hex como #0e6b8a").optional(),
});

/** Marca del centro (white-label): nombre comercial, logo y color principal. */
export async function guardarMarca(entrada: z.input<typeof esquemaMarca>): Promise<EstadoSala> {
  const ctx = await exigirContexto(ADMIN);
  const r = esquemaMarca.safeParse(entrada);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const { nombre, logo, color } = r.data;
  const data = { nombre: nombre || null, colorPrimario: normalizarHex(color), ...(logo !== undefined ? { logo } : {}) };
  await prisma.configCentro.upsert({ where: { organizationId: ctx.organizationId }, create: { organizationId: ctx.organizationId, ...data }, update: data });
  revalidatePath("/", "layout");
  return { ok: true };
}
