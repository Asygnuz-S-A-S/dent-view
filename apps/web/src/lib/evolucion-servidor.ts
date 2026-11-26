// Evolución clínica: consultas, plantillas base y reautenticación de la firma (solo servidor).
import { prisma } from "@dent-view/db";
import { headers } from "next/headers";
import { auth } from "./auth";
import { registrarEvento } from "./eventos";
import { esquemaCamposPlantilla, PLANTILLAS_BASE, type CampoPlantilla } from "./evolucion";
import { hashAdenda, hashEvolucion } from "./evolucion-hash";
import { fechaCorta, fechaHoraCompleta } from "./fechas";
import { obtenerSesion } from "./sesion";

/** Siembra las plantillas base del centro la primera vez que se abre la evolución (idempotente por la unicidad nombre+versión). */
export async function asegurarPlantillas(organizationId: string) {
  if (await prisma.plantillaEvolucion.count({ where: { organizationId } })) return;
  await prisma.plantillaEvolucion.createMany({ data: PLANTILLAS_BASE.map((p) => ({ organizationId, nombre: p.nombre, version: 1, campos: { campos: p.campos } })), skipDuplicates: true });
}

/** Última versión activa de cada plantilla del centro. */
export async function plantillasVigentes(organizationId: string) {
  await asegurarPlantillas(organizationId);
  const todas = await prisma.plantillaEvolucion.findMany({ where: { organizationId, activa: true }, orderBy: [{ nombre: "asc" }, { version: "desc" }] });
  const vistos = new Set<string>();
  return todas.flatMap((p) => {
    if (vistos.has(p.nombre)) return [];
    vistos.add(p.nombre);
    const r = esquemaCamposPlantilla.safeParse(p.campos);
    return r.success ? [{ id: p.id, nombre: p.nombre, version: p.version, campos: r.data.campos as CampoPlantilla[] }] : [];
  });
}

/** Reautenticación de la firma: contraseña del usuario y, si tiene MFA activo, el código TOTP. */
export async function reautenticar(usuario: { id: string; twoFactorEnabled?: boolean | null }, clave: string, codigo?: string): Promise<{ metodo: "CLAVE" | "CLAVE_TOTP" } | { error: string }> {
  if (!clave) return { error: "Escribe tu contraseña para firmar" };
  const cuenta = await prisma.account.findFirst({ where: { userId: usuario.id, providerId: "credential" }, select: { password: true } });
  const contexto = await auth.$context;
  if (!cuenta?.password || !(await contexto.password.verify({ hash: cuenta.password, password: clave }))) return { error: "Contraseña incorrecta" };
  if (!usuario.twoFactorEnabled) return { metodo: "CLAVE" };
  if (!codigo?.trim()) return { error: "Escribe el código de tu aplicación de verificación" };
  try {
    await auth.api.verifyTOTP({ headers: await headers(), body: { code: codigo.trim() } });
  } catch {
    return { error: "Código de verificación incorrecto" };
  }
  return { metodo: "CLAVE_TOTP" };
}

/** Registra `hc.consulta` una sola vez por sesión, usuario y paciente (no inunda la bitácora al recargar). */
export async function registrarConsultaHc(ctx: { organizationId: string; usuario: { id: string } }, pacienteId: string) {
  const sesion = await obtenerSesion();
  const desde = sesion?.session.createdAt ?? new Date(Date.now() - 12 * 3600_000);
  const ya = await prisma.evento.findFirst({ where: { organizationId: ctx.organizationId, tipo: "hc.consulta", actorId: ctx.usuario.id, pacienteId, creadoEn: { gte: desde } }, select: { id: true } });
  if (!ya) await registrarEvento({ organizationId: ctx.organizationId, pacienteId, actorId: ctx.usuario.id, tipo: "hc.consulta" });
}

export type AdendaVista = { id: string; texto: string; firmante: string; tarjeta: string | null; fecha: string; hashCorto: string; integra: boolean };
export type EvolucionVista = {
  id: string; folio: number; fecha: string; firmadaIso: string; profesionalId: string; profesional: string; tarjeta: string | null; especialidad: string | null;
  ordenId: string | null; ordenNumero: number | null; citaId: string | null; plantilla: string | null;
  motivoConsulta: string | null; hallazgos: string | null; procedimiento: string | null; diagnosticos: { codigo: string; descripcion: string }[];
  plan: string | null; indicaciones: string | null; proximaCita: string | null; hashCorto: string; integra: boolean; metodoFirma: string;
  adjuntos: { nombre: string; mime: string }[]; adendas: AdendaVista[];
};

/** Evoluciones firmadas del paciente (opcionalmente de una orden), con la integridad recalculada. Tope de 200. */
export async function cargarEvoluciones(organizationId: string, pacienteId: string, ordenId?: string): Promise<EvolucionVista[]> {
  const filas = await prisma.evolucionClinica.findMany({
    where: { organizationId, pacienteId, ...(ordenId ? { ordenId } : {}) },
    orderBy: { folio: "desc" }, take: 200,
    include: { adendas: { orderBy: { firmadaEn: "asc" } }, adjuntos: true, orden: { select: { numero: true } }, plantilla: { select: { nombre: true } } },
  });
  const ids = [...new Set(filas.map((f) => f.firmanteId))];
  const perfiles = ids.length ? await prisma.perfilDoctor.findMany({ where: { userId: { in: ids } }, select: { userId: true, especialidad: true } }) : [];
  const espec = new Map(perfiles.map((p) => [p.userId, p.especialidad]));
  return filas.map((f) => ({
    id: f.id, folio: f.folio, fecha: fechaHoraCompleta(f.firmadaEn), firmadaIso: f.firmadaEn.toISOString(), profesionalId: f.firmanteId, profesional: f.firmanteNombre, tarjeta: f.firmanteTarjeta,
    especialidad: espec.get(f.firmanteId) ?? null, ordenId: f.ordenId, ordenNumero: f.orden?.numero ?? null, citaId: f.citaId, plantilla: f.plantilla ? `${f.plantilla.nombre} v${f.plantillaVersion ?? 1}` : null,
    motivoConsulta: f.motivoConsulta, hallazgos: f.hallazgos, procedimiento: f.procedimiento,
    diagnosticos: Array.isArray(f.diagnosticosCie10) ? (f.diagnosticosCie10 as { codigo: string; descripcion: string }[]) : [],
    plan: f.plan, indicaciones: f.indicaciones, proximaCita: f.proximaCita ? fechaCorta(f.proximaCita, true) : null,
    hashCorto: f.hashContenido.slice(0, 12), integra: hashEvolucion(f) === f.hashContenido, metodoFirma: f.metodoFirma,
    adjuntos: f.adjuntos.map((a) => ({ nombre: a.nombre, mime: a.mime })),
    adendas: f.adendas.map((a) => ({
      id: a.id, texto: a.texto, firmante: a.firmanteNombre, tarjeta: a.firmanteTarjeta, fecha: fechaHoraCompleta(a.firmadaEn), hashCorto: a.hashContenido.slice(0, 12),
      integra: hashAdenda({ organizationId, evolucionId: f.id, hashEvolucion: f.hashContenido, texto: a.texto, firmanteId: a.firmanteId, firmanteNombre: a.firmanteNombre, firmanteTarjeta: a.firmanteTarjeta, firmadaEn: a.firmadaEn }) === a.hashContenido,
    })),
  }));
}

export type DatosEditor = {
  puedeFirmar: boolean; pideCodigo: boolean;
  borrador: { id: string; plantillaId: string | null; contenido: unknown; ordenId: string | null; citaId: string | null } | null;
  plantillas: { id: string; nombre: string; version: number; campos: CampoPlantilla[] }[];
  imagenes: { id: string; nombre: string }[];
};

/** Lo que necesita el editor de evolución: borrador propio, plantillas vigentes, imágenes vinculables y si el usuario puede firmar. */
export async function datosEditor(ctx: { organizationId: string; rol: string; usuario: { id: string; twoFactorEnabled?: boolean | null } }, pacienteId: string, ordenId: string | null): Promise<DatosEditor> {
  const org = ctx.organizationId;
  const [miembro, borrador, plantillas, imgs] = await Promise.all([
    prisma.member.findUnique({ where: { organizationId_userId: { organizationId: org, userId: ctx.usuario.id } }, select: { esOdontologo: true } }),
    prisma.borradorEvolucion.findFirst({ where: { organizationId: org, pacienteId, autorId: ctx.usuario.id, ordenId }, select: { id: true, plantillaId: true, contenido: true, ordenId: true, citaId: true } }),
    plantillasVigentes(org),
    prisma.imagenEstudio.findMany({ where: { organizationId: org, pacienteId }, orderBy: { creadoEn: "desc" }, take: 50, select: { id: true, titulo: true, nombreOriginal: true } }),
  ]);
  return {
    puedeFirmar: ctx.rol === "especialista" || (ctx.rol === "admin_tenant" && !!miembro?.esOdontologo), pideCodigo: !!ctx.usuario.twoFactorEnabled,
    borrador, plantillas, imagenes: imgs.map((i) => ({ id: i.id, nombre: i.titulo || i.nombreOriginal })),
  };
}
