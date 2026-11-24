// Alta/edición de citas compartida por la app (server action) y la API pública.
import { esConflictoDeEscritura, esCruceDeCitas } from "./agenda-cruce";
import { prisma } from "@dent-view/db";
import { z } from "zod";
import { bogotaAUtc, ESTADOS_CITA, esFecha, FIN_DIA_MIN, hayCruce, INICIO_DIA_MIN, PASO_MIN } from "./agenda";
import { registrarEvento } from "./eventos";
import { encolarMensaje } from "./notificar";
import { numeroOrden } from "./ordenes";
import { varsCentro, varsCita } from "./recordatorios";

export const esquemaCita = z.object({
  id: z.string().optional(),
  salaId: z.string().min(1, "Selecciona una sala"),
  pacienteId: z.string().min(1, "Selecciona un paciente"),
  ordenId: z.string().nullish(),
  fecha: z.string().refine(esFecha, "Fecha inválida"),
  inicioMin: z.number().int().min(INICIO_DIA_MIN).max(FIN_DIA_MIN - PASO_MIN).refine((m) => m % PASO_MIN === 0, "Hora inválida"),
  duracion: z.number().int().min(PASO_MIN).max(60).refine((m) => m % PASO_MIN === 0, "Duración inválida"),
  notas: z.string().trim().max(1000).optional(),
  estado: z.enum(ESTADOS_CITA).optional(),
});
export type EntradaCita = z.output<typeof esquemaCita>;

/**
 * Dos altas simultáneas al mismo hueco pueden terminar en deadlock (Prisma P2034) en la perdedora: se reintenta,
 * y en el reintento ya ve la cita ganadora y responde el cruce normal en vez de un 500.
 */
export async function guardarCitaEnCentro(a: Parameters<typeof guardarCita>[0]): ReturnType<typeof guardarCita> {
  for (let intento = 0; ; intento++) {
    try {
      return await guardarCita(a);
    } catch (e) {
      if (!esConflictoDeEscritura(e) || intento >= 2) throw e;
      await new Promise((r) => setTimeout(r, 150 * (intento + 1)));
    }
  }
}

async function guardarCita(a: {
  organizationId: string;
  actorId: string | null;
  datos: EntradaCita;
  detalleEvento?: object;
}): Promise<{ error: string } | { id: string }> {
  const d = a.datos;
  const org = a.organizationId;
  if (d.inicioMin + d.duracion > FIN_DIA_MIN) return { error: "La cita termina después del cierre (19:00)" };

  const [sala, paciente, orden, actual] = await Promise.all([
    prisma.sala.findFirst({ where: { id: d.salaId, organizationId: org, activa: true } }),
    prisma.pacienteTenant.findFirst({ where: { id: d.pacienteId, organizationId: org }, include: { persona: true } }),
    d.ordenId ? prisma.orden.findFirst({ where: { id: d.ordenId, organizationId: org, pacienteId: d.pacienteId } }) : null,
    d.id ? prisma.cita.findFirst({ where: { id: d.id, organizationId: org } }) : null,
  ]);
  if (!sala) return { error: "Sala no válida" };
  if (!paciente) return { error: "Paciente no encontrado" };
  if (d.ordenId && !orden) return { error: "Orden no válida para el paciente" };
  if (d.id && !actual) return { error: "Cita no encontrada" };

  const inicio = bogotaAUtc(d.fecha, d.inicioMin);
  const fin = bogotaAUtc(d.fecha, d.inicioMin + d.duracion);
  const mismaSala = await prisma.cita.findMany({ where: { organizationId: org, salaId: sala.id, inicio: { lt: fin }, fin: { gt: inicio } } });
  if (hayCruce(mismaSala, { id: d.id, salaId: sala.id, inicio, fin })) return { error: "Ya hay una cita en esa sala a esa hora" };

  // La BD tiene EXCLUDE por sala y por profesional (Cita_sin_cruce_*): si dos clics simultáneos se cruzan, el segundo falla aquí.
  const data = { salaId: sala.id, pacienteId: paciente.id, ordenId: orden?.id ?? null, inicio, fin, notas: d.notas || null, ...(d.estado ? { estado: d.estado } : {}) };
  const centro = actual ? null : await varsCentro(org);
  const citaId = await prisma.$transaction(async (tx) => {
    const cita = actual
      ? await tx.cita.update({ where: { id: actual.id }, data })
      : await tx.cita.create({ data: { ...data, organizationId: org } });
    const base = { organizationId: org, pacienteId: paciente.id, actorId: a.actorId };
    if (!actual) {
      await registrarEvento({ ...base, tipo: "cita.creada", detalle: { citaId: cita.id, sala: sala.nombre, inicio: inicio.toISOString(), ...a.detalleEvento } }, tx);
      // Aviso al paciente dentro de la misma transacción: si la cita se revierte, no queda mensaje.
      await encolarMensaje({ organizationId: org, tipo: "CITA_CREADA", pacienteId: paciente.id, contexto: varsCita(inicio, paciente.nombre, centro!), claveUnica: `cita-creada-${cita.id}` }, tx);
    }
    else if (d.estado && d.estado !== actual.estado) await registrarEvento({ ...base, tipo: "cita.estado", detalle: { citaId: cita.id, de: actual.estado, a: d.estado } }, tx);
    if (orden?.estado === "SOLICITADA") {
      await tx.orden.update({ where: { id: orden.id }, data: { estado: "AGENDADA" } });
      await registrarEvento({ ...base, tipo: "orden.estado", detalle: { ordenId: orden.id, orden: numeroOrden(orden.numero), de: "SOLICITADA", a: "AGENDADA", origen: "cita" } }, tx);
    }
    return cita.id;
  }).catch((e: unknown) => {
    if (esCruceDeCitas(e)) return null;
    throw e;
  });
  if (!citaId) return { error: "Ya hay una cita en esa sala a esa hora" };
  return { id: citaId };
}
