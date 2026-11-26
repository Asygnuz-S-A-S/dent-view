// Cotización virtual: acceso del lado servidor (sesión del personal, cookie del paciente, cola de correos).
import { prisma, type Prisma } from "@dent-view/db";
import { cookies } from "next/headers";
import { generarCodigoAcceso, generarToken, hashCodigo, hashToken, firmarCookie, verificarCookie } from "./entrega";
import { despachar, encolarMensaje } from "./notificar";
import {
  COOKIE_PRESUPUESTO, ROLES_PRESUPUESTOS, estadoCodigo, numeroPresupuesto, type EstadoPres,
} from "./presupuestos";
import { convenioVigente, hoyBogota, resolverPrecio } from "./precios";
import { cargarConvenios } from "./precios-datos";
import { secreto, urlBase } from "./resultados";
import { exigirContexto, exigirModulo, modulosHabilitadoEnCentro } from "./sesion";
import { nombreCentro } from "./valoraciones-servidor";

/** Personal que cotiza (404 para doctores remitentes y centros sin el módulo). `esAdmin` habilita costo y margen. */
export async function contextoPresupuestos() {
  const ctx = await exigirContexto(ROLES_PRESUPUESTOS);
  await exigirModulo(ctx, "presupuestos");
  return { ...ctx, esAdmin: ctx.rol === "admin_tenant" };
}
export type ContextoPres = Awaited<ReturnType<typeof contextoPresupuestos>>;

/** Administración y recepción ven todo el centro; el especialista solo lo que creó o tiene a su nombre. */
export const ambitoPresupuestos = (ctx: { organizationId: string; rol: string; usuario: { id: string } }): Prisma.PresupuestoWhereInput => ({
  organizationId: ctx.organizationId,
  ...(ctx.rol === "especialista" ? { OR: [{ creadoPorId: ctx.usuario.id }, { profesionalId: ctx.usuario.id }] } : {}),
});
/** Un id ajeno es indistinguible de uno inexistente. */
export const presupuestoVisible = (ctx: ContextoPres, id: string) => prisma.presupuesto.findFirst({ where: { id, ...ambitoPresupuestos(ctx) } });

export const enlacePresupuesto = (token: string) => `${urlBase()}/presupuesto/${token}`;
export const fechaTexto = (d: Date) => d.toLocaleDateString("es-CO", { timeZone: "UTC", dateStyle: "long" });

/** Token + código nuevos (solo hashes en BD); lo anterior deja de servir. */
export async function regenerarCredenciales(presupuestoId: string, organizationId: string) {
  const token = generarToken(), codigo = generarCodigoAcceso(), tokenHash = hashToken(token);
  await prisma.presupuesto.updateMany({ where: { id: presupuestoId, organizationId }, data: { tokenHash, codigoHash: hashCodigo(tokenHash, codigo, secreto()), intentosCodigo: 0 } });
  return { token, codigo };
}

/** Enlace y código en correos separados, sin datos del paciente. true si ambos quedaron en cola. */
export async function enviarCredencialesPresupuesto(p: { id: string; organizationId: string; pacienteId: string; validoHasta: Date }, c: { token: string; codigo: string }) {
  const centro = await nombreCentro(p.organizationId);
  const contexto = { centro, enlace: enlacePresupuesto(c.token), codigo: c.codigo, vence: fechaTexto(p.validoHasta) };
  const sello = Date.now();
  const mensajes = [];
  for (const [tipo, sufijo] of [["PRESUPUESTO_ENLACE", "enlace"], ["PRESUPUESTO_CODIGO", "codigo"]] as const) {
    const propio = sufijo === "enlace" ? { ...contexto, codigo: null } : { ...contexto, enlace: null };
    const m = await encolarMensaje({ organizationId: p.organizationId, tipo, pacienteId: p.pacienteId, contexto: propio, claveUnica: `presupuesto-${p.id}-${sello}-${sufijo}` });
    if (m?.estado === "OMITIDO") await prisma.mensaje.update({ where: { id: m.id }, data: { contexto: {} } });
    mensajes.push(m);
  }
  await despachar({ organizationId: p.organizationId, limite: 10 }).catch((e) => console.error("No se pudo despachar el correo de cotización", e));
  return mensajes.every((m) => m && m.estado !== "OMITIDO");
}

/** Aviso al responsable (o a los administradores): sin datos del paciente ni de la cotización, solo número y enlace a la ficha. */
export async function avisarResponsable(p: { id: string; organizationId: string; numero: number; profesionalId: string | null; creadoPorId: string | null }, novedad: string) {
  const responsable = p.profesionalId ?? p.creadoPorId;
  const propios = responsable ? await prisma.user.findMany({ where: { id: responsable, members: { some: { organizationId: p.organizationId } } }, select: { email: true } }) : [];
  const destinos = propios.length ? propios : (await prisma.member.findMany({ where: { organizationId: p.organizationId, role: "admin_tenant" }, select: { user: { select: { email: true } } }, take: 3 })).map((m) => m.user);
  const centro = await nombreCentro(p.organizationId);
  for (const [i, d] of destinos.entries()) {
    await encolarMensaje({
      organizationId: p.organizationId, tipo: "PRESUPUESTO_RESPUESTA", direccion: d.email,
      contexto: { centro, numero: numeroPresupuesto(p.numero), novedad, enlace: `${urlBase()}/presupuestos/${p.id}` }, claveUnica: `presupuesto-aviso-${p.id}-${Date.now()}-${i}`,
    });
  }
  await despachar({ organizationId: p.organizationId, limite: 10 }).catch((e) => console.error("No se pudo despachar el aviso de cotización", e));
}

// --- Sesión del paciente (cookie ligada al enlace vigente: al reenviar, las sesiones anteriores dejan de valer) ---
const secretoCookie = () => `${secreto()}:presupuesto`;
const sujeto = (p: { id: string; tokenHash: string }) => `${p.id}_${p.tokenHash.slice(0, 16)}`;
export async function fijarCookiePresupuesto(p: { id: string; tokenHash: string }, expira: Date) {
  (await cookies()).set(COOKIE_PRESUPUESTO, firmarCookie(sujeto(p), expira, secretoCookie()), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expira,
  });
}
export const TOKEN_PUBLICO = /^[A-Za-z0-9_-]{20,64}$/;
/** Cotización del enlace si la cookie es válida y de ESE enlace; null en cualquier otro caso (sin distinguir el motivo). */
export async function presupuestoDelPaciente(token: string) {
  if (!TOKEN_PUBLICO.test(token)) return null;
  const dueno = verificarCookie((await cookies()).get(COOKIE_PRESUPUESTO)?.value, secretoCookie());
  if (!dueno) return null;
  const p = await prisma.presupuesto.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!p || sujeto({ id: p.id, tokenHash: p.tokenHash! }) !== dueno || !p.validoHasta || estadoCodigo({ estado: p.estado as EstadoPres, validoHasta: p.validoHasta, intentosCodigo: 0 }) === "CERRADO") return null;
  if (!(await modulosHabilitadoEnCentro(p.organizationId, "presupuestos"))) return null;
  return p;
}

/** Catálogo (con el precio de referencia que el servidor resolverá), convenios activos y margen por defecto para el editor. */
export async function opcionesEditor(organizationId: string) {
  const [servicios, convenios, finanzas] = await Promise.all([
    prisma.servicio.findMany({ where: { organizationId, activo: true }, orderBy: [{ categoria: "asc" }, { nombre: "asc" }], take: 500 }),
    cargarConvenios(organizationId),
    prisma.configFinanzas.findUnique({ where: { organizationId }, select: { margenCotizacionDefault: true } }),
  ]);
  return {
    servicios: servicios.map((s) => ({ id: s.id, nombre: s.nombre, precio: resolverPrecio({ servicio: s, entrega: "DIGITAL", fecha: hoyBogota() }).precio })),
    convenios: convenios.filter((c) => convenioVigente(c, hoyBogota())).map((c) => ({ id: c.id, nombre: c.nombre })),
    margenDefault: Number(finanzas?.margenCotizacionDefault ?? 30),
  };
}
