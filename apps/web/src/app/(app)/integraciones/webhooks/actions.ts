"use server";

import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { cifrar, secretoCifrado } from "@/lib/cifrado";
import { registrarEvento } from "@/lib/eventos";
import { ADMIN } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";
import { encolarWebhooks, generarSecreto, validarUrlWebhook } from "@/lib/webhooks";
import { esEventoPublico } from "@/lib/webhooks-eventos";

export type EstadoWebhook = { error?: string; secreto?: string; ok?: boolean } | undefined;

const MAX_WEBHOOKS = 20;
const esquema = z.object({
  nombre: z.string().trim().min(1, "Falta el nombre").max(80, "Máximo 80 caracteres"),
  url: z.string().trim().max(500, "URL demasiado larga").superRefine((u, ctx) => {
    const v = validarUrlWebhook(u);
    if (!v.ok) ctx.addIssue({ code: "custom", message: v.error });
  }),
  eventos: z.array(z.string()).min(1, "Elige al menos un evento").refine((e) => e.every((x) => x === "*" || (esEventoPublico(x) && x !== "webhook.prueba")), "Evento no válido"),
});

const secretoServidor = () => secretoCifrado() ?? (() => { throw new Error("Falta CIFRADO_SECRETO o BETTER_AUTH_SECRET"); })();
const BLOQUEO = "Un superadmin dentro del centro no puede gestionar webhooks";

/** Contexto ADMIN; durante la suplantación las acciones quedan bloqueadas. */
async function admin() {
  const ctx = await exigirContexto(ADMIN);
  return { ctx, bloqueado: !!ctx.suplantadoPor };
}

const leer = (fd: FormData) => esquema.safeParse({ nombre: fd.get("nombre"), url: fd.get("url"), eventos: fd.getAll("eventos").map(String) });
const auditar = (ctx: { organizationId: string; usuario: { id: string } }, tipo: string, webhookId: string, extra?: object) =>
  registrarEvento({ organizationId: ctx.organizationId, tipo: `integracion.${tipo}`, actorId: ctx.usuario.id, detalle: { webhookId, ...extra } });

/** Crea el webhook y devuelve el secreto una sola vez: en la BD solo queda cifrado. */
export async function crearWebhook(_: EstadoWebhook, fd: FormData): Promise<EstadoWebhook> {
  const { ctx, bloqueado } = await admin();
  if (bloqueado) return { error: BLOQUEO };
  const r = leer(fd);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  if ((await prisma.webhook.count({ where: { organizationId: ctx.organizationId } })) >= MAX_WEBHOOKS) return { error: `Máximo ${MAX_WEBHOOKS} webhooks por centro` };
  const secreto = generarSecreto();
  const w = await prisma.webhook.create({
    data: { ...r.data, organizationId: ctx.organizationId, secretoCifrado: cifrar(secreto, secretoServidor()), creadoPorId: ctx.usuario.id },
  });
  await auditar(ctx, "webhook_creado", w.id, { nombre: w.nombre, eventos: w.eventos });
  revalidatePath("/integraciones/webhooks");
  return { secreto };
}

export async function editarWebhook(id: string, _: EstadoWebhook, fd: FormData): Promise<EstadoWebhook> {
  const { ctx, bloqueado } = await admin();
  if (bloqueado) return { error: BLOQUEO };
  const r = leer(fd);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const { count } = await prisma.webhook.updateMany({ where: { id, organizationId: ctx.organizationId }, data: r.data });
  if (!count) return { error: "Webhook no encontrado" };
  await auditar(ctx, "webhook_editado", id, { nombre: r.data.nombre, eventos: r.data.eventos });
  revalidatePath("/integraciones/webhooks");
  return { ok: true };
}

export async function cambiarWebhookActivo(id: string, activo: boolean): Promise<{ error?: string }> {
  const { ctx, bloqueado } = await admin();
  if (bloqueado) return { error: BLOQUEO };
  const { count } = await prisma.webhook.updateMany({ where: { id, organizationId: ctx.organizationId }, data: { activo } });
  if (!count) return { error: "Webhook no encontrado" };
  await auditar(ctx, activo ? "webhook_activado" : "webhook_desactivado", id);
  revalidatePath("/integraciones/webhooks");
  return {};
}

/** Genera un secreto nuevo (el anterior deja de servir de inmediato) y lo devuelve una sola vez. */
export async function rotarSecreto(id: string): Promise<EstadoWebhook> {
  const { ctx, bloqueado } = await admin();
  if (bloqueado) return { error: BLOQUEO };
  const secreto = generarSecreto();
  const { count } = await prisma.webhook.updateMany({ where: { id, organizationId: ctx.organizationId }, data: { secretoCifrado: cifrar(secreto, secretoServidor()) } });
  if (!count) return { error: "Webhook no encontrado" };
  await auditar(ctx, "webhook_secreto_rotado", id);
  revalidatePath("/integraciones/webhooks");
  return { secreto };
}

export async function eliminarWebhook(id: string): Promise<{ error?: string }> {
  const { ctx, bloqueado } = await admin();
  if (bloqueado) return { error: BLOQUEO };
  const { count } = await prisma.webhook.deleteMany({ where: { id, organizationId: ctx.organizationId } });
  if (!count) return { error: "Webhook no encontrado" };
  await auditar(ctx, "webhook_eliminado", id);
  revalidatePath("/integraciones/webhooks");
  return {};
}

/** Encola un evento webhook.prueba solo para este webhook (aunque esté desactivado o no esté suscrito). */
export async function enviarPrueba(id: string): Promise<{ error?: string }> {
  const { ctx, bloqueado } = await admin();
  if (bloqueado) return { error: BLOQUEO };
  const n = await encolarWebhooks(prisma, { organizationId: ctx.organizationId, evento: "webhook.prueba", datos: { mensaje: "Evento de prueba de dent-view" }, soloWebhookId: id });
  if (!n) return { error: "Webhook no encontrado" };
  await auditar(ctx, "webhook_prueba", id);
  revalidatePath("/integraciones/webhooks");
  return {};
}

/** Vuelve a poner la entrega en cola (mismo id de entrega y payload). */
export async function reenviarEntrega(id: string): Promise<{ error?: string }> {
  const { ctx, bloqueado } = await admin();
  if (bloqueado) return { error: BLOQUEO };
  const { count } = await prisma.webhookEntrega.updateMany({
    where: { id, organizationId: ctx.organizationId, estado: { not: "PENDIENTE" } },
    data: { estado: "PENDIENTE", intentos: 0, proximoIntento: new Date(), error: null, codigoRespuesta: null, entregadoEn: null },
  });
  if (!count) return { error: "La entrega no existe o ya está en cola" };
  await auditar(ctx, "webhook_reenvio", id);
  revalidatePath("/integraciones/webhooks");
  return {};
}
