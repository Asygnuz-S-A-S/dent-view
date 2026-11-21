"use server";

// Implementación independiente (sala limpia) a partir de docs/sala-limpia/03-recordatorios-y-seguimiento.md
import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { registrarEvento } from "@/lib/eventos";
import { encolarMensaje } from "@/lib/notificar";
import { varsCentro } from "@/lib/recordatorios";
import { CANALES_CONTACTO, estadoTrasIntento, ETIQUETA_MOTIVO, MOTIVOS, mesTexto, primerDiaMes, PRIORIDADES, RESULTADOS, seguimientoAbierto, sumarMeses, type EstadoSeg, type Motivo, type Resultado } from "@/lib/seguimiento";
import { CLINICOS, GESTION } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

type R = { error?: string };

const esquema = z.object({
  pacienteId: z.string().min(1, "Selecciona un paciente"),
  motivo: z.enum(MOTIVOS), prioridad: z.enum(PRIORIDADES).default("NORMAL"),
  mes: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, "Mes inválido"),
  nota: z.string().trim().max(500).optional(), ordenId: z.string().nullish(),
});

/** Anti-duplicados: si el paciente ya tiene un seguimiento activo con el mismo motivo, lo actualiza. Solo la inserción real avisa al paciente. */
export async function crearSeguimiento(entrada: z.input<typeof esquema>): Promise<R> {
  const ctx = await exigirContexto(CLINICOS);
  const r = esquema.safeParse(entrada);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const d = r.data;
  const org = ctx.organizationId;
  const pac = await prisma.pacienteTenant.findFirst({ where: { id: d.pacienteId, organizationId: org }, include: { persona: true } });
  if (!pac) return { error: "Paciente no encontrado" };
  if (d.ordenId && !(await prisma.orden.findFirst({ where: { id: d.ordenId, organizationId: org, pacienteId: pac.id } })))
    return { error: "Orden no encontrada" };
  const mesObjetivo = primerDiaMes(d.mes.length === 7 ? `${d.mes}-01` : d.mes);
  const centro = await varsCentro(org);
  await prisma.$transaction(async (tx) => {
    const previo = await tx.seguimiento.findFirst({ where: { organizationId: org, pacienteId: pac.id, motivo: d.motivo, estado: { in: ["PENDIENTE", "SIN_RESPUESTA", "AGENDADO"] } } });
    if (previo) {
      await tx.seguimiento.update({ where: { id: previo.id }, data: { mesObjetivo, prioridad: d.prioridad, nota: d.nota || previo.nota } });
      return;
    }
    const s = await tx.seguimiento.create({ data: { organizationId: org, pacienteId: pac.id, motivo: d.motivo, prioridad: d.prioridad, mesObjetivo, nota: d.nota || null, ordenId: d.ordenId ?? null, creadoPorId: ctx.usuario.id } });
    await registrarEvento({ organizationId: org, pacienteId: pac.id, actorId: ctx.usuario.id, tipo: "seguimiento.creado", detalle: { seguimientoId: s.id, motivo: d.motivo } }, tx);
    await encolarMensaje({
      organizationId: org, tipo: "SEGUIMIENTO", pacienteId: pac.id, claveUnica: `seguimiento-${s.id}`,
      contexto: { ...centro, paciente: pac.nombre, motivo: ETIQUETA_MOTIVO[d.motivo as Motivo].toLowerCase(), mes: mesTexto(mesObjetivo) },
    }, tx);
  });
  revalidatePath("/seguimiento");
  return {};
}

const esquemaIntento = z.object({ canal: z.enum(CANALES_CONTACTO), resultado: z.enum(RESULTADOS), nota: z.string().trim().max(300).optional() });

export async function registrarIntento(id: string, entrada: z.input<typeof esquemaIntento>): Promise<R> {
  const ctx = await exigirContexto(CLINICOS);
  const r = esquemaIntento.safeParse(entrada);
  if (!r.success) return { error: "Datos inválidos" };
  const res = await prisma.$transaction(async (tx) => {
    // Bloquea la fila para que dos usuarios simultáneos vean el estado correcto.
    await tx.$queryRaw`SELECT id FROM "Seguimiento" WHERE id = ${id} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
    const s = await tx.seguimiento.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!s) return { error: "Seguimiento no encontrado" };
    if (!seguimientoAbierto(s.estado)) return { error: "El seguimiento ya está cerrado" };
    const nuevo = estadoTrasIntento(s.estado as EstadoSeg, r.data.resultado as Resultado);
    await tx.intentoContacto.create({ data: { organizationId: ctx.organizationId, seguimientoId: id, canal: r.data.canal, resultado: r.data.resultado, nota: r.data.nota || null, creadoPorId: ctx.usuario.id } });
    await tx.seguimiento.update({ where: { id }, data: { intentos: { increment: 1 }, ultimoIntentoEn: new Date(), estado: nuevo } });
    await registrarEvento({ organizationId: ctx.organizationId, pacienteId: s.pacienteId, actorId: ctx.usuario.id, tipo: "seguimiento.intento", detalle: { seguimientoId: id, resultado: r.data.resultado } }, tx);
    return {};
  });
  revalidatePath("/seguimiento");
  return res;
}

async function cambiar(id: string, ctxRoles: readonly string[], fn: (s: { id: string; nota: string | null; mesObjetivo: Date; pacienteId: string }, usuario: { id: string; name: string }) => object, tipo: string): Promise<R> {
  const ctx = await exigirContexto(ctxRoles);
  const s = await prisma.seguimiento.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!s) return { error: "Seguimiento no encontrado" };
  if (!seguimientoAbierto(s.estado)) return { error: "El seguimiento ya está cerrado" };
  await prisma.$transaction(async (tx) => {
    await tx.seguimiento.update({ where: { id }, data: fn(s, ctx.usuario) });
    await registrarEvento({ organizationId: ctx.organizationId, pacienteId: s.pacienteId, actorId: ctx.usuario.id, tipo, detalle: { seguimientoId: id } }, tx);
  });
  revalidatePath("/seguimiento");
  return {};
}

export async function completarSeguimiento(id: string) {
  return cambiar(id, CLINICOS, () => ({ estado: "COMPLETADO", completadoEn: new Date() }), "seguimiento.completado");
}
export async function cancelarSeguimiento(id: string) {
  return cambiar(id, CLINICOS, () => ({ estado: "CANCELADO" }), "seguimiento.cancelado");
}
export async function aplazarSeguimiento(id: string, meses: number): Promise<R> {
  if (!Number.isInteger(meses) || meses < 1 || meses > 24) return { error: "Meses inválidos" };
  return cambiar(id, GESTION, (s, u) => ({ estado: "PENDIENTE", mesObjetivo: sumarMeses(s.mesObjetivo, meses), nota: [s.nota, `${new Date().toISOString().slice(0, 10)} ${u.name}: aplazado ${meses} mes(es)`].filter(Boolean).join("\n") }), "seguimiento.aplazado");
}
