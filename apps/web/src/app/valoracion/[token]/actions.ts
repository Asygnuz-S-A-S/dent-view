"use server";

import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { PREFIJO_ACCESO } from "@/lib/bitacora";
import { hashCodigo, hashToken, igualesSeguro, limitarIp, MENSAJE_INVALIDO } from "@/lib/entrega";
import { registrarEvento } from "@/lib/eventos";
import { secreto } from "@/lib/resultados";
import {
  CONSENTIMIENTO_VERSION, MAX_INTENTOS_CODIGO, estadoCodigo, truncarIp, esquemaCuestionario, esquemaMensaje, faltaParaEnviar, pacienteEdita, venceSesionValoracion, type Cuestionario,
} from "@/lib/valoraciones";
import { avisarOdontologo, fijarCookiePaciente, ipCliente, valoracionDelPaciente } from "@/lib/valoraciones-servidor";

const porIp = new Map<string, number[]>(); // shortcut: en memoria del proceso (ver limitarIp)
const porValoracion = new Map<string, number[]>();
const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;
const SESION_VENCIDA = "Tu sesión venció. Ingresa de nuevo el código.";

/** Valida el código del enlace. Mismo mensaje para token inexistente, vencido, cancelado, bloqueado o código errado. */
export async function verificarCodigoValoracion(token: string, codigo: string): Promise<{ error?: string }> {
  const ip = await ipCliente();
  if (!limitarIp(porIp, ip)) return { error: "Demasiados intentos desde tu conexión. Inténtalo de nuevo más tarde." };
  const c = /^\d{6}$/.exec(codigo.trim())?.[0];
  if (!c || !TOKEN.test(token)) return { error: MENSAJE_INVALIDO };
  const tokenHash = hashToken(token);
  const v = await prisma.valoracion.findUnique({ where: { tokenHash } });
  if (!v?.codigoHash || estadoCodigo(v) !== "ACTIVO") return { error: MENSAJE_INVALIDO };
  const traza = (accion: string) => registrarEvento({ organizationId: v.organizationId, pacienteId: v.pacienteId, tipo: `${PREFIJO_ACCESO}valoracion`, detalle: { accion, valoracionId: v.id, ip: truncarIp(ip) } });
  // Reserva atómica de un intento: nunca se comparan más de MAX_INTENTOS_CODIGO códigos, ni con peticiones en paralelo.
  const { count } = await prisma.valoracion.updateMany({ where: { id: v.id, intentosCodigo: { lt: MAX_INTENTOS_CODIGO } }, data: { intentosCodigo: { increment: 1 } } });
  if (count !== 1) { await traza("bloqueado"); return { error: MENSAJE_INVALIDO }; }
  if (!igualesSeguro(hashCodigo(tokenHash, c, secreto()), v.codigoHash)) { await traza("codigo_fallido"); return { error: MENSAJE_INVALIDO }; }
  await prisma.valoracion.update({ where: { id: v.id }, data: { intentosCodigo: 0 } });
  await fijarCookiePaciente({ id: v.id, tokenHash }, venceSesionValoracion(new Date(), v.expiraEn));
  await traza("codigo_ok");
  return {};
}

type R = { error?: string; ok?: true };

/** Consentimiento (texto versionado, fecha e IP truncada) y cuestionario. El consentimiento se registra una sola vez por versión. */
export async function guardarCuestionario(token: string, entrada: Cuestionario & { acepto?: boolean }): Promise<R> {
  const v = await valoracionDelPaciente(token);
  if (!v || !pacienteEdita(v)) return { error: SESION_VENCIDA };
  const r = esquemaCuestionario.safeParse(entrada);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const yaAcepto = v.consentimientoEn && v.consentimientoVersion === CONSENTIMIENTO_VERSION;
  if (!yaAcepto && !entrada.acepto) return { error: "Debes aceptar el consentimiento para continuar." };
  const ip = truncarIp(await ipCliente());
  await prisma.valoracion.update({
    where: { id: v.id },
    data: { cuestionario: r.data, motivo: r.data.motivo, ...(yaAcepto ? {} : { consentimientoEn: new Date(), consentimientoVersion: CONSENTIMIENTO_VERSION, consentimientoIp: ip }) },
  });
  if (!yaAcepto) await registrarEvento({ organizationId: v.organizationId, pacienteId: v.pacienteId, tipo: "valoracion.consentimiento", detalle: { valoracionId: v.id, version: CONSENTIMIENTO_VERSION } });
  revalidatePath(`/valoracion/${token}`);
  return { ok: true };
}

/** "Enviar valoración": pasa a RECIBIDA (de forma atómica) y avisa al odontólogo sin datos del paciente. */
export async function enviarValoracion(token: string): Promise<R> {
  const v = await valoracionDelPaciente(token);
  if (!v || !pacienteEdita(v)) return { error: SESION_VENCIDA };
  const medios = await prisma.valoracionMedia.findMany({ where: { valoracionId: v.id, organizationId: v.organizationId }, select: { tipo: true, angulo: true } });
  const falta = faltaParaEnviar({ consentimiento: !!v.consentimientoEn, motivo: v.motivo, medios });
  if (falta) return { error: falta };
  const { count } = await prisma.valoracion.updateMany({ where: { id: v.id, estado: { in: ["PENDIENTE_PACIENTE", "REQUIERE_MAS_INFO"] } }, data: { estado: "RECIBIDA" } });
  if (count !== 1) return { error: SESION_VENCIDA };
  await registrarEvento({ organizationId: v.organizationId, pacienteId: v.pacienteId, tipo: "valoracion.recibida", detalle: { valoracionId: v.id, fotos: medios.filter((m) => m.tipo === "FOTO").length } });
  await avisarOdontologo(v).catch((e) => console.error("No se pudo avisar al odontólogo", e));
  revalidatePath(`/valoracion/${token}`);
  return { ok: true };
}

/** El paciente responde en el hilo (aclaraciones al profesional). */
export async function responderMensaje(token: string, texto: string): Promise<R> {
  const v = await valoracionDelPaciente(token);
  if (!v || v.estado === "COMPLETADA") return { error: SESION_VENCIDA };
  if (!limitarIp(porValoracion, v.id, Date.now(), 20, 60 * 60_000)) return { error: "Demasiados mensajes. Inténtalo más tarde." };
  const r = esquemaMensaje.pick({ texto: true }).safeParse({ texto });
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Mensaje inválido" };
  await prisma.valoracionMensaje.create({ data: { organizationId: v.organizationId, valoracionId: v.id, autor: "PACIENTE", texto: r.data.texto } });
  await registrarEvento({ organizationId: v.organizationId, pacienteId: v.pacienteId, tipo: "valoracion.mensaje", detalle: { valoracionId: v.id, autor: "PACIENTE" } });
  revalidatePath(`/valoracion/${token}`);
  return { ok: true };
}
