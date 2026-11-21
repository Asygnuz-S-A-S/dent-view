"use server";

// Implementación independiente (sala limpia) a partir de docs/sala-limpia/05-historia-clinica.md
import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { esquemaAntecedentes, esquemaContacto, esquemaRepresentante } from "@/lib/historia-clinica";
import { registrarEvento } from "@/lib/eventos";
import { CLINICOS, MEDICOS } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";
import type { z } from "zod";

type R = { error?: string };

const pacienteDelCentro = (id: string, organizationId: string) => prisma.pacienteTenant.findFirst({ where: { id, organizationId } });
const primerError = (e: z.ZodError) => e.issues[0]?.message ?? "Datos inválidos";

/** Reemplazo completo y atómico: lo enviado queda activo, lo anterior se archiva (nunca se borra). */
export async function guardarAntecedentes(pacienteId: string, entrada: unknown): Promise<R> {
  const ctx = await exigirContexto(MEDICOS);
  const r = esquemaAntecedentes.safeParse(entrada);
  if (!r.success) return { error: primerError(r.error) };
  if (!(await pacienteDelCentro(pacienteId, ctx.organizationId))) return { error: "Paciente no encontrado" };
  const { contexto: c, alergias, medicaciones, enfermedades } = r.data;
  const org = ctx.organizationId;
  const ahora = new Date();
  const fila = { organizationId: org, pacienteId };
  const datosContexto = {
    organizationId: org, embarazo: c.embarazo, semanasEmbarazo: c.embarazo ? (c.semanasEmbarazo ?? null) : null, lactancia: c.lactancia,
    anticoagulantes: c.anticoagulantes, anticoagulanteNombre: c.anticoagulantes ? (c.anticoagulanteNombre ?? null) : null,
    inr: c.anticoagulantes ? (c.inr ?? null) : null, inrFecha: c.inrFecha ? new Date(`${c.inrFecha}T00:00:00Z`) : null,
    reaccionAnestesia: c.reaccionAnestesia, detalleAnestesia: c.reaccionAnestesia ? (c.detalleAnestesia ?? null) : null,
    implantesMetalicos: c.implantesMetalicos, marcapasos: c.marcapasos, claustrofobia: c.claustrofobia,
    estudiosRecientes: c.estudiosRecientes ?? null, actualizadoEn: ahora, actualizadoPorId: ctx.usuario.id,
  };
  await prisma.$transaction(async (tx) => {
    const baja = { where: { pacienteId, organizationId: org, activo: true }, data: { activo: false, archivadoEn: ahora } };
    await tx.alergiaPaciente.updateMany(baja);
    await tx.medicacionPaciente.updateMany(baja);
    await tx.enfermedadPaciente.updateMany(baja);
    await tx.alergiaPaciente.createMany({ data: alergias.map((a) => ({ ...fila, nombre: a.nombre, gravedad: a.gravedad, reaccion: a.reaccion ?? null, notas: a.notas ?? null })) });
    await tx.medicacionPaciente.createMany({ data: medicaciones.map((m) => ({ ...fila, nombre: m.nombre, notas: m.notas ?? null })) });
    await tx.enfermedadPaciente.createMany({ data: enfermedades.map((e) => ({ ...fila, nombre: e.nombre, critica: e.critica, notas: e.notas ?? null })) });
    await tx.contextoMedico.upsert({ where: { pacienteId }, create: { pacienteId, ...datosContexto }, update: datosContexto });
    await registrarEvento(
      { organizationId: org, pacienteId, actorId: ctx.usuario.id, tipo: "historia.antecedentes", detalle: { alergias: alergias.length, medicaciones: medicaciones.length, enfermedades: enfermedades.length } },
      tx,
    );
  });
  revalidatePath(`/pacientes/${pacienteId}`);
  return {};
}

export async function guardarContacto(pacienteId: string, entrada: z.input<typeof esquemaContacto> & { esRepresentante?: boolean }): Promise<R> {
  const ctx = await exigirContexto(CLINICOS);
  const r = esquemaContacto.safeParse(entrada);
  if (!r.success) return { error: primerError(r.error) };
  if (!(await pacienteDelCentro(pacienteId, ctx.organizationId))) return { error: "Paciente no encontrado" };
  const d = { organizationId: ctx.organizationId, nombre: r.data.nombre, parentesco: r.data.parentesco ?? null, telefono: r.data.telefono, correo: r.data.correo ?? null, esRepresentante: !!entrada.esRepresentante, activo: true };
  // upsert reactiva el registro archivado: un único contacto por paciente.
  await prisma.contactoEmergencia.upsert({ where: { pacienteId }, create: { pacienteId, ...d }, update: d });
  await registrarEvento({ organizationId: ctx.organizationId, pacienteId, actorId: ctx.usuario.id, tipo: "historia.contacto" });
  revalidatePath(`/pacientes/${pacienteId}`);
  return {};
}

export async function eliminarContacto(pacienteId: string): Promise<R> {
  const ctx = await exigirContexto(CLINICOS);
  const { count } = await prisma.contactoEmergencia.updateMany({ where: { pacienteId, organizationId: ctx.organizationId, activo: true }, data: { activo: false } });
  if (!count) return { error: "No encontrado" };
  await registrarEvento({ organizationId: ctx.organizationId, pacienteId, actorId: ctx.usuario.id, tipo: "historia.contacto_baja" });
  revalidatePath(`/pacientes/${pacienteId}`);
  return {};
}

export async function guardarRepresentante(pacienteId: string, entrada: z.input<typeof esquemaRepresentante>): Promise<R> {
  const ctx = await exigirContexto(CLINICOS);
  const r = esquemaRepresentante.safeParse(entrada);
  if (!r.success) return { error: primerError(r.error) };
  if (!(await pacienteDelCentro(pacienteId, ctx.organizationId))) return { error: "Paciente no encontrado" };
  const x = r.data;
  const d = {
    organizationId: ctx.organizationId, nombre: x.nombre, parentesco: x.parentesco, tipoDocumento: x.tipoDocumento, numeroDocumento: x.numeroDocumento ?? null,
    telefono: x.telefono, correo: x.correo ?? null, direccion: x.direccion ?? null, notas: x.notas ?? null, activo: true,
  };
  await prisma.representanteLegal.upsert({ where: { pacienteId }, create: { pacienteId, ...d }, update: d });
  await registrarEvento({ organizationId: ctx.organizationId, pacienteId, actorId: ctx.usuario.id, tipo: "historia.representante" });
  revalidatePath(`/pacientes/${pacienteId}`);
  return {};
}

export async function eliminarRepresentante(pacienteId: string): Promise<R> {
  const ctx = await exigirContexto(CLINICOS);
  const { count } = await prisma.representanteLegal.updateMany({ where: { pacienteId, organizationId: ctx.organizationId, activo: true }, data: { activo: false } });
  if (!count) return { error: "No encontrado" };
  await registrarEvento({ organizationId: ctx.organizationId, pacienteId, actorId: ctx.usuario.id, tipo: "historia.representante_baja" });
  revalidatePath(`/pacientes/${pacienteId}`);
  return {};
}
