"use server";

import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { esFecha } from "@/lib/agenda";
import { registrarEvento } from "@/lib/eventos";
import { ADMIN, GESTION } from "@/lib/roles";
import { CANALES_DOCTOR, ESTADOS_ABIERTOS, ESTADOS_SEG_DOCTOR, MOTIVOS_SEG_DOCTOR, validarUmbrales, type EstadoSegDoctor } from "@/lib/seguimiento-doctores";
import { generarSeguimientos } from "@/lib/seguimiento-doctores-datos";
import { exigirContexto, exigirModulo } from "@/lib/sesion";

type R = { error?: string };
const ABIERTOS = [...ESTADOS_ABIERTOS] as EstadoSegDoctor[];
const refrescar = (doctorId?: string) => { revalidatePath("/seguimiento-doctores"); if (doctorId) revalidatePath(`/seguimiento-doctores/${doctorId}`); };

const fechaOpc = z.string().trim().refine((s) => !s || esFecha(s), "Fecha inválida").transform((s) => (s ? new Date(`${s}T12:00:00-05:00`) : null)).nullish();
// Sin datos clínicos ni de pacientes: solo gestión comercial con el doctor.
const nota = z.string().trim().max(500).transform((s) => s || null).nullish();

async function doctorDelCentro(organizationId: string, doctorId: string) {
  return prisma.member.findFirst({ where: { organizationId, userId: doctorId, role: "doctor_remitente" }, select: { userId: true } });
}
async function responsableValido(organizationId: string, id: string | null | undefined) {
  if (!id) return true;
  return !!(await prisma.member.findFirst({ where: { organizationId, userId: id, role: { in: [...GESTION] } }, select: { id: true } }));
}

const esquemaNuevo = z.object({
  doctorId: z.string().min(1), motivo: z.enum(MOTIVOS_SEG_DOCTOR).default("OTRO"),
  responsableId: z.string().nullish(), proximoContacto: fechaOpc, nota,
});
export async function crearSeguimientoDoctor(entrada: z.input<typeof esquemaNuevo>): Promise<R> {
  const ctx = await exigirContexto(GESTION);
  await exigirModulo(ctx, "seguimiento-doctores");
  const r = esquemaNuevo.safeParse(entrada);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const d = r.data, org = ctx.organizationId;
  if (!(await doctorDelCentro(org, d.doctorId))) return { error: "Doctor no encontrado" };
  if (!(await responsableValido(org, d.responsableId))) return { error: "Responsable inválido" };
  const res = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`seg-doctores:${org}`}))`;
    if (await tx.seguimientoDoctor.findFirst({ where: { organizationId: org, doctorId: d.doctorId, estado: { in: ABIERTOS } }, select: { id: true } })) return { error: "El doctor ya tiene un seguimiento abierto" };
    const s = await tx.seguimientoDoctor.create({ data: { organizationId: org, doctorId: d.doctorId, motivo: d.motivo, responsableId: d.responsableId || null, proximoContacto: d.proximoContacto ?? null, nota: d.nota ?? null } });
    await registrarEvento({ organizationId: org, actorId: ctx.usuario.id, tipo: "seguimiento_doctor.creado", detalle: { seguimientoId: s.id, doctorId: d.doctorId, motivo: d.motivo } }, tx);
    return {};
  });
  refrescar(d.doctorId);
  return res;
}

const esquemaCambio = z.object({ estado: z.enum(ESTADOS_SEG_DOCTOR), responsableId: z.string().nullish(), proximoContacto: fechaOpc, nota });
export async function actualizarSeguimientoDoctor(id: string, entrada: z.input<typeof esquemaCambio>): Promise<R> {
  const ctx = await exigirContexto(GESTION);
  await exigirModulo(ctx, "seguimiento-doctores");
  const r = esquemaCambio.safeParse(entrada);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const org = ctx.organizationId;
  const s = await prisma.seguimientoDoctor.findFirst({ where: { id, organizationId: org } });
  if (!s) return { error: "Seguimiento no encontrado" };
  if (!ABIERTOS.includes(s.estado as EstadoSegDoctor)) return { error: "El seguimiento ya está cerrado" };
  if (!(await responsableValido(org, r.data.responsableId))) return { error: "Responsable inválido" };
  const cierra = !ABIERTOS.includes(r.data.estado);
  await prisma.$transaction(async (tx) => {
    await tx.seguimientoDoctor.update({ where: { id }, data: { estado: r.data.estado, responsableId: r.data.responsableId || null, proximoContacto: r.data.proximoContacto ?? null, nota: r.data.nota ?? null, cerradoEn: cierra ? new Date() : null } });
    await registrarEvento({ organizationId: org, actorId: ctx.usuario.id, tipo: "seguimiento_doctor.actualizado", detalle: { seguimientoId: id, doctorId: s.doctorId, de: s.estado, a: r.data.estado } }, tx);
  });
  refrescar(s.doctorId);
  return {};
}

const esquemaContacto = z.object({
  doctorId: z.string().min(1), seguimientoId: z.string().nullish(), canal: z.enum(CANALES_DOCTOR),
  resultado: z.string().trim().max(120).transform((s) => s || null).nullish(), nota,
});
/** Bitácora de gestiones con el doctor; si hay tarea pendiente la pasa a CONTACTADO. Auditado con Evento. */
export async function registrarContactoDoctor(entrada: z.input<typeof esquemaContacto>): Promise<R> {
  const ctx = await exigirContexto(GESTION);
  await exigirModulo(ctx, "seguimiento-doctores");
  const r = esquemaContacto.safeParse(entrada);
  if (!r.success) return { error: "Datos inválidos" };
  const d = r.data, org = ctx.organizationId;
  if (!(await doctorDelCentro(org, d.doctorId))) return { error: "Doctor no encontrado" };
  const seg = d.seguimientoId ? await prisma.seguimientoDoctor.findFirst({ where: { id: d.seguimientoId, organizationId: org, doctorId: d.doctorId } }) : null;
  if (d.seguimientoId && !seg) return { error: "Seguimiento no encontrado" };
  await prisma.$transaction(async (tx) => {
    const c = await tx.contactoDoctor.create({ data: { organizationId: org, doctorId: d.doctorId, seguimientoId: seg?.id ?? null, canal: d.canal, resultado: d.resultado ?? null, nota: d.nota ?? null, registradoPorId: ctx.usuario.id } });
    if (seg?.estado === "PENDIENTE") await tx.seguimientoDoctor.update({ where: { id: seg.id }, data: { estado: "CONTACTADO" } });
    await registrarEvento({ organizationId: org, actorId: ctx.usuario.id, tipo: "seguimiento_doctor.contacto", detalle: { contactoId: c.id, doctorId: d.doctorId, canal: d.canal, seguimientoId: seg?.id ?? null } }, tx);
  });
  refrescar(d.doctorId);
  return {};
}

export async function generarSeguimientosDoctores(): Promise<R & { creados?: number }> {
  const ctx = await exigirContexto(GESTION);
  await exigirModulo(ctx, "seguimiento-doctores");
  const creados = await generarSeguimientos(ctx.organizationId, ctx.usuario.id);
  refrescar();
  return { creados };
}

const esquemaUmbrales = z.object({ umbralRiesgoFactor: z.number(), diasInactivo: z.number(), diasInactivoCritico: z.number() });
export async function guardarUmbralesDoctores(entrada: z.input<typeof esquemaUmbrales>): Promise<R> {
  const ctx = await exigirContexto(ADMIN);
  await exigirModulo(ctx, "seguimiento-doctores");
  const r = esquemaUmbrales.safeParse(entrada);
  if (!r.success) return { error: "Datos inválidos" };
  const error = validarUmbrales(r.data);
  if (error) return { error };
  await prisma.configSeguimientoDoctor.upsert({ where: { organizationId: ctx.organizationId }, create: { organizationId: ctx.organizationId, ...r.data }, update: r.data });
  await registrarEvento({ organizationId: ctx.organizationId, actorId: ctx.usuario.id, tipo: "seguimiento_doctor.umbrales", detalle: r.data });
  refrescar();
  return {};
}
