"use server";

import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { z } from "zod";
import { generarCodigoAcceso, generarToken, hashCodigo, hashToken } from "@/lib/entrega";
import { registrarEvento } from "@/lib/eventos";
import { secreto } from "@/lib/resultados";
import { exigirContexto, exigirModulo } from "@/lib/sesion";
import {
  DIAS_RESULTADO, DIAS_VENCIMIENTO, ROLES_VER_VALORACIONES, enlaceWhatsapp, esquemaMensaje, esquemaResultado, esquemaSolicitud, estadoEfectivo, transicionValida, vencimiento,
  type EstadoVal,
} from "@/lib/valoraciones";
import {
  contextoValoraciones, enlacePublico, enviarCredenciales, nombreCentro, odontologosDelCentro, regenerarCredenciales, valoracionVisible, type ContextoVal,
} from "@/lib/valoraciones-servidor";

/** Credenciales que se muestran al personal una sola vez (en BD solo quedan los hashes). */
export type Credenciales = { enlace: string; codigo: string; vence: string; whatsapp: string | null; correoEnviado: boolean };
type R = { error?: string };
/** Con datos: se distingue con `"error" in r` (como ResultadoOrden). */
type D<T> = { error: string } | T;

async function ctxPersonal(): Promise<ContextoVal> {
  const base = await exigirContexto(ROLES_VER_VALORACIONES); // redirige/404 por sesión, clave temporal, MFA o rol
  await exigirModulo(base, "valoraciones");
  const ctx = await contextoValoraciones();
  if (!ctx) notFound();
  return ctx;
}
const refrescar = (id?: string) => { revalidatePath("/valoraciones"); if (id) revalidatePath(`/valoraciones/${id}`); };

async function paraMostrar(v: { id: string; organizationId: string; pacienteId: string | null; correo: string | null; telefono: string | null }, c: { token: string; codigo: string; expiraEn: Date }, tipo: "VALORACION_ENLACE" | "VALORACION_RESULTADO"): Promise<Credenciales> {
  const enlace = enlacePublico(c.token);
  const centro = await nombreCentro(v.organizationId);
  const mensaje = tipo === "VALORACION_ENLACE" ? `Hola, ${centro} te invita a completar tu valoración virtual desde tu celular: ${enlace}` : `Hola, ${centro} ya tiene lista tu valoración virtual: ${enlace}`;
  return {
    enlace, codigo: c.codigo, vence: c.expiraEn.toLocaleDateString("es-CO", { timeZone: "America/Bogota", dateStyle: "long" }),
    whatsapp: enlaceWhatsapp(v.telefono, mensaje), correoEnviado: await enviarCredenciales(v, c, tipo),
  };
}
const actividad = (v: { organizationId: string; leadId: string | null; pacienteId: string | null }, texto: string, autorId: string) =>
  v.leadId || v.pacienteId ? prisma.actividadLead.create({ data: { organizationId: v.organizationId, leadId: v.leadId, pacienteId: v.leadId ? null : v.pacienteId, tipo: "VALORACION", texto, autorId } }) : null;

/** Crea la solicitud (desde un paciente, un lead o persona nueva → Lead VALORACION_VIRTUAL) y genera el enlace + código. */
export async function crearSolicitud(entrada: z.input<typeof esquemaSolicitud>): Promise<D<{ id: string; credenciales: Credenciales }>> {
  const ctx = await ctxPersonal();
  if (!ctx.puedeCrear) return { error: "No tienes permiso para crear solicitudes." };
  const r = esquemaSolicitud.safeParse(entrada);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const d = r.data, org = ctx.organizationId;
  const [paciente, lead, odontologos] = await Promise.all([
    d.pacienteId ? prisma.pacienteTenant.findFirst({ where: { id: d.pacienteId, organizationId: org }, select: { id: true } }) : null,
    d.leadId ? prisma.lead.findFirst({ where: { id: d.leadId, organizationId: org }, select: { id: true } }) : null,
    odontologosDelCentro(org),
  ]);
  if ((d.pacienteId && !paciente) || (d.leadId && !lead)) return { error: "Paciente o lead no encontrado." };
  if (d.doctorId && !odontologos.some((o) => o.userId === d.doctorId)) return { error: "El odontólogo elegido no es válido." };

  let leadId = lead?.id ?? null;
  if (!paciente && !lead) {
    const nuevo = await prisma.lead.create({ data: { organizationId: org, nombre: d.nombre, telefono: d.telefono || null, correo: d.correo || null, ciudad: d.ciudad || null, origen: "VALORACION_VIRTUAL", interes: "Valoración virtual", consentimientoMercadeo: false } });
    leadId = nuevo.id;
  }
  const token = generarToken(), codigo = generarCodigoAcceso(), tokenHash = hashToken(token), expiraEn = vencimiento(DIAS_VENCIMIENTO);
  const v = await prisma.valoracion.create({
    data: {
      organizationId: org, pacienteId: paciente?.id ?? null, leadId, nombre: d.nombre, telefono: d.telefono || null, correo: d.correo || null, ciudad: d.ciudad || null,
      motivo: d.motivo, doctorId: d.doctorId || null, estado: "PENDIENTE_PACIENTE", tokenHash, codigoHash: hashCodigo(tokenHash, codigo, secreto()), expiraEn, creadoPorId: ctx.usuario.id,
    },
  });
  await registrarEvento({ organizationId: org, pacienteId: v.pacienteId, actorId: ctx.usuario.id, tipo: "valoracion.creada", detalle: { valoracionId: v.id, leadId, doctorId: v.doctorId } });
  await actividad(v, "Solicitud de valoración virtual creada", ctx.usuario.id);
  const credenciales = await paraMostrar(v, { token, codigo, expiraEn }, "VALORACION_ENLACE");
  refrescar();
  return { id: v.id, credenciales };
}

/** Genera un enlace + código nuevos (el anterior deja de servir) y los envía; también reactiva una solicitud vencida. */
export async function reenviarEnlace(id: string): Promise<D<{ credenciales: Credenciales }>> {
  const ctx = await ctxPersonal();
  const v = await valoracionVisible(ctx, id);
  if (!v || !(ctx.puedeCrear || ctx.puedeValorar)) return { error: "Valoración no encontrada." };
  const e = estadoEfectivo(v);
  if (e !== "PENDIENTE_PACIENTE" && e !== "REQUIERE_MAS_INFO" && e !== "EXPIRADA") return { error: "Esta valoración ya no espera al paciente." };
  const c = await regenerarCredenciales(v.id);
  if (e === "EXPIRADA") await prisma.valoracion.update({ where: { id: v.id }, data: { estado: "PENDIENTE_PACIENTE" } });
  await registrarEvento({ organizationId: v.organizationId, pacienteId: v.pacienteId, actorId: ctx.usuario.id, tipo: "valoracion.enlace_reenviado", detalle: { valoracionId: v.id } });
  const credenciales = await paraMostrar(v, c, "VALORACION_ENLACE");
  refrescar(id);
  return { credenciales };
}

export async function cancelarValoracion(id: string): Promise<R> {
  const ctx = await ctxPersonal();
  const v = await valoracionVisible(ctx, id);
  if (!v || !(ctx.puedeCrear || ctx.puedeValorar)) return { error: "Valoración no encontrada." };
  if (!transicionValida(v.estado as EstadoVal, "CANCELADA")) return { error: "Esta valoración ya no se puede cancelar." };
  await prisma.valoracion.update({ where: { id }, data: { estado: "CANCELADA" } });
  await registrarEvento({ organizationId: v.organizationId, pacienteId: v.pacienteId, actorId: ctx.usuario.id, tipo: "valoracion.cancelada", detalle: { valoracionId: id } });
  refrescar(id);
  return {};
}

export async function asignarOdontologo(id: string, doctorId: string | null): Promise<R> {
  const ctx = await ctxPersonal();
  if (!ctx.puedeCrear) return { error: "No tienes permiso para asignar." };
  const v = await prisma.valoracion.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!v) return { error: "Valoración no encontrada." };
  if (doctorId && !(await odontologosDelCentro(ctx.organizationId)).some((o) => o.userId === doctorId)) return { error: "El odontólogo elegido no es válido." };
  await prisma.valoracion.update({ where: { id }, data: { doctorId } });
  await registrarEvento({ organizationId: v.organizationId, pacienteId: v.pacienteId, actorId: ctx.usuario.id, tipo: "valoracion.asignada", detalle: { valoracionId: id, doctorId } });
  refrescar(id);
  return {};
}

/** Mensaje del profesional (aclarar o pedir una foto concreta): pasa a REQUIERE_MAS_INFO y reenvía el acceso al paciente. */
export async function enviarMensajeProfesional(id: string, entrada: z.input<typeof esquemaMensaje>): Promise<D<{ credenciales: Credenciales }>> {
  const ctx = await ctxPersonal();
  const v = await valoracionVisible(ctx, id);
  if (!v || !ctx.puedeValorar) return { error: "No tienes permiso para escribir al paciente." };
  const r = esquemaMensaje.safeParse(entrada);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Mensaje inválido" };
  if (!["RECIBIDA", "EN_REVISION", "REQUIERE_MAS_INFO"].includes(v.estado)) return { error: "En este estado no se puede escribir al paciente." };
  await prisma.valoracionMensaje.create({ data: { organizationId: v.organizationId, valoracionId: id, autor: "PROFESIONAL", autorId: ctx.usuario.id, texto: r.data.texto, solicitaMedia: r.data.solicitaMedia ?? null } });
  const c = await regenerarCredenciales(id); // el token no se guarda: para que el paciente vuelva hace falta un acceso nuevo
  await prisma.valoracion.update({ where: { id }, data: { estado: "REQUIERE_MAS_INFO" } });
  await registrarEvento({ organizationId: v.organizationId, pacienteId: v.pacienteId, actorId: ctx.usuario.id, tipo: "valoracion.mensaje", detalle: { valoracionId: id, autor: "PROFESIONAL", solicitaMedia: r.data.solicitaMedia ?? null } });
  const credenciales = await paraMostrar(v, c, "VALORACION_ENLACE");
  refrescar(id);
  return { credenciales };
}

const cuerpoGuardar = esquemaResultado.extend({ presupuestoEstimado: z.number().int().min(0).max(1_000_000_000).nullable() });
/** Guarda la valoración; con `completar` valida que esté todo y pasa a COMPLETADA. */
export async function guardarResultado(id: string, entrada: z.input<typeof cuerpoGuardar>, completar: boolean): Promise<R> {
  const ctx = await ctxPersonal();
  const v = await valoracionVisible(ctx, id);
  if (!v || !ctx.puedeValorar) return { error: "No tienes permiso para valorar." };
  if (["COMPLETADA", "CANCELADA", "EXPIRADA", "BORRADOR"].includes(v.estado)) return { error: "Esta valoración ya no se puede editar." };
  const r = (completar ? cuerpoGuardar : cuerpoGuardar.partial({ diagnosticoPreliminar: true, recomendaciones: true })).safeParse(entrada);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const d = r.data;
  if (completar && !transicionValida(v.estado as EstadoVal, "COMPLETADA")) return { error: "En este estado no se puede completar." };
  await prisma.valoracion.update({
    where: { id },
    data: {
      diagnosticoPreliminar: d.diagnosticoPreliminar || null, recomendaciones: d.recomendaciones || null, tratamientoSugerido: d.tratamientoSugerido || null,
      requierePresencial: d.requierePresencial, presupuestoEstimado: d.presupuestoEstimado ?? null,
      ...(completar ? { estado: "COMPLETADA", completadaEn: new Date(), doctorId: v.doctorId ?? ctx.usuario.id } : {}),
    },
  });
  await registrarEvento({ organizationId: v.organizationId, pacienteId: v.pacienteId, actorId: ctx.usuario.id, tipo: completar ? "valoracion.completada" : "valoracion.guardada", detalle: { valoracionId: id, requierePresencial: d.requierePresencial } });
  if (completar) await actividad(v, "Valoración virtual completada", ctx.usuario.id);
  refrescar(id);
  return {};
}

/** Correo con enlace seguro al resultado (se ve en la misma página pública, tras verificar el código). */
export async function enviarResultado(id: string): Promise<D<{ credenciales: Credenciales }>> {
  const ctx = await ctxPersonal();
  const v = await valoracionVisible(ctx, id);
  if (!v || !ctx.puedeValorar) return { error: "No tienes permiso para enviar el resultado." };
  if (v.estado !== "COMPLETADA") return { error: "Completa la valoración antes de enviarla." };
  const c = await regenerarCredenciales(id, DIAS_RESULTADO);
  await registrarEvento({ organizationId: v.organizationId, pacienteId: v.pacienteId, actorId: ctx.usuario.id, tipo: "valoracion.resultado_enviado", detalle: { valoracionId: id } });
  const credenciales = await paraMostrar(v, c, "VALORACION_RESULTADO");
  refrescar(id);
  return { credenciales };
}
