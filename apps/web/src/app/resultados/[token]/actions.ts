"use server";

import { prisma } from "@dent-view/db";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { PREFIJO_ACCESO } from "@/lib/bitacora";
import {
  COOKIE_RESULTADOS, DIAS_VENCIMIENTO, estadoEnlace, firmarCookie, hashCodigo, hashToken, igualesSeguro, limitarIp, MAX_INTENTOS, MENSAJE_INVALIDO, venceSesion,
} from "@/lib/entrega";
import { registrarEvento } from "@/lib/eventos";
import { crearEnlace, enlaceDeCookie, encolarEntrega, secreto } from "@/lib/resultados";

const porIp = new Map<string, number[]>(); // shortcut: en memoria del proceso (ver limitarIp)
const porIpCompartir = new Map<string, number[]>();
const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

async function ipCliente() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconocida";
}
const bitacora = (e: { organizationId: string; pacienteId: string }, accion: string, ip: string, extra?: object) =>
  registrarEvento({ organizationId: e.organizationId, pacienteId: e.pacienteId, tipo: `${PREFIJO_ACCESO}resultados`, detalle: { accion, ip, ...extra } });

/** Valida el código del enlace. Mismo mensaje para token inexistente, vencido, revocado, bloqueado o código errado. */
export async function verificarCodigo(token: string, codigo: string): Promise<{ error?: string }> {
  const ip = await ipCliente();
  if (!limitarIp(porIp, ip)) return { error: "Demasiados intentos desde su conexión. Inténtelo de nuevo más tarde." };
  const c = /^\d{6}$/.exec(codigo.trim())?.[0];
  if (!c || !TOKEN.test(token)) return { error: MENSAJE_INVALIDO };
  const tokenHash = hashToken(token);
  const enlace = await prisma.enlaceEntrega.findUnique({ where: { tokenHash } });
  if (!enlace || estadoEnlace({ ...enlace, intentosFallidos: 0 }) !== "ACTIVO") return { error: MENSAJE_INVALIDO };
  // Reserva atómica de un intento: nunca se comparan más de MAX_INTENTOS códigos, ni con peticiones en paralelo.
  const { count } = await prisma.enlaceEntrega.updateMany({ where: { id: enlace.id, intentosFallidos: { lt: MAX_INTENTOS } }, data: { intentosFallidos: { increment: 1 } } });
  if (count !== 1) {
    await bitacora(enlace, "bloqueado", ip, { enlaceId: enlace.id });
    return { error: MENSAJE_INVALIDO };
  }
  if (!igualesSeguro(hashCodigo(tokenHash, c, secreto()), enlace.codigoHash)) {
    await bitacora(enlace, "codigo_fallido", ip, { enlaceId: enlace.id });
    return { error: MENSAJE_INVALIDO };
  }
  const ahora = new Date();
  const expira = venceSesion(ahora, enlace.venceEn);
  await prisma.enlaceEntrega.update({ where: { id: enlace.id }, data: { intentosFallidos: 0, accesos: { increment: 1 }, ultimoAccesoEn: ahora } });
  (await cookies()).set(COOKIE_RESULTADOS, firmarCookie(enlace.id, expira, secreto()), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expira,
  });
  await bitacora(enlace, "codigo_ok", ip, { enlaceId: enlace.id });
  return {};
}

const esquemaDoctor = z.object({ nombre: z.string().trim().min(2, "Escribe el nombre de su doctor").max(80).regex(/^[\p{L} .'-]+$/u, "Usa solo letras en el nombre"), correo: z.string().trim().email("Correo no válido").max(160) }); // N12: nombre sin URLs ni dígitos (evita phishing con la marca del centro)

/** El paciente reenvía sus resultados a su doctor: nuevo enlace con su propio código, que solo recibe el doctor. */
export async function compartirConDoctor(token: string, entrada: z.input<typeof esquemaDoctor>): Promise<{ error?: string; ok?: true }> {
  const ip = await ipCliente();
  if (!limitarIp(porIpCompartir, ip, Date.now(), 5, 60 * 60_000)) return { error: "Demasiados envíos. Inténtelo de nuevo más tarde." };
  const origen = await enlaceDeCookie();
  if (!origen || origen.destinatarioTipo !== "PACIENTE" || !TOKEN.test(token) || origen.tokenHash !== hashToken(token)) return { error: "Su sesión venció. Ingrese de nuevo el código." };
  const r = esquemaDoctor.safeParse(entrada);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  if ((await prisma.enlaceEntrega.count({ where: { origenId: origen.id } })) >= 5) return { error: "Ya compartió estos resultados con el máximo de doctores. Pida ayuda al centro." };

  const venceEn = new Date(Math.min(origen.venceEn.getTime(), Date.now() + DIAS_VENCIMIENTO * 86_400_000));
  const nuevo = await crearEnlace({
    organizationId: origen.organizationId, pacienteId: origen.pacienteId, informeId: origen.informeId, estudioUids: origen.estudioUids,
    tipo: "DOCTOR", nombre: r.data.nombre, correo: r.data.correo, origenId: origen.id, venceEn,
  });
  const [pac, centro, config] = await Promise.all([
    prisma.pacienteTenant.findUniqueOrThrow({ where: { id: origen.pacienteId }, include: { persona: true } }),
    prisma.organization.findUniqueOrThrow({ where: { id: origen.organizationId } }),
    prisma.configCentro.findUnique({ where: { organizationId: origen.organizationId } }),
  ]);
  await encolarEntrega({
    enlaceId: nuevo.enlace.id, organizationId: origen.organizationId, pacienteId: origen.pacienteId, token: nuevo.token, codigo: nuevo.codigo,
    centro: config?.nombre || centro.name, paciente: pac.nombre, destinatario: r.data.nombre, venceEn, direccion: r.data.correo,
  });
  await registrarEvento({ organizationId: origen.organizationId, pacienteId: origen.pacienteId, tipo: "resultados.compartidos", detalle: { origenId: origen.id, enlaceId: nuevo.enlace.id, doctor: r.data.nombre, ip } });
  await bitacora(origen, "compartir", ip, { enlaceId: origen.id, nuevoId: nuevo.enlace.id });
  return { ok: true };
}
