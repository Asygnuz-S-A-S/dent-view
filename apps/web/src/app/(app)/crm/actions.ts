"use server";

import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { esEtapa, ORIGENES, parsearCsvLeads, TIPOS_CONTACTO, MAX_FILAS_CSV } from "@/lib/crm";
import { esGestion } from "@/lib/crm-datos";
import { cambiarEtapaLead, cancelarInscripciones, inscribirManual } from "@/lib/crm-motor-datos";
import { registrarEvento } from "@/lib/eventos";
import { esquemaNumeroDocumento, esquemaTipoDocumento } from "@/lib/pacientes";
import { crearPacienteEnCentro } from "@/lib/pacientes-centro";
import { CLINICOS, GESTION } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

type R = { error?: string };
const refrescar = (leadId?: string) => { revalidatePath("/crm", "layout"); if (leadId) revalidatePath(`/crm/leads/${leadId}`); };
const opc = (max: number) => z.string().trim().max(max).transform((v) => v || null).nullish().transform((v) => v ?? null);
const correoOpc = z.string().trim().toLowerCase().transform((v) => v || null).pipe(z.email("Correo inválido").nullable()).nullish().transform((v) => v ?? null);
const fecha = z.string().trim().refine((s) => !s || /^\d{4}-\d{2}-\d{2}$/.test(s), "Fecha inválida").transform((s) => (s ? new Date(`${s}T12:00:00-05:00`) : null)).nullish().transform((v) => v ?? null);
const valor = z.union([z.number(), z.string()]).nullish().transform((v) => (v === null || v === undefined || v === "" ? null : Number(v))).refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v < 1_000_000_000), "Valor inválido");

/** Lead del centro; el especialista solo accede a los asignados a él (para notas). */
async function leadAccesible(ctx: { organizationId: string; rol: string; usuario: { id: string } }, id: string) {
  return prisma.lead.findFirst({ where: { id, organizationId: ctx.organizationId, ...(ctx.rol === "especialista" ? { responsableId: ctx.usuario.id } : {}) } });
}
async function responsableValido(organizationId: string, id: string | null) {
  return !id || !!(await prisma.member.findFirst({ where: { organizationId, userId: id, role: { in: [...GESTION, "especialista"] } }, select: { id: true } }));
}

const esquemaLead = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre").max(120),
  telefono: opc(30), correo: correoOpc, ciudad: opc(80), interes: opc(120),
  origen: z.enum(ORIGENES), valorEstimado: valor, responsableId: opc(80), proximoContacto: fecha,
  consentimientoMercadeo: z.boolean().default(false),
}).refine((d) => d.telefono || d.correo, { message: "Escribe un teléfono o un correo", path: ["telefono"] });

export async function crearLead(entrada: z.input<typeof esquemaLead>): Promise<R & { id?: string }> {
  const ctx = await exigirContexto(GESTION);
  const p = esquemaLead.safeParse(entrada);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Datos inválidos" };
  const d = p.data;
  if (!(await responsableValido(ctx.organizationId, d.responsableId))) return { error: "Responsable inválido" };
  const lead = await prisma.lead.create({ data: { ...d, organizationId: ctx.organizationId, consentimientoEn: d.consentimientoMercadeo ? new Date() : null } });
  await prisma.actividadLead.create({ data: { organizationId: ctx.organizationId, leadId: lead.id, tipo: "NOTA", texto: "Lead creado manualmente", autorId: ctx.usuario.id } });
  refrescar();
  return { id: lead.id };
}

/** CSV simple: los leads importados NO traen consentimiento de mercadeo (solo seguimiento manual hasta que lo den). */
export async function importarLeads(texto: string): Promise<R & { creados?: number; repetidos?: number; errores?: { fila: number; motivo: string }[] }> {
  const ctx = await exigirContexto(GESTION);
  if (typeof texto !== "string" || texto.length > 2_000_000) return { error: "Archivo demasiado grande" };
  const { validos, errores } = parsearCsvLeads(texto, MAX_FILAS_CSV);
  if (!validos.length) return { error: errores[0]?.motivo ?? "No hay filas válidas", errores };
  const correos = validos.flatMap((v) => (v.correo ? [v.correo] : []));
  const existentes = correos.length ? await prisma.lead.findMany({ where: { organizationId: ctx.organizationId, correo: { in: correos, mode: "insensitive" } }, select: { correo: true } }) : [];
  const ya = new Set(existentes.map((e) => e.correo!.toLowerCase()));
  const nuevos = validos.filter((v) => !v.correo || !ya.has(v.correo));
  await prisma.lead.createMany({ data: nuevos.map((v) => ({ ...v, organizationId: ctx.organizationId })) });
  await registrarEvento({ organizationId: ctx.organizationId, actorId: ctx.usuario.id, tipo: "crm.leads_importados", detalle: { creados: nuevos.length, repetidos: validos.length - nuevos.length, errores: errores.length } });
  refrescar();
  return { creados: nuevos.length, repetidos: validos.length - nuevos.length, errores };
}

export async function moverEtapa(leadId: string, etapa: string): Promise<R> {
  const ctx = await exigirContexto(GESTION);
  if (!esEtapa(etapa) || etapa === "PERDIDO") return { error: "Para marcar como perdido indica el motivo en la ficha del lead" };
  const l = await cambiarEtapaLead(prisma, { organizationId: ctx.organizationId, leadId, etapa, autorId: ctx.usuario.id });
  if (!l) return { error: "Lead no encontrado" };
  refrescar(leadId);
  return {};
}

export async function marcarPerdido(leadId: string, motivo: string): Promise<R> {
  const ctx = await exigirContexto(GESTION);
  const m = z.string().trim().min(3, "Escribe el motivo").max(200).safeParse(motivo);
  if (!m.success) return { error: m.error.issues[0]!.message };
  const l = await cambiarEtapaLead(prisma, { organizationId: ctx.organizationId, leadId, etapa: "PERDIDO", motivoPerdida: m.data, autorId: ctx.usuario.id });
  if (!l) return { error: "Lead no encontrado" };
  refrescar(leadId);
  return {};
}

const esquemaEdicion = z.object({
  nombre: z.string().trim().min(2).max(120), telefono: opc(30), correo: correoOpc, ciudad: opc(80), interes: opc(120),
  valorEstimado: valor, responsableId: opc(80), proximoContacto: fecha,
});
export async function actualizarLead(leadId: string, entrada: z.input<typeof esquemaEdicion>): Promise<R> {
  const ctx = await exigirContexto(GESTION);
  const p = esquemaEdicion.safeParse(entrada);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Datos inválidos" };
  if (!(await responsableValido(ctx.organizationId, p.data.responsableId))) return { error: "Responsable inválido" };
  const { count } = await prisma.lead.updateMany({ where: { id: leadId, organizationId: ctx.organizationId }, data: p.data });
  if (!count) return { error: "Lead no encontrado" };
  refrescar(leadId);
  return {};
}

const esquemaContacto = z.object({ tipo: z.enum(TIPOS_CONTACTO), texto: z.string().trim().max(1000).transform((v) => v || null) });
/** Registrar un contacto marca el primer contacto: un lead «Nuevo» pasa a «Contactado» (y se cancelan las secuencias de «sin respuesta»). */
export async function registrarContacto(leadId: string, entrada: z.input<typeof esquemaContacto>): Promise<R> {
  const ctx = await exigirContexto(GESTION);
  const p = esquemaContacto.safeParse(entrada);
  if (!p.success) return { error: "Datos inválidos" };
  const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId: ctx.organizationId }, select: { id: true, etapa: true } });
  if (!lead) return { error: "Lead no encontrado" };
  await prisma.$transaction(async (tx) => {
    await tx.actividadLead.create({ data: { organizationId: ctx.organizationId, leadId, tipo: p.data.tipo, texto: p.data.texto, autorId: ctx.usuario.id } });
    await tx.lead.update({ where: { id: leadId }, data: { ultimoContactoEn: new Date() } });
    if (lead.etapa === "NUEVO") await cambiarEtapaLead(tx, { organizationId: ctx.organizationId, leadId, etapa: "CONTACTADO", autorId: ctx.usuario.id });
  });
  refrescar(leadId);
  return {};
}

/** Notas: gestión en cualquier lead; el especialista solo en los suyos. */
export async function agregarNota(leadId: string, texto: string): Promise<R> {
  const ctx = await exigirContexto(CLINICOS);
  const t = z.string().trim().min(1, "Escribe la nota").max(1000).safeParse(texto);
  if (!t.success) return { error: t.error.issues[0]!.message };
  if (!(await leadAccesible(ctx, leadId))) return { error: "Lead no encontrado" };
  await prisma.actividadLead.create({ data: { organizationId: ctx.organizationId, leadId, tipo: "NOTA", texto: t.data, autorId: ctx.usuario.id } });
  refrescar(leadId);
  return {};
}

const esquemaTarea = z.object({ leadId: z.string().min(1), titulo: z.string().trim().min(3, "Escribe el título").max(150), vence: fecha, asignadoId: opc(80) });
export async function crearTarea(entrada: z.input<typeof esquemaTarea>): Promise<R> {
  const ctx = await exigirContexto(GESTION);
  const p = esquemaTarea.safeParse(entrada);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Datos inválidos" };
  if (!(await leadAccesible(ctx, p.data.leadId))) return { error: "Lead no encontrado" };
  if (!(await responsableValido(ctx.organizationId, p.data.asignadoId))) return { error: "Responsable inválido" };
  await prisma.tareaCRM.create({ data: { organizationId: ctx.organizationId, ...p.data } });
  await prisma.actividadLead.create({ data: { organizationId: ctx.organizationId, leadId: p.data.leadId, tipo: "TAREA", texto: `Tarea creada: ${p.data.titulo}`, autorId: ctx.usuario.id } });
  refrescar(p.data.leadId);
  return {};
}

export async function completarTarea(tareaId: string, hecha = true): Promise<R> {
  const ctx = await exigirContexto(CLINICOS);
  const t = await prisma.tareaCRM.findFirst({ where: { id: tareaId, organizationId: ctx.organizationId } });
  if (!t || (!esGestion(ctx.rol) && t.asignadoId !== ctx.usuario.id)) return { error: "Tarea no encontrada" };
  await prisma.tareaCRM.update({ where: { id: t.id }, data: hecha ? { estado: "HECHA", completadaEn: new Date() } : { estado: "PENDIENTE", completadaEn: null } });
  refrescar(t.leadId ?? undefined);
  return {};
}

export async function fijarNoContactar(leadId: string, noContactar: boolean): Promise<R> {
  const ctx = await exigirContexto(GESTION);
  const l = await prisma.lead.findFirst({ where: { id: leadId, organizationId: ctx.organizationId }, select: { id: true } });
  if (!l) return { error: "Lead no encontrado" };
  await prisma.$transaction(async (tx) => {
    await tx.lead.update({ where: { id: leadId }, data: noContactar ? { noContactar: true, consentimientoMercadeo: false } : { noContactar: false } });
    if (noContactar) await cancelarInscripciones(tx, { organizationId: ctx.organizationId, leadId }, "no_contactar");
    await tx.actividadLead.create({ data: { organizationId: ctx.organizationId, leadId, tipo: "NOTA", texto: noContactar ? "Marcado como «no contactar»" : "Se quitó la marca «no contactar»", autorId: ctx.usuario.id } });
  });
  await registrarEvento({ organizationId: ctx.organizationId, actorId: ctx.usuario.id, tipo: "crm.no_contactar", detalle: { leadId, noContactar } });
  refrescar(leadId);
  return {};
}

/** Registra que la persona aceptó recibir información comercial (consentimiento de mercadeo del lead). */
export async function fijarConsentimiento(leadId: string, otorgado: boolean): Promise<R> {
  const ctx = await exigirContexto(GESTION);
  const { count } = await prisma.lead.updateMany({ where: { id: leadId, organizationId: ctx.organizationId, noContactar: false }, data: { consentimientoMercadeo: otorgado, consentimientoEn: otorgado ? new Date() : null } });
  if (!count) return { error: "No se pudo actualizar (¿está marcado como «no contactar»?)" };
  await prisma.actividadLead.create({ data: { organizationId: ctx.organizationId, leadId, tipo: "NOTA", texto: otorgado ? "Se registró el consentimiento de mercadeo" : "Se retiró el consentimiento de mercadeo", autorId: ctx.usuario.id } });
  await registrarEvento({ organizationId: ctx.organizationId, actorId: ctx.usuario.id, tipo: "crm.consentimiento", detalle: { leadId, otorgado } });
  refrescar(leadId);
  return {};
}

const esquemaConversion = z.object({ tipoDocumento: esquemaTipoDocumento, numeroDocumento: esquemaNumeroDocumento });
/** Convierte el lead en paciente reutilizando crearPacienteEnCentro (misma lógica de alta que /pacientes). Si ya existía, lo vincula. */
export async function convertirEnPaciente(leadId: string, entrada: z.input<typeof esquemaConversion>): Promise<R & { pacienteId?: string; vinculado?: boolean }> {
  const ctx = await exigirContexto(GESTION);
  const p = esquemaConversion.safeParse(entrada);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Documento inválido" };
  const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId: ctx.organizationId } });
  if (!lead) return { error: "Lead no encontrado" };
  if (lead.pacienteId) return { error: "Este lead ya es paciente" };
  const r = await crearPacienteEnCentro(ctx.organizationId, p.data, { nombre: lead.nombre, celular: lead.telefono, correo: lead.correo, notas: lead.interes ? `Interés al llegar como lead: ${lead.interes}` : null });
  const pacienteId = "existente" in r ? r.existente : r.creado.id;
  await prisma.$transaction(async (tx) => {
    // Lo que la persona ya había dicho sobre su contacto viaja con ella: consentimiento de mercadeo y «no contactar» (misma regla de pacientes).
    if (lead.noContactar) await tx.preferenciaContacto.upsert({ where: { pacienteId }, update: { noContactar: true }, create: { pacienteId, organizationId: ctx.organizationId, noContactar: true } });
    else if (lead.consentimientoMercadeo) await tx.autorizacion.create({ data: { organizationId: ctx.organizationId, pacienteId, tipo: "DATOS", finalidad: "mercadeo", otorgada: true, otorgadaEn: lead.consentimientoEn ?? new Date(), textoMostrado: "Consentimiento registrado cuando era lead", registradoPorId: ctx.usuario.id } });
    await tx.lead.update({ where: { id: leadId }, data: { pacienteId } });
    await cambiarEtapaLead(tx, { organizationId: ctx.organizationId, leadId, etapa: "GANADO", autorId: ctx.usuario.id });
    await cancelarInscripciones(tx, { organizationId: ctx.organizationId, leadId }, "convertido");
    await tx.actividadLead.create({ data: { organizationId: ctx.organizationId, leadId, tipo: "NOTA", texto: "existente" in r ? "Vinculado a un paciente que ya existía" : "Convertido en paciente", autorId: ctx.usuario.id } });
  });
  if (!("existente" in r)) await registrarEvento({ organizationId: ctx.organizationId, pacienteId, actorId: ctx.usuario.id, tipo: "paciente.creado", detalle: { origen: "crm" } });
  refrescar(leadId);
  revalidatePath("/pacientes");
  return { pacienteId, vinculado: "existente" in r };
}

export async function inscribirEnSecuencia(secuenciaId: string, ref: { leadId?: string; pacienteId?: string }): Promise<R> {
  const ctx = await exigirContexto(GESTION);
  if (!!ref.leadId === !!ref.pacienteId) return { error: "Datos inválidos" };
  const r = await inscribirManual(ctx.organizationId, secuenciaId, ref);
  if ("error" in r) return r;
  refrescar(ref.leadId);
  revalidatePath("/crm/secuencias");
  return {};
}
