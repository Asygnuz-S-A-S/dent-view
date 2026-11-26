"use server";

import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ADMIN } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

// Tope por defecto = INT de la BD (un monto mayor rompía la consulta con un 500).
const num = (min: number, max = 2_147_483_647) =>
  z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(min).max(max).nullable());
const fecha = z.preprocess((v) => (v === "" || v == null ? null : v), z.iso.date().nullable());
const texto = z.string().trim().optional();

const esquema = z
  .object({
    id: z.string().optional(),
    nombre: z.string().trim().min(1, "Falta el nombre"),
    nit: texto,
    contacto: texto,
    tipoPagador: z.enum(["PARTICULAR", "EPS", "PREPAGADA", "POLIZA", "EMPRESA", "OTRO"]).or(z.literal("")).optional().transform((v) => v || null),
    nitPagador: texto,
    cucon: texto,
    coberturaPlan: texto,
    descuentoGeneral: num(0, 100),
    vigenteDesde: fecha,
    vigenteHasta: fecha,
  })
  .refine((d) => !d.vigenteDesde || !d.vigenteHasta || d.vigenteDesde <= d.vigenteHasta, { message: "La vigencia termina antes de empezar" });

export type EstadoForm = { error?: string; ok?: boolean } | undefined;

export async function guardarConvenio(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const ctx = await exigirContexto(ADMIN);
  const r = esquema.safeParse(Object.fromEntries(fd));
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const { id, nit, contacto, nitPagador, cucon, coberturaPlan, vigenteDesde, vigenteHasta, ...resto } = r.data;
  const data = {
    ...resto,
    nit: nit || null,
    contacto: contacto || null,
    nitPagador: nitPagador || null,
    cucon: cucon || null,
    coberturaPlan: coberturaPlan || null,
    vigenteDesde: vigenteDesde ? new Date(vigenteDesde) : null,
    vigenteHasta: vigenteHasta ? new Date(vigenteHasta) : null,
  };
  if (id) {
    const { count } = await prisma.convenio.updateMany({ where: { id, organizationId: ctx.organizationId }, data });
    if (!count) return { error: "Convenio no encontrado" };
  } else {
    await prisma.convenio.create({ data: { ...data, organizationId: ctx.organizationId } });
  }
  revalidatePath("/convenios");
  return { ok: true };
}

export async function cambiarActivoConvenio(id: string, activo: boolean) {
  const ctx = await exigirContexto(ADMIN);
  await prisma.convenio.updateMany({ where: { id, organizationId: ctx.organizationId }, data: { activo } });
  revalidatePath("/convenios");
}

const esquemaTarifa = z.object({
  servicioId: z.string().min(1),
  convenioId: z.string().optional(),
  doctorId: z.string().optional(),
  precioImpreso: num(0),
  precioDigital: num(0),
});

/** Crea, actualiza o (si ambos precios van vacíos) elimina la tarifa especial de un servicio para un convenio o un doctor. */
export async function guardarTarifa(entrada: z.input<typeof esquemaTarifa>): Promise<{ error?: string }> {
  const ctx = await exigirContexto(ADMIN);
  const org = ctx.organizationId;
  const r = esquemaTarifa.safeParse(entrada);
  if (!r.success) return { error: "Precio inválido" };
  const { servicioId, convenioId, doctorId, precioImpreso, precioDigital } = r.data;
  if (!convenioId === !doctorId) return { error: "Indica un convenio o un doctor" };
  if (!(await prisma.servicio.findFirst({ where: { id: servicioId, organizationId: org }, select: { id: true } }))) return { error: "Servicio no encontrado" };
  if (convenioId && !(await prisma.convenio.findFirst({ where: { id: convenioId, organizationId: org }, select: { id: true } }))) return { error: "Convenio no encontrado" };
  if (doctorId && (await prisma.member.findUnique({ where: { organizationId_userId: { organizationId: org, userId: doctorId } } }))?.role !== "doctor_remitente") {
    return { error: "Doctor remitente no válido" };
  }
  const donde = convenioId ? { convenioId, servicioId } : { doctorId: doctorId!, servicioId };
  if (precioImpreso === null && precioDigital === null) {
    await prisma.tarifaEspecial.deleteMany({ where: { organizationId: org, ...donde } });
  } else {
    const filas = await prisma.tarifaEspecial.updateMany({ where: { organizationId: org, ...donde }, data: { precioImpreso, precioDigital } });
    if (!filas.count) await prisma.tarifaEspecial.create({ data: { organizationId: org, ...donde, precioImpreso, precioDigital } });
  }
  revalidatePath("/convenios");
  return {};
}
