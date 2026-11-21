// Entrega de resultados: acceso del lado servidor (BD, cookie, cola de mensajes).
import { prisma } from "@dent-view/db";
import { cookies } from "next/headers";
import { COOKIE_RESULTADOS, estadoEnlace, generarCodigoAcceso, generarToken, hashCodigo, hashToken, verificarCookie } from "./entrega";
import { encolarMensaje } from "./notificar";

export const secreto = () => {
  const s = process.env.BETTER_AUTH_SECRET;
  if (!s) throw new Error("Falta BETTER_AUTH_SECRET");
  return s;
};
export const urlBase = () => process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

/** Enlace de la cookie de resultados si la firma es válida y no está vencido ni revocado (los intentos fallidos solo bloquean el ingreso del código). */
export async function enlaceDeCookie() {
  const id = verificarCookie((await cookies()).get(COOKIE_RESULTADOS)?.value, secreto());
  if (!id) return null;
  const e = await prisma.enlaceEntrega.findUnique({ where: { id } });
  return e && estadoEnlace({ ...e, intentosFallidos: 0 }) === "ACTIVO" ? e : null;
}

type NuevoEnlace = {
  organizationId: string; pacienteId: string; informeId?: string | null; estudioUids: string[]; tipo: "PACIENTE" | "DOCTOR";
  nombre: string; correo?: string | null; origenId?: string | null; creadoPorId?: string | null; venceEn: Date;
};

/** Crea el enlace guardando solo hashes; token y código en claro se devuelven una única vez. */
export async function crearEnlace(n: NuevoEnlace) {
  const token = generarToken(), codigo = generarCodigoAcceso(), tokenHash = hashToken(token);
  const enlace = await prisma.enlaceEntrega.create({
    data: {
      organizationId: n.organizationId, pacienteId: n.pacienteId, informeId: n.informeId ?? null, estudioUids: n.estudioUids,
      destinatarioTipo: n.tipo, destinatarioNombre: n.nombre, destinatarioCorreo: n.correo ?? null, origenId: n.origenId ?? null,
      tokenHash, codigoHash: hashCodigo(tokenHash, codigo, secreto()), venceEn: n.venceEn, creadoPorId: n.creadoPorId ?? null,
    },
  });
  return { enlace, token, codigo };
}

/** Encola dos correos separados: el enlace y el código. `direccion` solo si no es el correo de la ficha del paciente. */
export async function encolarEntrega(e: { enlaceId: string; organizationId: string; pacienteId: string; token: string; codigo: string; centro: string; paciente: string; destinatario: string; venceEn: Date; direccion?: string | null; /** correos de estudio compartido: sin nombre del paciente en el cuerpo */ generico?: boolean; claveBase?: string }) {
  const contexto = {
    destinatario: e.destinatario, paciente: e.paciente, centro: e.centro, enlace: `${urlBase()}/resultados/${e.token}`, codigo: e.codigo,
    vence: e.venceEn.toLocaleDateString("es-CO", { timeZone: "America/Bogota", dateStyle: "long" }),
  };
  const mensajes = [];
  const tipos = e.generico ? ([["ESTUDIO_ENLACE", "enlace"], ["ESTUDIO_CODIGO", "codigo"]] as const) : ([["ENTREGA_ENLACE", "enlace"], ["ENTREGA_CODIGO", "codigo"]] as const);
  for (const [tipo, sufijo] of tipos) {
    // N2: cada mensaje lleva solo su credencial (el enlace no viaja con el código ni al revés).
    const propio = sufijo === "enlace" ? { ...contexto, codigo: null } : { ...contexto, enlace: null };
    const m = await encolarMensaje({ organizationId: e.organizationId, tipo, pacienteId: e.pacienteId, direccion: e.direccion, contexto: propio, claveUnica: `${e.claveBase ?? `entrega-${e.enlaceId}`}-${sufijo}` });
    // Un mensaje omitido no debe conservar credenciales.
    if (m?.estado === "OMITIDO") await prisma.mensaje.update({ where: { id: m.id }, data: { contexto: {} } });
    mensajes.push(m);
  }
  return mensajes.every((m) => m && m.estado !== "OMITIDO");
}

const ZONA = { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" } as const;

/** Enlaces del centro para mostrar al personal (fechas ya formateadas; nunca incluye hashes). */
export async function listarEnlaces(organizationId: string, where: { pacienteId?: string; informeId?: string }) {
  const filas = await prisma.enlaceEntrega.findMany({ where: { organizationId, ...where }, orderBy: { creadoEn: "desc" }, take: 50 });
  return filas.map((e) => ({
    id: e.id, tipo: e.destinatarioTipo, nombre: e.destinatarioNombre ?? "", correo: e.destinatarioCorreo ?? "", estado: estadoEnlace(e),
    vence: e.venceEn.toLocaleString("es-CO", ZONA), accesos: e.accesos, ultimoAcceso: e.ultimoAccesoEn?.toLocaleString("es-CO", ZONA) ?? null,
  }));
}
