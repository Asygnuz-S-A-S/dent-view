"use server";

// Adaptado de OpenDentist (MIT, © 2026 Clawnify) — https://github.com/clawnify/OpenDentist
import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { registrarEvento } from "@/lib/eventos";
import { fechaHoraCompleta } from "@/lib/fechas";
import { ESTADOS_PLAN, SUPERFICIES } from "@/lib/plan";
import { precioFinal } from "@/lib/precios";
import { MEDICOS } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

type R = { error?: string };

const esquemaItem = z.object({
  pacienteId: z.string(),
  servicioId: z.string().nullish(),
  diente: z.number().int().min(11).max(85).nullish(),
  superficie: z.enum(SUPERFICIES).nullish(),
  descripcion: z.string().trim().max(200).optional(),
  valor: z.number().int().min(0).max(1_000_000_000).optional(),
  notas: z.string().trim().max(1000).optional(),
});

const pacienteDelCentro = (id: string, organizationId: string) =>
  prisma.pacienteTenant.findFirst({ where: { id, organizationId } });

/** Un ítem del plan, solo si su paciente es del centro activo. */
const itemDelCentro = (id: string, organizationId: string) =>
  prisma.planTratamientoItem.findFirst({ where: { id, paciente: { organizationId } } });

export async function agregarItemPlan(entrada: z.input<typeof esquemaItem>): Promise<R> {
  const ctx = await exigirContexto(MEDICOS);
  const r = esquemaItem.safeParse(entrada);
  if (!r.success) return { error: "Datos inválidos" };
  const d = r.data;
  if (!(await pacienteDelCentro(d.pacienteId, ctx.organizationId))) return { error: "Paciente no encontrado" };

  let descripcion = d.descripcion || "";
  let valor = d.valor ?? 0;
  if (d.servicioId) {
    const s = await prisma.servicio.findFirst({ where: { id: d.servicioId, organizationId: ctx.organizationId, activo: true } });
    if (!s) return { error: "El servicio ya no está disponible" };
    descripcion ||= s.nombre;
    if (d.valor === undefined) valor = precioFinal(s, "DIGITAL") ?? 0;
  }
  if (!descripcion) return { error: "Escribe una descripción" };

  const max = await prisma.planTratamientoItem.aggregate({ where: { pacienteId: d.pacienteId }, _max: { posicion: true } });
  const item = await prisma.planTratamientoItem.create({
    data: {
      pacienteId: d.pacienteId, diente: d.diente ?? null, superficie: d.superficie ?? null, descripcion, valor,
      notas: d.notas || null, posicion: (max._max.posicion ?? -1) + 1,
    },
  });
  await registrarEvento({
    organizationId: ctx.organizationId, pacienteId: d.pacienteId, actorId: ctx.usuario.id,
    tipo: "plan.item_agregado", detalle: { itemId: item.id, descripcion, valor },
  });
  revalidatePath(`/pacientes/${d.pacienteId}`);
  return {};
}

export async function cambiarEstadoPlan(id: string, estado: string): Promise<R> {
  const ctx = await exigirContexto(MEDICOS);
  const e = z.enum(ESTADOS_PLAN).safeParse(estado);
  if (!e.success) return { error: "Estado inválido" };
  const item = await itemDelCentro(id, ctx.organizationId);
  if (!item) return { error: "Ítem no encontrado" };
  if (item.estado === e.data) return {};
  await prisma.planTratamientoItem.update({ where: { id }, data: { estado: e.data } });
  await registrarEvento({
    organizationId: ctx.organizationId, pacienteId: item.pacienteId, actorId: ctx.usuario.id,
    tipo: "plan.estado", detalle: { itemId: id, de: item.estado, a: e.data },
  });
  revalidatePath(`/pacientes/${item.pacienteId}`);
  return {};
}

/** Sube (-1) o baja (1) un ítem intercambiando posición con su vecino. */
export async function moverItemPlan(id: string, dir: -1 | 1): Promise<R> {
  const ctx = await exigirContexto(MEDICOS);
  const item = await itemDelCentro(id, ctx.organizationId);
  if (!item) return { error: "Ítem no encontrado" };
  const todos = await prisma.planTratamientoItem.findMany({ where: { pacienteId: item.pacienteId }, orderBy: [{ posicion: "asc" }, { creadoEn: "asc" }] });
  const i = todos.findIndex((x) => x.id === id);
  const j = i + (dir === -1 ? -1 : 1);
  if (j < 0 || j >= todos.length) return {};
  [todos[i], todos[j]] = [todos[j], todos[i]];
  // Renumera todo: tolera posiciones repetidas.
  await prisma.$transaction(todos.map((x, n) => prisma.planTratamientoItem.update({ where: { id: x.id }, data: { posicion: n } })));
  revalidatePath(`/pacientes/${item.pacienteId}`);
  return {};
}

/**
 * Las notas son inmodificables (Res. 1995/1999 art. 18): solo se crean. Una corrección es una nota nueva que cita a la anterior
 * (NotaClinica no tiene campo de referencia, por eso la cita va en el texto con fecha y hora).
 */
export async function crearNota(pacienteId: string, texto: string, corrigeId?: string): Promise<R> {
  const ctx = await exigirContexto(MEDICOS);
  const t = z.string().trim().min(1, "Escribe la nota").max(5000).safeParse(texto);
  if (!t.success) return { error: t.error.issues[0].message };
  if (!(await pacienteDelCentro(pacienteId, ctx.organizationId))) return { error: "Paciente no encontrado" };
  let contenido = t.data;
  if (corrigeId) {
    const previa = await prisma.notaClinica.findFirst({ where: { id: corrigeId, pacienteId } });
    if (!previa) return { error: "Nota a corregir no encontrada" };
    contenido = `[Corrige la nota del ${fechaHoraCompleta(previa.fecha)}] ${t.data}`;
  }
  const nota = await prisma.notaClinica.create({ data: { pacienteId, autorId: ctx.usuario.id, texto: contenido } });
  await registrarEvento({ organizationId: ctx.organizationId, pacienteId, actorId: ctx.usuario.id, tipo: "nota.creada", detalle: { notaId: nota.id, ...(corrigeId ? { corrigeId } : {}) } });
  revalidatePath(`/pacientes/${pacienteId}`);
  return {};
}
