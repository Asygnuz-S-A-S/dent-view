"use server";

import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { registrarEvento } from "@/lib/eventos";
import { ESTADOS_ORDEN, numeroOrden, transicionValida } from "@/lib/ordenes";
import { crearOrdenEnCentro, esquemaOrden } from "@/lib/ordenes-servicio";
import { esquemaNumeroDocumento, esquemaTipoDocumento } from "@/lib/pacientes";
import { crearPacienteEnCentro } from "@/lib/pacientes-centro";
import { CLINICOS, GESTION } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

const CREADORES = [...GESTION, "doctor_remitente"] as const;

export type ResultadoOrden = { error: string } | { id: string };

export async function crearOrden(entrada: z.input<typeof esquemaOrden>): Promise<ResultadoOrden> {
  const ctx = await exigirContexto(CREADORES);
  const r = esquemaOrden.safeParse(entrada);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const esDoctor = ctx.rol === "doctor_remitente";
  // Un doctor remitente siempre crea a su nombre; recepción/admin eligen uno (opcional) del centro.
  const res = await crearOrdenEnCentro({
    organizationId: ctx.organizationId,
    actorId: ctx.usuario.id,
    esDoctor,
    datos: { ...r.data, doctorId: esDoctor ? ctx.usuario.id : r.data.doctorId },
  });
  if ("error" in res) return res;
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
