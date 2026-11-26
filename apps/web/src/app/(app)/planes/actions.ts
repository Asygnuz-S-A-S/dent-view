"use server";

import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { registrarEvento } from "@/lib/eventos";
import { GESTION } from "@/lib/roles";
import { esquemaAnticipoPlan, esquemaPlanManual, itemsDeCotizacion, puedeCancelarPlan, totalItems, type EntradaPlanManual, type EstadoItemPlan } from "@/lib/planes";
import { contextoPlanes, planDelCentro } from "@/lib/planes-servidor";
import { hoyBogota, resolverPrecio } from "@/lib/precios";
import { ambitoPresupuestos } from "@/lib/presupuestos-servidor";
import { exigirModulo } from "@/lib/sesion";

type D<T> = { error: string } | T;

/** Plan a partir de una cotización aceptada: congela el precio neto de cada ítem del catálogo. Un plan por cotización. */
export async function crearPlanDePresupuesto(presupuestoId: string): Promise<D<{ id: string }>> {
  const ctx = await contextoPlanes();
  await exigirModulo(ctx, "presupuestos");
  const org = ctx.organizationId;
  const p = await prisma.presupuesto.findFirst({ where: { id: presupuestoId, ...ambitoPresupuestos(ctx) }, include: { items: true } });
  if (!p) return { error: "Cotización no encontrada" };
  if (p.estado !== "ACEPTADO" || p.ordenId) return { error: "El plan se crea desde una cotización aceptada que aún no se convirtió en orden." };
  const { items, libres } = itemsDeCotizacion(p.items);
  if (!items.length) return { error: "La cotización no tiene ítems del catálogo para el plan." };
  const existente = await prisma.planTratamiento.findFirst({ where: { organizationId: org, presupuestoId: p.id }, select: { id: true } });
  if (existente) return { error: "Esta cotización ya tiene un plan de tratamiento." };
  try {
    const plan = await prisma.$transaction(async (tx) => {
      const creado = await tx.planTratamiento.create({ data: { organizationId: org, pacienteId: p.pacienteId, presupuestoId: p.id, titulo: p.titulo, total: totalItems(items), creadoPorId: ctx.usuario.id } });
      await tx.planItem.createMany({ data: items.map((i) => ({ ...i, organizationId: org, planId: creado.id })) });
      await registrarEvento({ organizationId: org, pacienteId: p.pacienteId, actorId: ctx.usuario.id, tipo: "plan.creado", detalle: { planId: creado.id, presupuestoId: p.id, total: creado.total, items: items.length, libresFuera: libres } }, tx);
      return creado;
    });
    revalidatePath("/planes");
    revalidatePath(`/presupuestos/${p.id}`);
    return { id: plan.id };
  } catch (e) {
    // Dos clics a la vez: el índice único (centro, cotización) deja pasar solo uno.
    if ((e as { code?: string }).code === "P2002") return { error: "Esta cotización ya tiene un plan de tratamiento." };
    throw e;
  }
}

/** Plan manual desde la ficha del paciente: precios del catálogo de hoy (sin convenio), congelados al crearlo. */
export async function crearPlanManual(entrada: EntradaPlanManual): Promise<D<{ id: string }>> {
  const ctx = await contextoPlanes();
  const r = esquemaPlanManual.safeParse(entrada);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const org = ctx.organizationId, d = r.data;
  const paciente = await prisma.pacienteTenant.findFirst({ where: { id: d.pacienteId, organizationId: org }, select: { id: true } });
  if (!paciente) return { error: "Paciente no encontrado" };
  const ids = [...new Set(d.items.map((i) => i.servicioId))];
  const servicios = await prisma.servicio.findMany({ where: { id: { in: ids }, organizationId: org, activo: true } });
  if (servicios.length !== ids.length) return { error: "Algún servicio ya no está disponible" };
  const porId = new Map(servicios.map((s) => [s.id, s]));
  const filas = [];
  for (const i of d.items) {
    const s = porId.get(i.servicioId)!;
    const precio = resolverPrecio({ servicio: s, entrega: "DIGITAL", fecha: hoyBogota() }).precio;
    if (precio === null) return { error: `«${s.nombre}» no tiene precio fijo: cotízalo y crea el plan desde la cotización.` };
    for (let n = 0; n < i.cantidad; n++) filas.push({ servicioId: s.id, descripcion: s.nombre, diente: i.diente ?? null, fase: i.fase, precio });
  }
  if (filas.length > 200) return { error: "Máximo 200 ítems por plan" };
  const items = filas.sort((a, b) => a.fase - b.fase).map((f, posicion) => ({ ...f, posicion }));
  const plan = await prisma.$transaction(async (tx) => {
    const creado = await tx.planTratamiento.create({ data: { organizationId: org, pacienteId: paciente.id, titulo: d.titulo || null, total: totalItems(items), creadoPorId: ctx.usuario.id } });
    await tx.planItem.createMany({ data: items.map((i) => ({ ...i, organizationId: org, planId: creado.id })) });
    await registrarEvento({ organizationId: org, pacienteId: paciente.id, actorId: ctx.usuario.id, tipo: "plan.creado", detalle: { planId: creado.id, total: creado.total, items: items.length, manual: true } }, tx);
    return creado;
  });
  revalidatePath("/planes");
  return { id: plan.id };
}

/** Anticipo del plan (solo gestión): queda como Anticipo DISPONIBLE del paciente, que se aplica a la cuenta de cobro de cada orden. */
export async function registrarAnticipoPlan(planId: string, entrada: z.input<typeof esquemaAnticipoPlan>): Promise<{ error?: string }> {
  const ctx = await contextoPlanes();
  if (!(GESTION as readonly string[]).includes(ctx.rol)) return { error: "Solo administración y recepción registran anticipos" };
  const r = esquemaAnticipoPlan.safeParse(entrada);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const org = ctx.organizationId;
  const plan = await planDelCentro(org, planId);
  if (!plan) return { error: "Plan no encontrado" };
  if (plan.estado !== "ACTIVO") return { error: "El plan ya no está activo" };
  await prisma.$transaction(async (tx) => {
    const a = await tx.anticipo.create({ data: { organizationId: org, pacienteId: plan.pacienteId, planId: plan.id, valor: r.data.monto, medio: r.data.medio, motivo: "Anticipo del plan de tratamiento", registradoPorId: ctx.usuario.id } });
    await registrarEvento({ organizationId: org, pacienteId: plan.pacienteId, actorId: ctx.usuario.id, tipo: "anticipo.registrado", detalle: { anticipoId: a.id, planId: plan.id, valor: a.valor, medio: a.medio } }, tx);
  });
  revalidatePath(`/planes/${planId}`);
  return {};
}

/** Cancela un plan activo sin ítems en orden; lo ya realizado queda como historial y los pendientes dejan de poder pedirse. */
export async function cancelarPlan(planId: string, motivo: string): Promise<{ error?: string }> {
  const ctx = await contextoPlanes();
  const m = z.string().trim().min(5, "Escribe el motivo (mínimo 5 caracteres)").max(500).safeParse(motivo);
  if (!m.success) return { error: m.error.issues[0]!.message };
  const org = ctx.organizationId;
  const plan = await planDelCentro(org, planId);
  if (!plan) return { error: "Plan no encontrado" };
  const items = await prisma.planItem.findMany({ where: { planId, organizationId: org }, select: { estado: true } });
  if (!puedeCancelarPlan(plan.estado, items as { estado: EstadoItemPlan }[])) return { error: "No se puede cancelar: hay ítems en una orden abierta o el plan ya no está activo." };
  const { count } = await prisma.planTratamiento.updateMany({ where: { id: planId, organizationId: org, estado: "ACTIVO", items: { none: { estado: "EN_ORDEN" } } }, data: { estado: "CANCELADO" } });
  if (count !== 1) return { error: "El plan cambió: recarga la página." };
  await registrarEvento({ organizationId: org, pacienteId: plan.pacienteId, actorId: ctx.usuario.id, tipo: "plan.cancelado", detalle: { planId, motivo: m.data } });
  revalidatePath("/planes");
  revalidatePath(`/planes/${planId}`);
  return {};
}
