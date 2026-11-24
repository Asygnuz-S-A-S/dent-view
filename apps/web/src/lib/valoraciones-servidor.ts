// Valoración virtual: acceso del lado servidor (sesión del personal, cookie del paciente, S3 con Range y cola de correos).
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@dent-view/db";
import { cookies, headers } from "next/headers";
import { generarCodigoAcceso, generarToken, hashCodigo, hashToken, firmarCookie, verificarCookie } from "./entrega";
import { despachar, encolarMensaje } from "./notificar";
import { secreto, urlBase } from "./resultados";
import { s3 } from "./s3";
import { contextoActivo, modulosHabilitadoEnCentro } from "./sesion";
import {
  COOKIE_VALORACION, DIAS_VENCIMIENTO, filtroValoraciones, puedeCrearValoracion, puedeValorar, puedeVerValoraciones, truncarIp, vencimiento, IP_DESCONOCIDA,
} from "./valoraciones";

const secretoCookie = () => `${secreto()}:valoracion`; // la cookie de valoración nunca vale como la de resultados

export async function ipCliente() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || IP_DESCONOCIDA;
}
export const ipGuardada = async () => truncarIp(await ipCliente());

/**
 * Contexto del personal para valoraciones (null si no hay sesión o el rol no aplica). Sin redirecciones: sirve a las rutas API.
 * `puedeValorar` (especialista o admin marcado como odontólogo) es también el permiso de ver lo CLÍNICO (cuestionario, fotos, video, mensajes, diagnóstico):
 * recepción y los demás ven solo estado, contacto, fechas y asignado (datos de salud, Ley 1581).
 */
export async function contextoValoraciones() {
  const ctx = await contextoActivo();
  if (!ctx || ctx.usuario.debeCambiarClave || !puedeVerValoraciones(ctx.rol)) return null;
  const m = await prisma.member.findUnique({ where: { organizationId_userId: { organizationId: ctx.organizationId, userId: ctx.usuario.id } }, select: { esOdontologo: true } });
  const esOdontologo = !!m?.esOdontologo;
  return { ...ctx, esOdontologo, puedeValorar: puedeValorar(ctx.rol, esOdontologo), puedeCrear: puedeCrearValoracion(ctx.rol) };
}
export type ContextoVal = NonNullable<Awaited<ReturnType<typeof contextoValoraciones>>>;

/** Valoración del centro visible para este usuario; un id ajeno es indistinguible de uno inexistente. */
export const valoracionVisible = (ctx: ContextoVal, id: string) =>
  prisma.valoracion.findFirst({ where: { id, ...filtroValoraciones(ctx.organizationId, ctx.usuario.id, ctx.rol) } });

/** Cuenta con los odontólogos que pueden ser asignados (especialistas y administradores marcados como odontólogo). */
export const odontologosDelCentro = (organizationId: string) =>
  prisma.member.findMany({
    where: { organizationId, OR: [{ role: "especialista" }, { role: "admin_tenant", esOdontologo: true }] },
    select: { userId: true, user: { select: { name: true, email: true } } },
    orderBy: { user: { name: "asc" } },
  });

// --- Credenciales del enlace público ---
/** Token + código nuevos (solo hashes en BD) y vencimiento; devuelve lo que se muestra/envía una única vez. */
export async function regenerarCredenciales(valoracionId: string, dias = DIAS_VENCIMIENTO) {
  const token = generarToken(), codigo = generarCodigoAcceso(), tokenHash = hashToken(token);
  const expiraEn = vencimiento(dias);
  await prisma.valoracion.update({ where: { id: valoracionId }, data: { tokenHash, codigoHash: hashCodigo(tokenHash, codigo, secreto()), intentosCodigo: 0, expiraEn } });
  return { token, codigo, expiraEn };
}
export const enlacePublico = (token: string) => `${urlBase()}/valoracion/${token}`;

/** Encola enlace y código en mensajes separados (sin PHI) y los despacha ya; true si ambos quedaron en cola. */
export async function enviarCredenciales(v: { id: string; organizationId: string; pacienteId: string | null; correo: string | null }, c: { token: string; codigo: string; expiraEn: Date }, tipo: "VALORACION_ENLACE" | "VALORACION_RESULTADO") {
  if (!v.correo) return false;
  const [centro, pac] = await Promise.all([
    nombreCentro(v.organizationId),
    v.pacienteId ? prisma.pacienteTenant.findFirst({ where: { id: v.pacienteId, organizationId: v.organizationId }, select: { correo: true } }) : null,
  ]);
  // Con la ficha del paciente y el mismo correo se respetan sus preferencias de contacto; con otro correo va a esa dirección.
  const propio = !!pac && pac.correo?.toLowerCase() === v.correo.toLowerCase();
  const contexto = { centro, enlace: enlacePublico(c.token), codigo: c.codigo, vence: c.expiraEn.toLocaleDateString("es-CO", { timeZone: "America/Bogota", dateStyle: "long" }) };
  const sello = Date.now();
  const mensajes = [];
  for (const [t, sufijo] of [[tipo, "enlace"], ["VALORACION_CODIGO", "codigo"]] as const) {
    // Cada mensaje lleva solo su credencial (el enlace no viaja con el código ni al revés).
    const propioCtx = sufijo === "enlace" ? { ...contexto, codigo: null } : { ...contexto, enlace: null };
    const m = await encolarMensaje({ organizationId: v.organizationId, tipo: t, pacienteId: propio ? v.pacienteId : null, direccion: propio ? null : v.correo, contexto: propioCtx, claveUnica: `valoracion-${v.id}-${sello}-${sufijo}` });
    if (m?.estado === "OMITIDO") await prisma.mensaje.update({ where: { id: m.id }, data: { contexto: {} } });
    mensajes.push(m);
  }
  await despachar({ organizationId: v.organizationId, limite: 10 }).catch((e) => console.error("No se pudo despachar el correo de valoración", e));
  return mensajes.every((m) => m && m.estado !== "OMITIDO");
}

/** Aviso al odontólogo asignado (o a los administradores si no hay): sin datos del paciente, solo el enlace a la valoración. */
export async function avisarOdontologo(v: { id: string; organizationId: string; doctorId: string | null }) {
  const destinos = v.doctorId
    ? await prisma.user.findMany({ where: { id: v.doctorId, members: { some: { organizationId: v.organizationId } } }, select: { email: true } })
    : (await prisma.member.findMany({ where: { organizationId: v.organizationId, role: "admin_tenant" }, select: { user: { select: { email: true } } }, take: 3 })).map((m) => m.user);
  const centro = await nombreCentro(v.organizationId);
  for (const [i, d] of destinos.entries()) {
    await encolarMensaje({ organizationId: v.organizationId, tipo: "VALORACION_AVISO", direccion: d.email, contexto: { centro, enlace: `${urlBase()}/valoraciones/${v.id}` }, claveUnica: `valoracion-aviso-${v.id}-${Date.now()}-${i}` });
  }
  await despachar({ organizationId: v.organizationId, limite: 10 }).catch((e) => console.error("No se pudo despachar el aviso de valoración", e));
}

export async function nombreCentro(organizationId: string) {
  const [org, cfg] = await Promise.all([prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } }), prisma.configCentro.findUnique({ where: { organizationId }, select: { nombre: true } })]);
  return cfg?.nombre || org?.name || "tu centro";
}

// --- Sesión del paciente (cookie del enlace + código) ---
// El sujeto de la cookie liga la sesión al enlace vigente: al regenerar el acceso, las sesiones anteriores dejan de valer.
const sujeto = (v: { id: string; tokenHash: string }) => `${v.id}_${v.tokenHash.slice(0, 16)}`;
export async function fijarCookiePaciente(v: { id: string; tokenHash: string }, expira: Date) {
  (await cookies()).set(COOKIE_VALORACION, firmarCookie(sujeto(v), expira, secretoCookie()), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expira,
  });
}
const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;
/** Valoración del enlace si la cookie es válida y es de ESE enlace; null en cualquier otro caso (sin distinguir el motivo). */
export async function valoracionDelPaciente(token: string) {
  if (!TOKEN.test(token)) return null;
  const dueno = verificarCookie((await cookies()).get(COOKIE_VALORACION)?.value, secretoCookie());
  if (!dueno) return null;
  const v = await prisma.valoracion.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!v || sujeto(v) !== dueno || v.estado === "CANCELADA" || v.estado === "BORRADOR" || v.expiraEn <= new Date()) return null;
  if (!(await modulosHabilitadoEnCentro(v.organizationId, "valoraciones"))) return null; // centro sin el módulo: el enlace no sirve
  return v;
}

// --- Archivos ---
/** Lee un objeto de S3 con soporte de Range (video) y lo devuelve como Response; null si no existe. */
export async function servirObjeto(req: Request, key: string, tipo: string, extra: Record<string, string> = {}) {
  const rango = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "") ? req.headers.get("range")! : undefined;
  try {
    const o = await s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET_ESTUDIOS, Key: key, Range: rango }));
    const headers: Record<string, string> = { "Content-Type": tipo, "Accept-Ranges": "bytes", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", ...extra };
    if (o.ContentLength !== undefined) headers["Content-Length"] = String(o.ContentLength);
    if (rango && o.ContentRange) headers["Content-Range"] = o.ContentRange;
    return new Response(o.Body!.transformToWebStream(), { status: rango ? 206 : 200, headers });
  } catch (e) {
    const rangoInvalido = (e as { name?: string }).name === "InvalidRange";
    return new Response(null, { status: rangoInvalido ? 416 : 404 });
  }
}
