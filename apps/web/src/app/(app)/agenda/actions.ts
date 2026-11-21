"use server";

import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guardarCitaEnCentro, esquemaCita } from "@/lib/agenda-servicio";
import { registrarEvento } from "@/lib/eventos";
import { CLINICOS } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

export async function guardarCita(entrada: z.input<typeof esquemaCita>): Promise<{ error?: string }> {
  const ctx = await exigirContexto(CLINICOS);
  const r = esquemaCita.safeParse(entrada);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const res = await guardarCitaEnCentro({ organizationId: ctx.organizationId, actorId: ctx.usuario.id, datos: r.data });
  if ("error" in res) return res;
  revalidatePath("/agenda");
  revalidatePath("/ordenes");
  return {};
}

/** Botón rápido "Llegó": solo desde Programada o Confirmada. */
export async function marcarLlegada(citaId: string): Promise<{ error?: string }> {
  const ctx = await exigirContexto(CLINICOS);
  const cita = await prisma.cita.findFirst({ where: { id: citaId, organizationId: ctx.organizationId } });
  if (!cita) return { error: "Cita no encontrada" };
  if (cita.estado !== "PROGRAMADA" && cita.estado !== "CONFIRMADA") return { error: "La cita ya no está pendiente de llegada" };
  await prisma.$transaction(async (tx) => {
    await tx.cita.update({ where: { id: cita.id }, data: { estado: "LLEGO" } });
    if (cita.pacienteId) {
      await registrarEvento({ organizationId: ctx.organizationId, pacienteId: cita.pacienteId, actorId: ctx.usuario.id, tipo: "cita.estado", detalle: { citaId: cita.id, de: cita.estado, a: "LLEGO" } }, tx);
    }
  });
  revalidatePath("/agenda");
  return {};
}
