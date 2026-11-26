"use server";

import { ordenParaVincular, prisma, type Prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { registrarEvento } from "@/lib/eventos";
import { sincronizarPlanConOrden } from "@/lib/planes-servidor";
import { idsPacientesPorNombre } from "@/lib/busqueda";
import { numeroOrden } from "@/lib/ordenes";
import { CLINICOS, GESTION } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

export async function buscarPacientes(q: string) {
  const ctx = await exigirContexto(GESTION);
  const t = q.trim().slice(0, 60);
  const pacientes = await prisma.pacienteTenant.findMany({
    where: {
      organizationId: ctx.organizationId,
      ...(t && {
        OR: [{ id: { in: await idsPacientesPorNombre(ctx.organizationId, t) } }, { persona: { numeroDocumento: { contains: t } } }],
      }),
    },
    include: { persona: true },
    orderBy: { nombre: "asc" },
    take: 15,
  });
  return pacientes.map((p) => ({ id: p.id, nombre: p.nombre, documento: `${p.persona.tipoDocumento} ${p.persona.numeroDocumento}` }));
}

export async function ordenesDePaciente(pacienteId: string) {
  const ctx = await exigirContexto(CLINICOS);
  const ordenes = await prisma.orden.findMany({
    where: { organizationId: ctx.organizationId, pacienteId, estado: { not: "CANCELADA" } },
    orderBy: { numero: "desc" },
    take: 30,
  });
  return ordenes.map((o) => ({ id: o.id, numero: o.numero, estado: o.estado }));
}

const asignacion = z.object({
  estudioId: z.string().min(1),
  pacienteId: z.string().min(1, "Elige un paciente"),
  doctorId: z.string().min(1, "Elige un doctor remitente"),
  ordenId: z.string().optional(),
});

type Resultado = { ok: true } | { ok: false; error: string };

export async function asignarEstudio(entrada: z.input<typeof asignacion>): Promise<Resultado> {
  const ctx = await exigirContexto(GESTION);
  const p = asignacion.safeParse(entrada);
  if (!p.success) return { ok: false, error: p.error.issues[0]!.message };
  const { estudioId, pacienteId, doctorId, ordenId } = p.data;
  const org = ctx.organizationId;

  const [estudio, paciente, doctor, ordenElegida] = await Promise.all([
    prisma.estudio.findFirst({ where: { id: estudioId, organizationId: org } }),
    prisma.pacienteTenant.findFirst({ where: { id: pacienteId, organizationId: org } }),
    prisma.member.findFirst({ where: { organizationId: org, userId: doctorId, role: "doctor_remitente" } }),
    ordenId ? prisma.orden.findFirst({ where: { id: ordenId, organizationId: org, pacienteId } }) : null,
  ]);
  if (!estudio) return { ok: false, error: "Estudio no encontrado" };
  if (estudio.estado === "PUBLICADO") return { ok: false, error: "El estudio ya está publicado" };
  if (!paciente) return { ok: false, error: "Paciente no encontrado en este centro" };
  if (!doctor) return { ok: false, error: "Doctor remitente no válido" };
  if (ordenId && !ordenElegida) return { ok: false, error: "La orden no pertenece a ese paciente" };
  // Sin orden elegida a mano: la AGENDADA/TOMADA más reciente del paciente (mismo criterio que el worker).
  const autoId = ordenElegida ? null : await ordenParaVincular(prisma, org, pacienteId);
  const orden = ordenElegida ?? (autoId ? await prisma.orden.findFirst({ where: { id: autoId, organizationId: org } }) : null);

  await prisma.$transaction(async (tx) => {
    await tx.estudio.update({
      where: { id: estudio.id },
      data: { pacienteId, doctorRemitenteId: doctorId, ordenId: null, estado: "ASIGNADO" },
    });
    await registrarEvento(
      { organizationId: org, tipo: "estudio.asignado", pacienteId, actorId: ctx.usuario.id, detalle: { estudioId, doctorId, ordenId: orden?.id ?? null } },
      tx,
    );
    if (orden) await ligar(tx, ctx, estudio.id, orden);
  });
  revalidatePath("/estudios");
  if (orden) revalidatePath(`/ordenes/${orden.id}`);
  return { ok: true };
}

type OrdenLigable = { id: string; numero: number; estado: string; pacienteId: string };

/** Liga el estudio a la orden; si estaba AGENDADA pasa a TOMADA (ya hay estudio tomado). */
async function ligar(tx: Prisma.TransactionClient, ctx: Awaited<ReturnType<typeof exigirContexto>>, estudioId: string, orden: OrdenLigable) {
  const org = ctx.organizationId;
  await tx.estudio.update({ where: { id: estudioId }, data: { ordenId: orden.id } });
  await registrarEvento({ organizationId: org, tipo: "estudio.vinculado", pacienteId: orden.pacienteId, actorId: ctx.usuario.id, detalle: { estudioId, ordenId: orden.id, orden: numeroOrden(orden.numero) } }, tx);
  if (orden.estado === "AGENDADA") {
    await tx.orden.update({ where: { id: orden.id }, data: { estado: "TOMADA" } });
    await sincronizarPlanConOrden(tx, { organizationId: org, ordenId: orden.id, estadoOrden: "TOMADA" });
    await registrarEvento({ organizationId: org, tipo: "orden.estado", pacienteId: orden.pacienteId, actorId: ctx.usuario.id, detalle: { ordenId: orden.id, orden: numeroOrden(orden.numero), de: "AGENDADA", a: "TOMADA", origen: "vinculacion" } }, tx);
  }
}

/** Vincula a mano un estudio ya asignado a una orden del mismo paciente y centro. */
export async function vincularEstudioOrden(estudioId: string, ordenId: string): Promise<Resultado> {
  const ctx = await exigirContexto(CLINICOS);
  const org = ctx.organizationId;
  const estudio = await prisma.estudio.findFirst({ where: { id: estudioId, organizationId: org } });
  if (!estudio) return { ok: false, error: "Estudio no encontrado" };
  if (!estudio.pacienteId) return { ok: false, error: "Asigna el estudio a un paciente antes de vincularlo" };
  const orden = await prisma.orden.findFirst({ where: { id: ordenId, organizationId: org, pacienteId: estudio.pacienteId } });
  if (!orden) return { ok: false, error: "La orden no pertenece al paciente del estudio" };
  if (orden.estado === "CANCELADA") return { ok: false, error: "La orden está cancelada" };
  await prisma.$transaction((tx) => ligar(tx, ctx, estudio.id, orden));
  revalidatePath("/estudios");
  revalidatePath(`/ordenes/${orden.id}`);
  return { ok: true };
}

export async function desvincularEstudio(estudioId: string): Promise<Resultado> {
  const ctx = await exigirContexto(CLINICOS);
  const estudio = await prisma.estudio.findFirst({ where: { id: estudioId, organizationId: ctx.organizationId } });
  if (!estudio) return { ok: false, error: "Estudio no encontrado" };
  if (!estudio.ordenId) return { ok: true };
  await prisma.$transaction(async (tx) => {
    await tx.estudio.update({ where: { id: estudio.id }, data: { ordenId: null } });
    await registrarEvento({ organizationId: ctx.organizationId, tipo: "estudio.desvinculado", pacienteId: estudio.pacienteId, actorId: ctx.usuario.id, detalle: { estudioId, ordenId: estudio.ordenId } }, tx);
  });
  revalidatePath("/estudios");
  revalidatePath(`/ordenes/${estudio.ordenId}`);
  return { ok: true };
}

export async function publicarEstudio(estudioId: string): Promise<Resultado> {
  const ctx = await exigirContexto(GESTION);
  const estudio = await prisma.estudio.findFirst({ where: { id: estudioId, organizationId: ctx.organizationId } });
  if (!estudio) return { ok: false, error: "Estudio no encontrado" };
  if (estudio.estado !== "ASIGNADO") return { ok: false, error: "Solo se publican estudios asignados" };

  await prisma.$transaction(async (tx) => {
    await tx.estudio.update({ where: { id: estudio.id }, data: { estado: "PUBLICADO" } });
    await registrarEvento(
      { organizationId: ctx.organizationId, tipo: "estudio.publicado", pacienteId: estudio.pacienteId, actorId: ctx.usuario.id, detalle: { estudioId } },
      tx,
    );
  });
  revalidatePath("/estudios");
  return { ok: true };
}
