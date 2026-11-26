"use server";

import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { registrarEvento } from "@/lib/eventos";
import { ESTADOS_ORDEN, numeroOrden, transicionValida } from "@/lib/ordenes";
import { crearOrdenEnCentro, esquemaOrden } from "@/lib/ordenes-servicio";
import { esquemaNumeroDocumento, esquemaTipoDocumento } from "@/lib/pacientes";
import { crearPacienteEnCentro } from "@/lib/pacientes-centro";
import { CLINICOS, GESTION, MEDICOS } from "@/lib/roles";
import { errorDiagnosticos, esquemaRips, permitidosParaRol } from "@/lib/rips/esquema";
import type { Hallazgo } from "@/lib/rips/generar";
import { generarYGuardarRips } from "@/lib/rips/servicio";
import { exigirContexto, exigirModulo } from "@/lib/sesion";

const CREADORES = [...GESTION, "doctor_remitente"] as const;

export type ResultadoOrden = { error: string } | { id: string };

export async function crearOrden(entrada: z.input<typeof esquemaOrden>, remisionId?: string): Promise<ResultadoOrden> {
  const ctx = await exigirContexto(CREADORES);
  const r = esquemaOrden.safeParse(entrada);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const esDoctor = ctx.rol === "doctor_remitente";
  // Orden de una remisión: la reclama el centro destino (RECIBIDA -> EN_PROCESO, una sola vez, para el paciente de la copia mínima).
  if (remisionId) {
    if (esDoctor) return { error: "Solo el personal del centro crea la orden de una remisión" };
    await exigirModulo(ctx, "remisiones");
    const { count } = await prisma.remision.updateMany({
      where: { id: remisionId, destinoId: ctx.organizationId, estado: "RECIBIDA", ordenDestinoId: null, pacienteDestinoId: r.data.pacienteId },
      data: { estado: "EN_PROCESO" },
    });
    if (count !== 1) return { error: "La remisión ya no está disponible para crear la orden" };
  }
  // Un doctor remitente siempre crea a su nombre; recepción/admin eligen uno (opcional) del centro.
  const revertir = () => remisionId ? prisma.remision.updateMany({ where: { id: remisionId, destinoId: ctx.organizationId, estado: "EN_PROCESO", ordenDestinoId: null }, data: { estado: "RECIBIDA" } }) : null;
  let res;
  try {
    res = await crearOrdenEnCentro({
      organizationId: ctx.organizationId,
      actorId: ctx.usuario.id,
      esDoctor,
      datos: { ...r.data, doctorId: esDoctor ? ctx.usuario.id : r.data.doctorId },
      detalleEvento: remisionId ? { remisionId } : undefined,
    });
  } catch (e) {
    await revertir();
    throw e;
  }
  if ("error" in res) {
    await revertir();
    return res;
  }
  if (remisionId) {
    await prisma.remision.updateMany({ where: { id: remisionId, destinoId: ctx.organizationId, estado: "EN_PROCESO" }, data: { ordenDestinoId: res.id } });
    await prisma.remisionEvento.create({ data: { remisionId, organizationId: ctx.organizationId, actorId: ctx.usuario.id, tipo: "EN_PROCESO", nota: `orden ${res.id}` } });
    revalidatePath(`/remisiones/${remisionId}`);
  }
  revalidatePath("/ordenes");
  return { id: res.id };
}

const esquemaPaciente = z.object({
  tipoDocumento: esquemaTipoDocumento,
  numeroDocumento: esquemaNumeroDocumento,
  nombre: z.string().trim().min(2, "Falta el nombre"),
  celular: z.string().trim().optional(),
});

/** Crea (o vincula, si el documento ya existe en el centro) un paciente en el centro activo. */
export async function crearPacienteRapido(entrada: { tipoDocumento: string; numeroDocumento: string; nombre: string; celular?: string }) {
  const ctx = await exigirContexto(CREADORES);
  const r = esquemaPaciente.safeParse(entrada);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" } as const;
  const { tipoDocumento, numeroDocumento, nombre, celular } = r.data;
  const res = await crearPacienteEnCentro(ctx.organizationId, { tipoDocumento, numeroDocumento }, { nombre, celular: celular || null });
  const id = "existente" in res ? res.existente : res.creado.id;
  if ("creado" in res) {
    await registrarEvento({ organizationId: ctx.organizationId, pacienteId: id, actorId: ctx.usuario.id, tipo: "paciente.creado", detalle: { origen: "orden" } });
  }
  // Devuelve lo enviado (no lo guardado) para no exponer datos preexistentes a un doctor.
  return { paciente: { id, nombre, documento: `${tipoDocumento} ${numeroDocumento}` } } as const;
}

export async function cambiarEstadoOrden(id: string, estado: string): Promise<{ error?: string }> {
  const ctx = await exigirContexto(CLINICOS);
  if (!(ESTADOS_ORDEN as readonly string[]).includes(estado)) return { error: "Estado inválido" };
  const orden = await prisma.orden.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!orden) return { error: "Orden no encontrada" };
  const nuevo = estado as (typeof ESTADOS_ORDEN)[number];
  if (!transicionValida(orden.estado, nuevo)) return { error: `No se puede pasar de ${orden.estado} a ${nuevo}` };
  await prisma.$transaction(async (tx) => {
    await tx.orden.update({ where: { id }, data: { estado: nuevo } });
    await registrarEvento(
      { organizationId: ctx.organizationId, pacienteId: orden.pacienteId, actorId: ctx.usuario.id, tipo: "orden.estado", detalle: { ordenId: id, orden: numeroOrden(orden.numero), de: orden.estado, a: nuevo } },
      tx,
    );
  });
  revalidatePath("/ordenes");
  revalidatePath(`/ordenes/${id}`);
  return {};
}

/** Guarda los datos RIPS de la orden. Los campos clínicos (diagnóstico, finalidad) solo se aplican si el rol es médico. */
export async function guardarRips(ordenId: string, entrada: z.input<typeof esquemaRips>): Promise<{ error?: string }> {
  const ctx = await exigirContexto(CLINICOS);
  const r = esquemaRips.safeParse(entrada);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const config = await prisma.configFacturacion.findUnique({ where: { organizationId: ctx.organizationId }, select: { generaRips: true } });
  if (!config?.generaRips) return { error: "El centro no genera RIPS" };
  const orden = await prisma.orden.findFirst({ where: { id: ordenId, organizationId: ctx.organizationId }, include: { items: { select: { id: true } } } });
  if (!orden) return { error: "Orden no encontrada" };
  if (orden.estado === "CANCELADA") return { error: "La orden está cancelada" };
  const { items, ...d } = permitidosParaRol(ctx.rol, r.data);
  const dx = errorDiagnosticos(d.diagnosticoPrincipal === undefined ? orden.diagnosticoPrincipal : d.diagnosticoPrincipal, d.diagnosticosRelacionados ?? orden.diagnosticosRelacionados);
  if (dx) return { error: dx };
  const idsOrden = new Set(orden.items.map((i) => i.id));
  if (items?.some((i) => !idsOrden.has(i.id))) return { error: "Servicio de la orden no válido" };
  if (d.profesionalAtiendeId) {
    const m = await prisma.member.findUnique({ where: { organizationId_userId: { organizationId: ctx.organizationId, userId: d.profesionalAtiendeId } } });
    if (!m || !(MEDICOS as readonly string[]).includes(m.role)) return { error: "Profesional no válido" };
  }
  await prisma.$transaction(async (tx) => {
    await tx.orden.update({ where: { id: ordenId }, data: { ...d, ripsActualizadoEn: new Date() } });
    for (const i of items ?? []) await tx.ordenItem.update({ where: { id: i.id }, data: { codigoCups: i.codigoCups, tipoRips: i.tipoRips } });
    await registrarEvento(
      { organizationId: ctx.organizationId, pacienteId: orden.pacienteId, actorId: ctx.usuario.id, tipo: "orden.rips_actualizado", detalle: { ordenId, orden: numeroOrden(orden.numero), campos: Object.keys(d), items: items?.length ?? 0 } },
      tx,
    );
  });
  revalidatePath("/ordenes");
  revalidatePath(`/ordenes/${ordenId}`);
  return {};
}

export type ResultadoValidacionRips = { error: string } | { ok: boolean; errores: Hallazgo[]; advertencias: Hallazgo[] };

/** "Generar y validar": valida localmente y, si no hay errores, guarda el JSON (EnvioRips). Validado local no es aprobado por el Ministerio. */
export async function generarRipsOrden(ordenId: string): Promise<ResultadoValidacionRips> {
  const ctx = await exigirContexto(CLINICOS);
  const r = await generarYGuardarRips({ organizationId: ctx.organizationId, actorId: ctx.usuario.id, ordenId });
  if (r.estado === "no_encontrada") return { error: "Orden no encontrada" };
  if (r.estado === "desactivado") return { error: "El centro no genera RIPS" };
  if (r.estado === "sin_almacenamiento") return { error: "No se pudo guardar el archivo RIPS; reintenta" };
  revalidatePath(`/ordenes/${ordenId}`);
  return { ok: r.estado === "ok", errores: r.errores, advertencias: r.advertencias };
}
