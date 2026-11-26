"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { contarPeticion } from "@/lib/api-limite";
import { emitirFev, emitirNotaCreditoFe, reintentarDocumento, type ResultadoEmitir } from "@/lib/fe/servicio";
import { ADMIN, GESTION } from "@/lib/roles";
import { exigirContexto, exigirModulo } from "@/lib/sesion";

const idSchema = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
// shortcut: contadores en memoria por proceso; con varias réplicas el tope efectivo se multiplica. Pasar a Redis al escalar.
const limites = new Map<string, { inicio: number; cuenta: number }>();
type R = { error?: string; estado?: string; mensaje?: string };

async function permitido(roles: readonly string[]) {
  const ctx = await exigirContexto(roles);
  await exigirModulo(ctx, "facturacion-electronica");
  if (!contarPeticion(limites, `u:${ctx.usuario.id}`, Date.now(), 20).permitido || !contarPeticion(limites, `o:${ctx.organizationId}`, Date.now(), 60).permitido) return { error: "Demasiados intentos, espera un minuto" } as const;
  return ctx;
}
const respuesta = (r: ResultadoEmitir, facturaId?: string): R => {
  if (facturaId) {
    revalidatePath(`/facturacion/${facturaId}`);
    revalidatePath("/facturacion");
  }
  revalidatePath("/integraciones/facturacion");
  return r.ok ? { estado: r.estado } : { error: r.error };
};

/** Emite la factura electrónica de la cuenta (GESTION). Idempotente. */
export async function emitirFacturaElectronica(facturaId: string): Promise<R> {
  const ctx = await permitido(GESTION);
  if ("error" in ctx) return { error: ctx.error };
  const id = idSchema.safeParse(facturaId);
  if (!id.success) return { error: "Identificador no válido" };
  return respuesta(await emitirFev(id.data, { organizationId: ctx.organizationId, userId: ctx.usuario.id }), id.data);
}

/** Reintenta un documento rechazado o con error (GESTION). */
export async function reintentarDocumentoElectronico(documentoId: string, facturaId: string): Promise<R> {
  const ctx = await permitido(GESTION);
  if ("error" in ctx) return { error: ctx.error };
  const id = idSchema.safeParse(documentoId);
  if (!id.success) return { error: "Identificador no válido" };
  return respuesta(await reintentarDocumento(id.data, { organizationId: ctx.organizationId, userId: ctx.usuario.id }), facturaId);
}

/** Emite la nota crédito electrónica de una nota interna (solo admin, como la nota interna). */
export async function emitirNotaCreditoElectronica(notaCreditoId: string, facturaId: string): Promise<R> {
  const ctx = await permitido(ADMIN);
  if ("error" in ctx) return { error: ctx.error };
  const id = idSchema.safeParse(notaCreditoId);
  if (!id.success) return { error: "Identificador no válido" };
  return respuesta(await emitirNotaCreditoFe(id.data, { organizationId: ctx.organizationId, userId: ctx.usuario.id }), facturaId);
}
