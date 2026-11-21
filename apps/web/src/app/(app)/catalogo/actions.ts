"use server";

import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CATEGORIAS } from "@/lib/precios";
import { ADMIN } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

const precio = z.preprocess(
  (v) => (v === "" || v == null ? null : Number(v)),
  z.number().int().min(0).nullable(),
);
const esquema = z.object({
  id: z.string().optional(),
  categoria: z.enum(CATEGORIAS.map((c) => c.valor) as [string, ...string[]]),
  nombre: z.string().trim().min(1, "Falta el nombre"),
  descripcion: z.string().trim().optional(),
  precioImpreso: precio,
  precioDigital: precio,
  descuento: z.preprocess((v) => (v === "" || v == null ? 0 : Number(v)), z.number().int().min(0)),
});

export type EstadoForm = { error?: string; ok?: boolean } | undefined;

export async function guardarServicio(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const ctx = await exigirContexto(ADMIN);
  const r = esquema.safeParse(Object.fromEntries(fd));
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const { id, descripcion, ...datos } = r.data;
  const data = { ...datos, descripcion: descripcion || null };
  if (id) {
    const { count } = await prisma.servicio.updateMany({ where: { id, organizationId: ctx.organizationId }, data });
    if (!count) return { error: "Servicio no encontrado" };
  } else {
    await prisma.servicio.create({ data: { ...data, organizationId: ctx.organizationId } });
  }
  revalidatePath("/catalogo");
  return { ok: true };
}

export async function cambiarActivo(id: string, activo: boolean) {
  const ctx = await exigirContexto(ADMIN);
  await prisma.servicio.updateMany({ where: { id, organizationId: ctx.organizationId }, data: { activo } });
  revalidatePath("/catalogo");
}
