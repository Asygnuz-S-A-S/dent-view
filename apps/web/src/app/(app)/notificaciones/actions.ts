"use server";

// Implementación independiente (sala limpia) a partir de docs/sala-limpia/04-notificaciones.md
import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { despachar } from "@/lib/notificar";
import { TIPOS_MENSAJE } from "@/lib/notificaciones";
import { generarRecordatoriosCita } from "@/lib/recordatorios";
import { ADMIN } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

type R = { error?: string };

/** Genera recordatorios pendientes y despacha la cola del centro (el cron externo hace lo mismo para todos). */
export async function procesarCola(): Promise<R & { enviados?: number; fallidos?: number; omitidos?: number }> {
  const ctx = await exigirContexto(ADMIN);
  await generarRecordatoriosCita(new Date(), ctx.organizationId);
  const r = await despachar({ organizationId: ctx.organizationId });
  revalidatePath("/notificaciones");
  return r;
}

const esquema = z.object({ tipo: z.enum(TIPOS_MENSAJE), asunto: z.string().trim().min(1, "Falta el asunto").max(200), cuerpo: z.string().trim().min(1, "Falta el cuerpo").max(3000) });

export async function guardarPlantilla(entrada: z.input<typeof esquema>): Promise<R> {
  const ctx = await exigirContexto(ADMIN);
  const r = esquema.safeParse(entrada);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const d = r.data;
  const k = { organizationId_tipo_canal: { organizationId: ctx.organizationId, tipo: d.tipo, canal: "CORREO" } };
  await prisma.plantillaMensaje.upsert({ where: k, create: { organizationId: ctx.organizationId, tipo: d.tipo, canal: "CORREO", asunto: d.asunto, cuerpo: d.cuerpo }, update: { asunto: d.asunto, cuerpo: d.cuerpo, activa: true } });
  revalidatePath("/notificaciones");
  return {};
}

/** Vuelve a la plantilla del sistema (desactiva la del centro). */
export async function restaurarPlantilla(tipo: string): Promise<R> {
  const ctx = await exigirContexto(ADMIN);
  if (!(TIPOS_MENSAJE as readonly string[]).includes(tipo)) return { error: "Tipo inválido" };
  await prisma.plantillaMensaje.deleteMany({ where: { organizationId: ctx.organizationId, tipo, canal: "CORREO" } });
  revalidatePath("/notificaciones");
  return {};
}

export async function guardarHorasRecordatorio(horas: number): Promise<R> {
  const ctx = await exigirContexto(ADMIN);
  if (!Number.isInteger(horas) || horas < 1 || horas > 168) return { error: "Entre 1 y 168 horas" };
  await prisma.configCentro.upsert({ where: { organizationId: ctx.organizationId }, create: { organizationId: ctx.organizationId, recordatorioHoras: horas }, update: { recordatorioHoras: horas } });
  revalidatePath("/notificaciones");
  return {};
}

