"use server";

// Adaptado de OpenDentist (MIT, © 2026 Clawnify) — https://github.com/clawnify/OpenDentist
import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { registrarEvento } from "@/lib/eventos";
import { ESTADOS_LAB } from "@/lib/laboratorio";
import { GESTION } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

// Fechas de calendario en hora de Bogotá; la entrega vence al terminar ese día.
const fecha = (hora: string) =>
  z.string().trim().transform((v) => (v ? new Date(`${v}T${hora}-05:00`) : null)).refine((d) => d === null || !Number.isNaN(d.getTime()), "Fecha inválida");
const opcional = z.string().trim().transform((v) => v || null);

const esquema = z.object({
  id: z.string().optional(),
  pacienteId: z.string().min(1, "Selecciona un paciente"),
  ordenId: opcional,
  laboratorio: z.string().trim().min(2, "Escribe el laboratorio").max(120),
  tipo: z.string().trim().min(2, "Escribe el tipo de trabajo").max(120),
  dientes: opcional,
  valor: z.coerce.number().int().min(0).max(1_000_000_000),
  enviado: fecha("12:00:00"),
  entregaEsperada: fecha("23:59:59"),
  notas: opcional,
});

export async function guardarCaso(entrada: Record<string, string>): Promise<{ error?: string }> {
  const ctx = await exigirContexto(GESTION);
  const r = esquema.safeParse(entrada);
  if (!r.success) return { error: r.error.issues[0].message };
  const { id, ...d } = r.data;
  const org = ctx.organizationId;
  const paciente = await prisma.pacienteTenant.findFirst({ where: { id: d.pacienteId, organizationId: org } });
  if (!paciente) return { error: "Paciente no encontrado" };
  if (d.ordenId && !(await prisma.orden.findFirst({ where: { id: d.ordenId, organizationId: org, pacienteId: paciente.id } }))) {
    return { error: "La orden no pertenece al paciente" };
  }

  if (id) {
    const caso = await prisma.casoLaboratorio.findFirst({ where: { id, organizationId: org } });
    if (!caso) return { error: "Caso no encontrado" };
    await prisma.casoLaboratorio.update({ where: { id }, data: d });
  } else {
    const caso = await prisma.casoLaboratorio.create({ data: { ...d, organizationId: org, estado: d.enviado ? "ENVIADO" : "PENDIENTE" } });
    await registrarEvento({
      organizationId: org, pacienteId: paciente.id, actorId: ctx.usuario.id,
      tipo: "laboratorio.creado", detalle: { casoId: caso.id, laboratorio: d.laboratorio, tipo: d.tipo },
    });
  }
  revalidatePath("/laboratorio");
  revalidatePath(`/pacientes/${paciente.id}`);
  return {};
}

export async function cambiarEstadoCaso(id: string, estado: string): Promise<{ error?: string }> {
  const ctx = await exigirContexto(GESTION);
  const e = z.enum(ESTADOS_LAB).safeParse(estado);
  if (!e.success) return { error: "Estado inválido" };
  const caso = await prisma.casoLaboratorio.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!caso) return { error: "Caso no encontrado" };
  if (caso.estado === e.data) return {};
  const ahora = new Date();
  await prisma.casoLaboratorio.update({
    where: { id },
    data: {
      estado: e.data,
      ...(e.data === "ENVIADO" && !caso.enviado && { enviado: ahora }),
      ...(e.data === "RECIBIDO" && !caso.recibido && { recibido: ahora }),
    },
  });
  await registrarEvento({
    organizationId: ctx.organizationId, pacienteId: caso.pacienteId, actorId: ctx.usuario.id,
    tipo: "laboratorio.estado", detalle: { casoId: id, de: caso.estado, a: e.data },
  });
  revalidatePath("/laboratorio");
  revalidatePath(`/pacientes/${caso.pacienteId}`);
  return {};
}
