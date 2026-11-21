"use server";

import { randomUUID } from "node:crypto";
import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { registrarEvento } from "@/lib/eventos";
import { exigirSuperadmin } from "@/lib/sesion";
import { TIPOS_CENTRO } from "@/lib/tipo-centro";
import { asegurarMembresia, crearOBuscarUsuario } from "@/lib/usuarios";

const nuevoCentro = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre del centro").max(80),
  slug: z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug no válido: minúsculas, números y guiones").max(48),
  adminNombre: z.string().trim().min(2, "Escribe el nombre del administrador").max(80),
  adminCorreo: z.string().trim().email("Correo no válido"),
  tipoCentro: z.enum(TIPOS_CENTRO, "Elige el tipo de centro"),
});

type Resultado = { ok: true; claveTemporal: string | null; correo: string } | { ok: false; error: string };

export async function crearCentro(entrada: z.input<typeof nuevoCentro>): Promise<Resultado> {
  await exigirSuperadmin();
  const p = nuevoCentro.safeParse(entrada);
  if (!p.success) return { ok: false, error: p.error.issues[0]!.message };
  const { nombre, slug, adminNombre, adminCorreo, tipoCentro } = p.data;

  if (await prisma.organization.findUnique({ where: { slug } })) return { ok: false, error: "Ese slug ya está en uso" };
  const { usuario, claveTemporal } = await crearOBuscarUsuario(adminCorreo, adminNombre);
  const org = await prisma.organization.create({ data: { id: randomUUID(), name: nombre, slug } });
  await asegurarMembresia(org.id, usuario.id, "admin_tenant");
  await prisma.configCentro.upsert({ where: { organizationId: org.id }, create: { organizationId: org.id, tipoCentro }, update: { tipoCentro } });
  revalidatePath("/plataforma");
  return { ok: true, claveTemporal, correo: usuario.email };
}

/** Valida y deja constancia de la entrada; el cliente suplanta después al usuario devuelto. */
export async function prepararEntrada(organizationId: string): Promise<{ userId: string } | { error: string }> {
  const superadmin = await exigirSuperadmin();
  const admin = await prisma.member.findFirst({
    // role NULL también cuenta: `not: "admin"` en SQL excluye los NULL.
    where: { organizationId, role: "admin_tenant", user: { OR: [{ role: null }, { role: { not: "admin" } }] } },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) return { error: "El centro no tiene un administrador al que suplantar" };
  // El evento plataforma.entrada lo registra el hook del servidor en /admin/impersonate-user.

  return { userId: admin.userId };
}

/** Cambia el tipo de un centro existente (solo superadmin); queda en la auditoría del centro. */
export async function cambiarTipoCentro(organizationId: string, tipo: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const superadmin = await exigirSuperadmin();
  const nuevo = z.enum(TIPOS_CENTRO).safeParse(tipo);
  if (!nuevo.success) return { ok: false, error: "Tipo de centro no válido" };
  if (!(await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } }))) return { ok: false, error: "Centro no encontrado" };
  const antes = await prisma.configCentro.findUnique({ where: { organizationId }, select: { tipoCentro: true } });
  if ((antes?.tipoCentro ?? "CENTRO_RADIOLOGICO") === nuevo.data) return { ok: true };
  await prisma.configCentro.upsert({
    where: { organizationId },
    create: { organizationId, tipoCentro: nuevo.data },
    update: { tipoCentro: nuevo.data },
  });
  await registrarEvento({
    organizationId, tipo: "centro.tipo_cambiado", actorId: superadmin.id,
    detalle: { de: antes?.tipoCentro ?? "CENTRO_RADIOLOGICO", a: nuevo.data },
  });
  revalidatePath("/plataforma");
  return { ok: true };
}
