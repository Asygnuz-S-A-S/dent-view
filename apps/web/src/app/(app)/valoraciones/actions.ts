"use server";

import { prisma } from "@dent-view/db";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { z } from "zod";
import { generarCodigoAcceso, generarToken, hashCodigo, hashToken } from "@/lib/entrega";
import { registrarEvento } from "@/lib/eventos";
import { fechaCorta } from "@/lib/fechas";
import { claveOriginal, claveVariante, EXTENSION, type TipoImagen } from "@/lib/imagenes";
import { borrarS3, bytesS3, guardarS3 } from "@/lib/imagenes-servidor";
import { secreto } from "@/lib/resultados";
import { exigirContexto, exigirModulo } from "@/lib/sesion";
import {
  DIAS_RESULTADO, DIAS_VENCIMIENTO, INFO_ANGULO, MAX_NOTA_FOTO, PLANTILLAS_CAPTURA, ROLES_VER_VALORACIONES, ANGULOS, claveCopia, claveValida, enlaceWhatsapp, esquemaMensaje, esquemaResultado, esquemaSolicitud, estadoEfectivo, transicionValida, vencimiento,
  type Angulo, type EstadoVal,
} from "@/lib/valoraciones";
import {
  contextoValoraciones, enlacePublico, enviarCredenciales, nombreCentro, odontologosDelCentro, pacienteDeValoracion, regenerarCredenciales, valoracionVisible, type ContextoVal,
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
  // El especialista solo crea solicitudes para sí mismo.
  const doctorId = ctx.rol === "especialista" ? ctx.usuario.id : d.doctorId || null;
  if (doctorId && !odontologos.some((o) => o.userId === doctorId)) return { error: "El odontólogo elegido no es válido." };
  // Tomas sugeridas: las marcadas a mano, o las de la plantilla; vacío = todas (solicitudes anteriores a las plantillas).
  const elegidas = d.angulos?.length ? d.angulos : d.plantilla ? PLANTILLAS_CAPTURA[d.plantilla].angulos : [];
  const angulosPedidos = ANGULOS.filter((a) => (elegidas as readonly string[]).includes(a));

  let leadId = lead?.id ?? null;
  if (!paciente && !lead) {
    const nuevo = await prisma.lead.create({ data: { organizationId: org, nombre: d.nombre, telefono: d.telefono || null, correo: d.correo || null, ciudad: d.ciudad || null, origen: "VALORACION_VIRTUAL", interes: "Valoración virtual", consentimientoMercadeo: false } });
    leadId = nuevo.id;
  }
  const token = generarToken(), codigo = generarCodigoAcceso(), tokenHash = hashToken(token), expiraEn = vencimiento(DIAS_VENCIMIENTO);
  const v = await prisma.valoracion.create({
    data: {
      organizationId: org, pacienteId: paciente?.id ?? null, leadId, nombre: d.nombre, telefono: d.telefono || null, correo: d.correo || null, ciudad: d.ciudad || null,
      motivo: d.motivo, doctorId, estado: "PENDIENTE_PACIENTE", tokenHash, codigoHash: hashCodigo(tokenHash, codigo, secreto()), expiraEn, creadoPorId: ctx.usuario.id,
      plantillaCaptura: d.plantilla ?? null, angulosPedidos, enlaceEnviadoEn: new Date(),
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
  if (!ctx.puedeAsignar) return { error: "No tienes permiso para asignar." };
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
  await prisma.valoracion.update({ where: { id }, data: { resultadoEnviadoEn: new Date() } });
  await registrarEvento({ organizationId: v.organizationId, pacienteId: v.pacienteId, actorId: ctx.usuario.id, tipo: "valoracion.resultado_enviado", detalle: { valoracionId: id } });
  const credenciales = await paraMostrar(v, c, "VALORACION_RESULTADO");
  refrescar(id);
  return { credenciales };
}

/** Notas internas: solo las ve y escribe quien valora (nunca recepción ni el paciente). */
export async function guardarNotasInternas(id: string, texto: string): Promise<R> {
  const ctx = await ctxPersonal();
  const v = await valoracionVisible(ctx, id);
  if (!v || !ctx.puedeValorar) return { error: "No tienes permiso para escribir notas internas." };
  const r = z.string().max(3000, "Las notas admiten hasta 3000 caracteres").safeParse(texto);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Notas inválidas" };
  await prisma.valoracion.update({ where: { id }, data: { notasInternas: r.data.trim() || null } });
  await registrarEvento({ organizationId: v.organizationId, pacienteId: v.pacienteId, actorId: ctx.usuario.id, tipo: "valoracion.notas", detalle: { valoracionId: id } }); // sin el contenido
  refrescar(id);
  return {};
}

/** Comentario de quien valora sobre una foto: solo lo ven quienes valoran (nunca recepción ni el paciente). */
export async function guardarNotaFoto(id: string, mediaId: string, texto: string): Promise<R> {
  const ctx = await ctxPersonal();
  const v = await valoracionVisible(ctx, id);
  if (!v || !ctx.puedeValorar) return { error: "No tienes permiso para comentar fotos." };
  const r = z.string().max(MAX_NOTA_FOTO, `El comentario admite hasta ${MAX_NOTA_FOTO} caracteres`).safeParse(texto);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Comentario inválido" };
  const { count } = await prisma.valoracionMedia.updateMany({ where: { id: mediaId, valoracionId: id, organizationId: v.organizationId, tipo: "FOTO" }, data: { nota: r.data.trim() || null } });
  if (count !== 1) return { error: "Foto no encontrada." };
  await registrarEvento({ organizationId: v.organizationId, pacienteId: v.pacienteId, actorId: ctx.usuario.id, tipo: "valoracion.nota_foto", detalle: { valoracionId: id, medioId: mediaId } }); // sin el contenido
  refrescar(id);
  return {};
}

/**
 * Copia una foto de la valoración a la ficha del paciente (Imágenes). La foto pasa a ser visible para quien ve las imágenes del paciente, por eso la UI pide confirmación.
 * La reserva atómica con imagenEstudioId evita duplicarla si se pulsa dos veces; si la copia falla se deshace.
 */
export async function guardarFotoEnFicha(id: string, mediaId: string): Promise<R> {
  const ctx = await ctxPersonal();
  const v = await valoracionVisible(ctx, id);
  if (!v || !ctx.puedeValorar) return { error: "No tienes permiso para guardar fotos en la ficha." };
  const m = await prisma.valoracionMedia.findFirst({ where: { id: mediaId, valoracionId: id, organizationId: v.organizationId, tipo: "FOTO" } });
  if (!m || !claveValida(m.claveS3, v.organizationId, id)) return { error: "Foto no encontrada." };
  const pacienteId = await pacienteDeValoracion(v);
  if (!pacienteId) return { error: "Esta solicitud aún no tiene ficha de paciente: créala o vincúlala primero." };
  const imagenId = randomUUID();
  const { count } = await prisma.valoracionMedia.updateMany({ where: { id: mediaId, valoracionId: id, organizationId: v.organizationId, imagenEstudioId: null }, data: { imagenEstudioId: imagenId } });
  if (count !== 1) return { error: "Esta foto ya está en la ficha del paciente." };
  const mime = m.mime as TipoImagen, original = claveOriginal(v.organizationId, imagenId, mime), llaves = [original, claveVariante(original, "web"), claveVariante(original, "thumb")];
  try {
    const [orig, web, thumb] = await Promise.all([bytesS3(m.claveS3), bytesS3(claveCopia(m.claveS3, "web")), bytesS3(claveCopia(m.claveS3, "thumb"))]);
    if (!orig || !web || !thumb) throw new Error("No se pudo leer la foto original");
    await Promise.all([guardarS3(llaves[0]!, orig, mime), guardarS3(llaves[1]!, web, "image/jpeg"), guardarS3(llaves[2]!, thumb, "image/jpeg")]);
    await prisma.imagenEstudio.create({
      data: {
        id: imagenId, organizationId: v.organizationId, pacienteId, claveS3: original, nombreOriginal: `valoracion-${m.angulo.toLowerCase()}.${EXTENSION[mime]}`, mime, bytes: orig.length, ancho: m.ancho, alto: m.alto,
        titulo: `Valoración virtual · ${INFO_ANGULO[m.angulo as Angulo].etiqueta} · ${fechaCorta(m.creadoEn)}`, subidoPorId: ctx.usuario.id,
      },
    });
  } catch (e) {
    console.error("No se pudo guardar la foto en la ficha", e);
    await Promise.all(llaves.map(borrarS3));
    await prisma.valoracionMedia.updateMany({ where: { id: mediaId, imagenEstudioId: imagenId }, data: { imagenEstudioId: null } });
    return { error: "No se pudo guardar la foto en la ficha. Inténtalo de nuevo." };
  }
  await registrarEvento({ organizationId: v.organizationId, pacienteId, actorId: ctx.usuario.id, tipo: "valoracion.foto_en_ficha", detalle: { valoracionId: id, medioId: mediaId, imagenId } });
  refrescar(id);
  return {};
}
