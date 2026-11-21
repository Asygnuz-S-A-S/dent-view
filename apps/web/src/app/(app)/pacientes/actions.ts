"use server";

import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CLINICOS, GESTION } from "@/lib/roles";
import { registrarEvento } from "@/lib/eventos";
import { CONDICIONES, esquemaNumeroDocumento, esquemaTipoDocumento } from "@/lib/pacientes";
import { crearPacienteEnCentro } from "@/lib/pacientes-centro";
import { exigirContexto } from "@/lib/sesion";

export type ResultadoPaciente = { error: string } | { ok: true; id: string } | { existente: string };

const opcional = z.string().trim().transform((v) => v || null);
const esquema = z.object({
  id: z.string().optional(),
  tipoDocumento: esquemaTipoDocumento,
  numeroDocumento: esquemaNumeroDocumento,
  nombre: z.string().trim().min(3, "Escribe el nombre completo").max(120),
  fechaNacimiento: z
    .string()
    .trim()
    .transform((v) => (v ? new Date(`${v}T00:00:00Z`) : null))
    .refine((d) => d === null || (!Number.isNaN(d.getTime()) && d <= new Date()), "Fecha de nacimiento inválida"),
  celular: opcional,
  correo: z.string().trim().transform((v) => v || null).pipe(z.email("Correo inválido").nullable()),
  direccion: opcional,
  alertas: opcional,
  notas: opcional,
});

export async function guardarPaciente(formData: FormData): Promise<ResultadoPaciente> {
  const ctx = await exigirContexto(GESTION);
  const p = esquema.safeParse(Object.fromEntries(formData));
  if (!p.success) return { error: p.error.issues[0].message };
  const d = p.data;
  const contacto = { fechaNacimiento: d.fechaNacimiento, celular: d.celular, correo: d.correo, direccion: d.direccion };
  const actorId = ctx.usuario.id;

  if (d.id) {
    const paciente = await prisma.pacienteTenant.findFirst({
      where: { id: d.id, organizationId: ctx.organizationId },
    });
    if (!paciente) return { error: "Paciente no encontrado" };
    await prisma.pacienteTenant.update({ where: { id: paciente.id }, data: { nombre: d.nombre, ...contacto, alertas: d.alertas, notas: d.notas } });
    await registrarEvento({ organizationId: ctx.organizationId, pacienteId: paciente.id, actorId, tipo: "paciente.actualizado" });
    revalidatePath("/pacientes", "layout");
    return { ok: true, id: paciente.id };
  }

  const clave = { tipoDocumento: d.tipoDocumento, numeroDocumento: d.numeroDocumento };
  const r = await crearPacienteEnCentro(ctx.organizationId, clave, { nombre: d.nombre, ...contacto, alertas: d.alertas, notas: d.notas });
  if ("existente" in r) return { existente: r.existente };
  const nuevo = r.creado;
  await registrarEvento({ organizationId: ctx.organizationId, pacienteId: nuevo.id, actorId, tipo: "paciente.creado" });
  revalidatePath("/pacientes");
  return { ok: true, id: nuevo.id };
}

const esquemaCondicion = z.object({
  pacienteId: z.string(),
  diente: z.number().int().min(11).max(85),
  condicion: z.enum(CONDICIONES).nullable(),
});

/** Fija (o quita, con null) la condición del diente completo. Reemplaza la que hubiera. */
export async function guardarCondicion(input: z.input<typeof esquemaCondicion>): Promise<{ error?: string }> {
  const ctx = await exigirContexto(CLINICOS);
  const p = esquemaCondicion.safeParse(input);
  if (!p.success) return { error: "Datos inválidos" };
  const { pacienteId, diente, condicion } = p.data;
  const paciente = await prisma.pacienteTenant.findFirst({ where: { id: pacienteId, organizationId: ctx.organizationId } });
  if (!paciente) return { error: "Paciente no encontrado" };

  await prisma.$transaction([
    prisma.condicionDental.deleteMany({ where: { pacienteId, diente, superficie: null } }),
    ...(condicion ? [prisma.condicionDental.create({ data: { pacienteId, diente, condicion } })] : []),
  ]);
  await registrarEvento({
    organizationId: ctx.organizationId,
    pacienteId,
    actorId: ctx.usuario.id,
    tipo: "odontograma.actualizado",
    detalle: { diente, condicion },
  });
  revalidatePath(`/pacientes/${pacienteId}`);
  return {};
}
