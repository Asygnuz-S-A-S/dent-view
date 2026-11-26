"use server";

import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { GESTION, MEDICOS } from "@/lib/roles";
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
  // RIPS (opcionales). `ripsCargado` evita borrar datos si el formulario de edición se envía antes de cargarlos.
  ripsCargado: z.string().optional(),
  sexo: z.enum(["H", "M", "I"]).or(z.literal("")).optional().transform((v) => v || null),
  codMunicipio: z.string().trim().regex(/^\d{5}$/, "El municipio es un código DIVIPOLA de 5 dígitos").or(z.literal("")).optional().transform((v) => v || null),
  codPaisResidencia: z.string().trim().regex(/^\d{3}$/, "El país es un código de 3 dígitos (Colombia: 170)").or(z.literal("")).optional().transform((v) => v || null),
  zonaTerritorial: z.enum(["U", "R"]).or(z.literal("")).optional().transform((v) => v || null),
  tipoUsuarioDefecto: z.string().trim().regex(/^\d{2}$/, "El tipo de usuario es un código de 2 dígitos").or(z.literal("")).optional().transform((v) => v || null),
  aseguradoraNit: z.string().trim().regex(/^[0-9.\-]{5,15}$/, "NIT de la aseguradora inválido").or(z.literal("")).optional().transform((v) => v || null),
});

export type DatosRipsPaciente = { sexo: string; codMunicipio: string; codPaisResidencia: string; zonaTerritorial: string; tipoUsuarioDefecto: string; aseguradoraNit: string };

/** Datos RIPS de un paciente del centro activo (para precargar el formulario de edición sin tocar la página de la ficha). */
export async function cargarRipsPaciente(id: string): Promise<DatosRipsPaciente | null> {
  const ctx = await exigirContexto(GESTION);
  const p = await prisma.pacienteTenant.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!p) return null;
  return { sexo: p.sexo ?? "", codMunicipio: p.codMunicipio ?? "", codPaisResidencia: p.codPaisResidencia ?? "", zonaTerritorial: p.zonaTerritorial ?? "", tipoUsuarioDefecto: p.tipoUsuarioDefecto ?? "", aseguradoraNit: p.aseguradoraNit ?? "" };
}

export async function guardarPaciente(formData: FormData): Promise<ResultadoPaciente> {
  const ctx = await exigirContexto(GESTION);
  const p = esquema.safeParse(Object.fromEntries(formData));
  if (!p.success) return { error: p.error.issues[0].message };
  const d = p.data;
  const contacto = { fechaNacimiento: d.fechaNacimiento, celular: d.celular, correo: d.correo, direccion: d.direccion };
  const actorId = ctx.usuario.id;
  const rips = { sexo: d.sexo, codMunicipio: d.codMunicipio, codPaisResidencia: d.codPaisResidencia, zonaTerritorial: d.zonaTerritorial, tipoUsuarioDefecto: d.tipoUsuarioDefecto, aseguradoraNit: d.aseguradoraNit };

  if (d.id) {
    const paciente = await prisma.pacienteTenant.findFirst({
      where: { id: d.id, organizationId: ctx.organizationId },
    });
    if (!paciente) return { error: "Paciente no encontrado" };
    await prisma.pacienteTenant.update({ where: { id: paciente.id }, data: { nombre: d.nombre, ...contacto, alertas: d.alertas, notas: d.notas, ...(d.ripsCargado ? rips : {}) } });
    await registrarEvento({ organizationId: ctx.organizationId, pacienteId: paciente.id, actorId, tipo: "paciente.actualizado" });
    revalidatePath("/pacientes", "layout");
    return { ok: true, id: paciente.id };
  }

  const clave = { tipoDocumento: d.tipoDocumento, numeroDocumento: d.numeroDocumento };
  const r = await crearPacienteEnCentro(ctx.organizationId, clave, { nombre: d.nombre, ...contacto, alertas: d.alertas, notas: d.notas });
  if ("existente" in r) return { existente: r.existente };
  const nuevo = r.creado;
  if (Object.values(rips).some(Boolean)) await prisma.pacienteTenant.update({ where: { id: nuevo.id }, data: { ...rips, codPaisResidencia: rips.codPaisResidencia ?? undefined } });
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
  const ctx = await exigirContexto(MEDICOS);
  const p = esquemaCondicion.safeParse(input);
  if (!p.success) return { error: "Datos inválidos" };
  const { pacienteId, diente, condicion } = p.data;
  const paciente = await prisma.pacienteTenant.findFirst({ where: { id: pacienteId, organizationId: ctx.organizationId } });
  if (!paciente) return { error: "Paciente no encontrado" };

  await prisma.$transaction(async (tx) => {
    // Historial (Res. 1995/1999): antes de sobrescribir se guarda el estado previo completo, con quién y cuándo.
    const previo = await tx.condicionDental.findMany({ where: { pacienteId }, select: { diente: true, superficie: true, condicion: true, notas: true } });
    await tx.odontogramaHistorial.create({ data: { organizationId: ctx.organizationId, pacienteId, autorId: ctx.usuario.id, snapshot: previo, motivo: `Diente ${diente}: ${condicion ?? "condición quitada"}` } });
    await tx.condicionDental.deleteMany({ where: { pacienteId, diente, superficie: null } });
    if (condicion) await tx.condicionDental.create({ data: { pacienteId, diente, condicion } });
  });
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
