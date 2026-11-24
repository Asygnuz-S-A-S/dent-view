"use server";

import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { registrarEvento } from "@/lib/eventos";
import { ADMIN } from "@/lib/roles";
import { exigirContexto, exigirModulo } from "@/lib/sesion";

const esquema = z.object({
  activa: z.boolean(), diasControl: z.number().int().min(30, "Mínimo 30 días").max(730, "Máximo 730 días"),
  recordarCumpleanos: z.boolean(), mensajeCumpleanos: z.string().trim().max(500).nullish(),
});

/** La fidelización activa dispara correos y tareas a pacientes: la configura solo el administrador del centro. */
export async function guardarFidelizacion(entrada: z.input<typeof esquema>): Promise<{ error?: string }> {
  const ctx = await exigirContexto(ADMIN);
  await exigirModulo(ctx, "crm");
  const p = esquema.safeParse(entrada);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Datos inválidos" };
  const d = { ...p.data, mensajeCumpleanos: p.data.mensajeCumpleanos || null };
  await prisma.configFidelizacion.upsert({ where: { organizationId: ctx.organizationId }, update: d, create: { organizationId: ctx.organizationId, ...d } });
  await registrarEvento({ organizationId: ctx.organizationId, actorId: ctx.usuario.id, tipo: "crm.fidelizacion_configurada", detalle: { activa: d.activa, diasControl: d.diasControl } });
  revalidatePath("/crm/fidelizacion");
  return {};
}
