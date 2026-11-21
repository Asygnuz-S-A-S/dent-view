"use server";

// Implementación independiente (sala limpia) a partir de docs/sala-limpia/02-consentimientos-y-proteccion-de-datos.md
import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  ESTADOS_SOLICITUD, fechaLimite, normalizarFinalidad, solicitudCerrada, TIPOS_SOLICITUD, transicionSolicitudValida, type EstadoSolicitud, type TipoSolicitud,
} from "@/lib/consentimientos";
import { registrarEvento } from "@/lib/eventos";
import { CLINICOS, GESTION } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

type R = { error?: string };

const esquemaAut = z.object({
  pacienteId: z.string().min(1),
  tipo: z.enum(["DATOS", "PROCEDIMIENTO"]),
  finalidad: z.string().transform(normalizarFinalidad).pipe(z.string().min(1, "Indica la finalidad").max(200)),
  otorgada: z.boolean(),
  textoMostrado: z.string().trim().max(5000).optional(),
  version: z.string().trim().max(30).optional(),
  ordenId: z.string().nullish(),
});

/** Agrega un registro de autorización/consentimiento (nunca modifica ni borra los anteriores). */
export async function registrarAutorizacion(entrada: z.input<typeof esquemaAut>): Promise<R> {
  const ctx = await exigirContexto(CLINICOS);
  const r = esquemaAut.safeParse(entrada);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const d = r.data;
  if (d.otorgada && !d.textoMostrado) return { error: "Falta el texto que se mostró al titular" };
  const paciente = await prisma.pacienteTenant.findFirst({ where: { id: d.pacienteId, organizationId: ctx.organizationId } });
  if (!paciente) return { error: "Paciente no encontrado" };
  if (d.ordenId && !(await prisma.orden.findFirst({ where: { id: d.ordenId, organizationId: ctx.organizationId, pacienteId: paciente.id } }))) return { error: "Orden no válida" };
  const ahora = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.autorizacion.create({
      data: {
        organizationId: ctx.organizationId, pacienteId: paciente.id, tipo: d.tipo, finalidad: d.finalidad, otorgada: d.otorgada,
        textoMostrado: d.otorgada ? d.textoMostrado : null, version: d.version || null, ordenId: d.ordenId ?? null,
        otorgadaEn: d.otorgada ? ahora : null, revocadaEn: d.otorgada ? null : ahora, registradoPorId: ctx.usuario.id,
      },
    });
    await registrarEvento({ organizationId: ctx.organizationId, pacienteId: paciente.id, actorId: ctx.usuario.id, tipo: d.otorgada ? "autorizacion.otorgada" : "autorizacion.revocada", detalle: { finalidad: d.finalidad, tipo: d.tipo } }, tx);
    // "No contactar" sigue a la autorización vigente de la finalidad de mensajería.
    if (d.finalidad === "contacto por mensajería") {
      const noContactar = !d.otorgada;
      await tx.preferenciaContacto.upsert({ where: { pacienteId: paciente.id }, create: { pacienteId: paciente.id, organizationId: ctx.organizationId, noContactar }, update: { noContactar } });
    }
  });
  revalidatePath(`/pacientes/${paciente.id}`);
  return {};
}

const esquemaSol = z.object({
  pacienteId: z.string().nullish(),
  solicitanteNombre: z.string().trim().min(2, "Falta el nombre del solicitante").max(100),
  solicitanteCorreo: z.string().trim().email("Correo inválido"),
  tipo: z.enum(TIPOS_SOLICITUD),
  notas: z.string().trim().max(2000).optional(),
});

export async function crearSolicitud(entrada: z.input<typeof esquemaSol>): Promise<R> {
  const ctx = await exigirContexto(GESTION);
  const r = esquemaSol.safeParse(entrada);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const d = r.data;
  if (d.pacienteId && !(await prisma.pacienteTenant.findFirst({ where: { id: d.pacienteId, organizationId: ctx.organizationId } }))) return { error: "Paciente no encontrado" };
  const recibida = new Date();
  await prisma.$transaction(async (tx) => {
    const s = await tx.solicitudTitular.create({
      data: {
        organizationId: ctx.organizationId, pacienteId: d.pacienteId ?? null, solicitanteNombre: d.solicitanteNombre, solicitanteCorreo: d.solicitanteCorreo,
        tipo: d.tipo, notas: d.notas || null, recibidaEn: recibida, venceEn: fechaLimite(d.tipo as TipoSolicitud, recibida), registradoPorId: ctx.usuario.id,
      },
    });
    await registrarEvento({ organizationId: ctx.organizationId, pacienteId: d.pacienteId ?? null, actorId: ctx.usuario.id, tipo: "solicitud.creada", detalle: { solicitudId: s.id, tipo: d.tipo } }, tx);
  });
  revalidatePath("/proteccion-datos");
  return {};
}

/** Las solicitudes no se borran: solo cambian de estado (con fecha de resolución al cerrar). */
export async function cambiarEstadoSolicitud(id: string, estado: string): Promise<R> {
  const ctx = await exigirContexto(GESTION);
  if (!(ESTADOS_SOLICITUD as readonly string[]).includes(estado)) return { error: "Estado inválido" };
  const nuevo = estado as EstadoSolicitud;
  const s = await prisma.solicitudTitular.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!s) return { error: "Solicitud no encontrada" };
  if (!transicionSolicitudValida(s.estado as EstadoSolicitud, nuevo)) return { error: "Transición no permitida" };
  await prisma.$transaction(async (tx) => {
    await tx.solicitudTitular.update({ where: { id }, data: { estado: nuevo, resueltaEn: solicitudCerrada(nuevo) ? new Date() : null } });
    await registrarEvento({ organizationId: ctx.organizationId, pacienteId: s.pacienteId, actorId: ctx.usuario.id, tipo: "solicitud.estado", detalle: { solicitudId: id, de: s.estado, a: nuevo } }, tx);
  });
  revalidatePath("/proteccion-datos");
  return {};
}
