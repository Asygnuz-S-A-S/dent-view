"use server";

import { Prisma, prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ACCIONES, DISPARADORES, ETAPAS, ORIGENES, PLANTILLAS_SECUENCIA, type PlantillaSecuencia } from "@/lib/crm";
import { simularSecuencia, type FilaSimulacion } from "@/lib/crm-motor-datos";
import { renderVariables } from "@/lib/crm-motor";
import { CID_LOGO, renderCorreo } from "@/lib/correo/plantilla";
import { marcaDeCentro } from "@/lib/correo/marca";
import { registrarEvento } from "@/lib/eventos";
import { GESTION } from "@/lib/roles";
import { exigirContexto, exigirModulo } from "@/lib/sesion";

type R = { error?: string };
const refrescar = () => revalidatePath("/crm/secuencias", "layout");

const paso = z.object({
  esperaDias: z.number().int().min(0).max(365), esperaHoras: z.number().int().min(0).max(23),
  accion: z.enum(ACCIONES),
  asunto: z.string().trim().max(150).nullish(), cuerpo: z.string().trim().max(3000).nullish(),
  etapaDestino: z.enum(ETAPAS).nullish(), tareaTitulo: z.string().trim().max(150).nullish(),
}).superRefine((p, c) => {
  if (p.accion === "CORREO" && (!p.asunto || !p.cuerpo)) c.addIssue({ code: "custom", message: "Cada paso de correo necesita asunto y cuerpo" });
  if (p.accion === "TAREA" && !p.tareaTitulo) c.addIssue({ code: "custom", message: "Cada paso de tarea necesita un título" });
  if (p.accion === "CAMBIAR_ETAPA" && !p.etapaDestino) c.addIssue({ code: "custom", message: "Elige la etapa de destino" });
});
const esquema = z.object({
  nombre: z.string().trim().min(3, "Escribe un nombre (mínimo 3 letras)").max(80),
  descripcion: z.string().trim().max(300).nullish(),
  disparador: z.enum(DISPARADORES),
  diasInactividad: z.number().int().min(1).max(1500).nullish(),
  filtro: z.object({ origen: z.enum(ORIGENES).nullish(), interes: z.string().trim().max(80).nullish(), enlace: z.string().trim().max(500).nullish(), transaccional: z.boolean().nullish() }),
  pasos: z.array(paso).min(1, "Agrega al menos un paso").max(12, "Máximo 12 pasos"),
});
export type EntradaSecuencia = z.input<typeof esquema>;

const filtroJson = (f: z.output<typeof esquema>["filtro"], disparador: string) => {
  const enlace = f.enlace && /^https?:\/\/[^\s<>"']+$/i.test(f.enlace) ? f.enlace : null;
  const lead = disparador.startsWith("LEAD_");
  const j = { ...(lead && f.origen ? { origen: f.origen } : {}), ...(lead && f.interes ? { interes: f.interes } : {}), ...(enlace ? { enlace } : {}), ...(f.transaccional && disparador === "VALORACION_COMPLETADA" ? { transaccional: true } : {}) };
  return Object.keys(j).length ? j : undefined;
};
const datosPasos = (organizationId: string, secuenciaId: string, pasos: z.output<typeof esquema>["pasos"]) =>
  pasos.map((p, orden) => ({
    organizationId, secuenciaId, orden, esperaDias: p.esperaDias, esperaHoras: p.esperaHoras, accion: p.accion,
    asunto: p.accion === "CORREO" ? p.asunto : null, cuerpo: p.accion === "CORREO" ? p.cuerpo : null,
    etapaDestino: p.accion === "CAMBIAR_ETAPA" ? p.etapaDestino : null, tareaTitulo: p.accion === "TAREA" ? p.tareaTitulo : null,
  }));

export async function instalarPlantilla(clave: string): Promise<R & { id?: string }> {
  const ctx = await exigirContexto(GESTION);
  await exigirModulo(ctx, "crm");
  const pl: PlantillaSecuencia | undefined = PLANTILLAS_SECUENCIA.find((p) => p.clave === clave);
  if (!pl) return { error: "Plantilla no encontrada" };
  const s = await prisma.secuenciaCRM.create({
    data: {
      organizationId: ctx.organizationId, nombre: pl.nombre, descripcion: pl.descripcion, disparador: pl.disparador, diasInactividad: pl.diasInactividad ?? null,
      filtro: pl.filtro ? { ...pl.filtro } : undefined, activa: false, creadaPorId: ctx.usuario.id,
      pasos: { create: pl.pasos.map((p, orden) => ({ organizationId: ctx.organizationId, orden, esperaDias: p.esperaDias, esperaHoras: p.esperaHoras ?? 0, accion: p.accion, asunto: p.asunto, cuerpo: p.cuerpo, etapaDestino: p.etapaDestino, tareaTitulo: p.tareaTitulo })) },
    },
  });
  await registrarEvento({ organizationId: ctx.organizationId, actorId: ctx.usuario.id, tipo: "crm.secuencia_instalada", detalle: { secuenciaId: s.id, plantilla: clave } });
  refrescar();
  return { id: s.id };
}

/** Crea (sin id) o actualiza una secuencia con todos sus pasos. Las secuencias nuevas nacen inactivas. */
export async function guardarSecuencia(id: string | null, entrada: EntradaSecuencia): Promise<R & { id?: string }> {
  const ctx = await exigirContexto(GESTION);
  await exigirModulo(ctx, "crm");
  const p = esquema.safeParse(entrada);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Datos inválidos" };
  const d = p.data;
  const umbral = d.disparador === "LEAD_SIN_RESPUESTA" || d.disparador === "PACIENTE_INACTIVO";
  if (umbral && !d.diasInactividad) return { error: "Indica el umbral de días" };
  const base = { nombre: d.nombre, descripcion: d.descripcion || null, disparador: d.disparador, diasInactividad: umbral ? d.diasInactividad! : null, };
  const filtro = filtroJson(d.filtro, d.disparador);
  const org = ctx.organizationId;
  const resultado = await prisma.$transaction(async (tx) => {
    if (id) {
      const existe = await tx.secuenciaCRM.findFirst({ where: { id, organizationId: org }, select: { id: true } });
      if (!existe) return null;
      await tx.secuenciaCRM.update({ where: { id }, data: { ...base, filtro: filtro ?? Prisma.DbNull } });
      await tx.pasoSecuencia.deleteMany({ where: { secuenciaId: id } });
      await tx.pasoSecuencia.createMany({ data: datosPasos(org, id, d.pasos) });
      return id;
    }
    const s = await tx.secuenciaCRM.create({ data: { ...base, filtro, organizationId: org, activa: false, creadaPorId: ctx.usuario.id } });
    await tx.pasoSecuencia.createMany({ data: datosPasos(org, s.id, d.pasos) });
    return s.id;
  });
  if (!resultado) return { error: "Secuencia no encontrada" };
  refrescar();
  return { id: resultado };
}

export async function activarSecuencia(id: string, activa: boolean): Promise<R> {
  const ctx = await exigirContexto(GESTION);
  await exigirModulo(ctx, "crm");
  const s = await prisma.secuenciaCRM.findFirst({ where: { id, organizationId: ctx.organizationId }, include: { _count: { select: { pasos: true } } } });
  if (!s) return { error: "Secuencia no encontrada" };
  if (activa && s._count.pasos === 0) return { error: "Agrega al menos un paso antes de activarla" };
  await prisma.secuenciaCRM.update({ where: { id }, data: { activa } });
  await registrarEvento({ organizationId: ctx.organizationId, actorId: ctx.usuario.id, tipo: activa ? "crm.secuencia_activada" : "crm.secuencia_desactivada", detalle: { secuenciaId: id } });
  refrescar();
  return {};
}

export async function eliminarSecuencia(id: string): Promise<R> {
  const ctx = await exigirContexto(GESTION);
  await exigirModulo(ctx, "crm");
  const { count } = await prisma.secuenciaCRM.deleteMany({ where: { id, organizationId: ctx.organizationId } });
  if (!count) return { error: "Secuencia no encontrada" };
  await registrarEvento({ organizationId: ctx.organizationId, actorId: ctx.usuario.id, tipo: "crm.secuencia_eliminada", detalle: { secuenciaId: id } });
  refrescar();
  return {};
}

export async function simular(id: string): Promise<R & { filas?: FilaSimulacion[]; total?: number }> {
  const ctx = await exigirContexto(GESTION);
  await exigirModulo(ctx, "crm");
  const r = await simularSecuencia(ctx.organizationId, id);
  return r ?? { error: "Secuencia no encontrada" };
}

/** Vista previa del correo con la marca del centro (HTML ya escapado por renderCorreo; el logo en línea se sirve como data URL). */
export async function previsualizar(asunto: string, cuerpo: string, enlace?: string): Promise<{ html: string }> {
  const ctx = await exigirContexto(GESTION);
  await exigirModulo(ctx, "crm");
  const marca = await marcaDeCentro(ctx.organizationId);
  const vars = { nombre: "Ana", centro: marca.nombre, enlace: enlace && /^https?:\/\/[^\s<>"']+$/i.test(enlace) ? enlace : "" };
  const a = renderVariables(String(asunto).slice(0, 150), vars), c = renderVariables(String(cuerpo).slice(0, 3000), vars);
  const { html, logo } = renderCorreo({
    asunto: a, cuerpo: c, marca,
    vista: { titulo: a, ...(vars.enlace ? { boton: { texto: "Abrir enlace", url: vars.enlace } } : {}), aviso: "Aquí irá el enlace de baja con el que la persona puede dejar de recibir estos mensajes." },
  });
  return { html: logo ? html.replace(`cid:${CID_LOGO}`, `data:${logo.contentType};base64,${logo.datos.toString("base64")}`) : html };
}
