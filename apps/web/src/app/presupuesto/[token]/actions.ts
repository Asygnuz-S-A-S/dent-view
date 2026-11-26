"use server";

import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { PREFIJO_ACCESO } from "@/lib/bitacora";
import { hashCodigo, hashToken, igualesSeguro, limitarIp, MENSAJE_INVALIDO } from "@/lib/entrega";
import { registrarEvento } from "@/lib/eventos";
import { normalizarDocumento } from "@/lib/pacientes";
import {
  MAX_INTENTOS_CODIGO, TEXTO_ACEPTACION_VERSION, admiteRespuesta, esquemaAceptacion, esquemaPregunta, esquemaRechazo, estadoCodigo,
  textoAceptacion, totalGuardado, venceSesionPresupuesto, type EstadoPres,
} from "@/lib/presupuestos";
import { hashIp, hashTexto } from "@/lib/presupuestos-hash";
import { TOKEN_PUBLICO, avisarResponsable, fijarCookiePresupuesto, presupuestoDelPaciente } from "@/lib/presupuestos-servidor";
import { cambiarEtapaLead } from "@/lib/crm-motor-datos";
import { hoyBogota } from "@/lib/precios";
import { secreto } from "@/lib/resultados";
import { truncarIp } from "@/lib/valoraciones";
import { ipCliente, nombreCentro } from "@/lib/valoraciones-servidor";

const porIp = new Map<string, number[]>(); // shortcut: en memoria del proceso (ver limitarIp); migrar a Redis/BD con varias réplicas
const porPresupuesto = new Map<string, number[]>();
const SESION_VENCIDA = "Tu sesión venció. Ingresa de nuevo el código.";
type R = { error?: string; ok?: true };

/** Valida el código del enlace. Mismo mensaje para token inexistente, anulado, bloqueado o código errado. */
export async function verificarCodigoPresupuesto(token: string, codigo: string): Promise<{ error?: string }> {
  const ip = await ipCliente();
  if (!limitarIp(porIp, ip)) return { error: "Demasiados intentos desde tu conexión. Inténtalo de nuevo más tarde." };
  const c = /^\d{6}$/.exec(codigo.trim())?.[0];
  if (!c || !TOKEN_PUBLICO.test(token)) return { error: MENSAJE_INVALIDO };
  const tokenHash = hashToken(token);
  const p = await prisma.presupuesto.findUnique({ where: { tokenHash } });
  if (!p?.codigoHash || estadoCodigo({ estado: p.estado as EstadoPres, validoHasta: p.validoHasta, intentosCodigo: p.intentosCodigo }) !== "ACTIVO") return { error: MENSAJE_INVALIDO };
  const traza = (accion: string) => registrarEvento({ organizationId: p.organizationId, pacienteId: p.pacienteId, tipo: `${PREFIJO_ACCESO}presupuesto`, detalle: { accion, presupuestoId: p.id, ip: truncarIp(ip) } });
  // Reserva atómica de un intento: nunca se comparan más de MAX_INTENTOS_CODIGO códigos, ni con peticiones en paralelo.
  const { count } = await prisma.presupuesto.updateMany({ where: { id: p.id, intentosCodigo: { lt: MAX_INTENTOS_CODIGO } }, data: { intentosCodigo: { increment: 1 } } });
  if (count !== 1) { await traza("bloqueado"); return { error: MENSAJE_INVALIDO }; }
  if (!igualesSeguro(hashCodigo(tokenHash, c, secreto()), p.codigoHash)) { await traza("codigo_fallido"); return { error: MENSAJE_INVALIDO }; }
  await prisma.presupuesto.update({ where: { id: p.id }, data: { intentosCodigo: 0 } });
  await fijarCookiePresupuesto({ id: p.id, tokenHash }, venceSesionPresupuesto(new Date(), p.validoHasta!));
  await traza("codigo_ok");
  return {};
}

/** Marca VISTO la primera vez (una sola vez aunque haya dos pestañas) y avisa al responsable, sin datos del paciente. */
export async function marcarVisto(token: string) {
  const p = await presupuestoDelPaciente(token);
  if (!p || p.vistoEn) return;
  const { count } = await prisma.presupuesto.updateMany({ where: { id: p.id, vistoEn: null, estado: { in: ["ENVIADO", "VISTO"] } }, data: { vistoEn: new Date(), estado: "VISTO" } });
  if (count !== 1) return;
  await registrarEvento({ organizationId: p.organizationId, pacienteId: p.pacienteId, tipo: "presupuesto.visto", detalle: { presupuestoId: p.id, numero: p.numero } });
  await avisarResponsable(p, "la abrió el paciente").catch((e) => console.error("No se pudo avisar la apertura de la cotización", e));
}

/** Acepta con nombre, documento y casilla. El texto firmado se compone aquí (no lo manda el cliente) y se guarda su hash. */
export async function aceptarPresupuesto(token: string, entrada: { nombre: string; documento: string; acepto: boolean }): Promise<R> {
  const p = await presupuestoDelPaciente(token);
  if (!p) return { error: SESION_VENCIDA };
  if (!limitarIp(porPresupuesto, p.id, Date.now(), 10, 60 * 60_000)) return { error: "Demasiados intentos. Inténtalo más tarde." };
  const r = esquemaAceptacion.safeParse(entrada);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  if (!admiteRespuesta({ estado: p.estado as EstadoPres, validoHasta: p.validoHasta })) return { error: "Esta cotización ya no admite respuesta. Comunícate con el centro." };
  const [items, centro, persona] = await Promise.all([
    prisma.itemPresupuesto.findMany({ where: { presupuestoId: p.id, organizationId: p.organizationId }, select: { cantidad: true, valorUnitario: true, descuento: true } }),
    nombreCentro(p.organizationId),
    prisma.pacienteTenant.findFirst({ where: { id: p.pacienteId, organizationId: p.organizationId }, select: { persona: { select: { numeroDocumento: true } } } }),
  ]);
  const texto = textoAceptacion({ numero: p.numero, total: totalGuardado(items), validoHasta: p.validoHasta!, centro });
  const ip = truncarIp(await ipCliente());
  const { count } = await prisma.presupuesto.updateMany({
    where: { id: p.id, organizationId: p.organizationId, estado: { in: ["ENVIADO", "VISTO"] }, validoHasta: { gte: new Date(`${hoyBogota()}T00:00:00.000Z`) } },
    data: {
      estado: "ACEPTADO", aceptadoEn: new Date(), aceptadoNombre: r.data.nombre, aceptadoDocumento: r.data.documento, aceptadoIpHash: hashIp(ip, secreto()),
      textoAceptacionVersion: TEXTO_ACEPTACION_VERSION, textoAceptacionHash: hashTexto(texto),
    },
  });
  if (count !== 1) return { error: "Esta cotización ya no admite respuesta. Comunícate con el centro." };
  const coincide = !!persona && normalizarDocumento(r.data.documento) === persona.persona.numeroDocumento;
  await registrarEvento({ organizationId: p.organizationId, pacienteId: p.pacienteId, tipo: "presupuesto.aceptado", detalle: { presupuestoId: p.id, numero: p.numero, version: TEXTO_ACEPTACION_VERSION, documentoCoincide: coincide } });
  if (p.leadId) {
    const lead = await prisma.lead.findFirst({ where: { id: p.leadId, organizationId: p.organizationId }, select: { etapa: true } });
    // No dispara correos: solo cierra el lead como ganado (y cancela las secuencias que ya no aplican).
    if (lead && lead.etapa !== "GANADO" && lead.etapa !== "PERDIDO") await cambiarEtapaLead(prisma, { organizationId: p.organizationId, leadId: p.leadId, etapa: "GANADO", automatica: true });
  }
  await avisarResponsable(p, "fue aceptada").catch((e) => console.error("No se pudo avisar la aceptación", e));
  revalidatePath(`/presupuestos/${p.id}`);
  revalidatePath("/presupuestos");
  return { ok: true };
}

export async function rechazarPresupuesto(token: string, motivo?: string): Promise<R> {
  const p = await presupuestoDelPaciente(token);
  if (!p) return { error: SESION_VENCIDA };
  if (!limitarIp(porPresupuesto, p.id, Date.now(), 10, 60 * 60_000)) return { error: "Demasiados intentos. Inténtalo más tarde." };
  const r = esquemaRechazo.safeParse({ motivo: motivo ?? "" });
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  if (!admiteRespuesta({ estado: p.estado as EstadoPres, validoHasta: p.validoHasta })) return { error: "Esta cotización ya no admite respuesta. Comunícate con el centro." };
  const { count } = await prisma.presupuesto.updateMany({ where: { id: p.id, organizationId: p.organizationId, estado: { in: ["ENVIADO", "VISTO"] } }, data: { estado: "RECHAZADO", rechazadoEn: new Date(), rechazoMotivo: r.data.motivo || null } });
  if (count !== 1) return { error: "Esta cotización ya no admite respuesta. Comunícate con el centro." };
  await registrarEvento({ organizationId: p.organizationId, pacienteId: p.pacienteId, tipo: "presupuesto.rechazado", detalle: { presupuestoId: p.id, numero: p.numero } });
  await avisarResponsable(p, "fue rechazada").catch((e) => console.error("No se pudo avisar el rechazo", e));
  revalidatePath(`/presupuestos/${p.id}`);
  revalidatePath("/presupuestos");
  return { ok: true };
}

/** "Tengo una pregunta": el texto queda en la ficha de la cotización (auditoría); el correo al centro solo avisa, sin el contenido. */
export async function preguntarPresupuesto(token: string, texto: string): Promise<R> {
  const p = await presupuestoDelPaciente(token);
  if (!p) return { error: SESION_VENCIDA };
  if (!limitarIp(porPresupuesto, `pregunta:${p.id}`, Date.now(), 10, 60 * 60_000)) return { error: "Demasiadas preguntas. Inténtalo más tarde." };
  const r = esquemaPregunta.safeParse({ texto });
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Mensaje inválido" };
  await registrarEvento({ organizationId: p.organizationId, pacienteId: p.pacienteId, tipo: "presupuesto.pregunta", detalle: { presupuestoId: p.id, numero: p.numero, texto: r.data.texto } });
  await avisarResponsable(p, "el paciente tiene una pregunta").catch((e) => console.error("No se pudo avisar la pregunta", e));
  revalidatePath(`/presupuestos/${p.id}`);
  return { ok: true };
}
