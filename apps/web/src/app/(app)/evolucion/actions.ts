"use server";

// Evolución clínica: borradores, firma con reautenticación, adendas, plantillas y registro de toma.
// Una evolución firmada no se edita ni se borra (la base lo impide): las correcciones son adendas firmadas.
import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { contarPeticion } from "@/lib/api-limite";
import { registrarEvento } from "@/lib/eventos";
import {
  BORRADOR_VACIO, CAMPOS_ESTANDAR, componerContenido, esquemaAdenda, esquemaBorrador, esquemaCamposPlantilla, esquemaToma, MAX_FIRMAS_POR_MIN,
  puedeFirmar, textoAdenda, tieneContenido,
} from "@/lib/evolucion";
import { hashAdenda } from "@/lib/evolucion-hash";
import { crearEvolucionFirmada } from "@/lib/evolucion-folio";
import { reautenticar } from "@/lib/evolucion-servidor";
import { ADMIN, CLINICOS, MEDICOS } from "@/lib/roles";
import { exigirContexto, exigirModulo } from "@/lib/sesion";
import { tipoDeCentro } from "@/lib/tipo-centro-servidor";

type R = { error?: string };
const TIMEOUT_TX = 15_000; // el valor por defecto (5 s) se queda corto cuando el servidor está cargado

// shortcut: contador en memoria del proceso; con varias réplicas el límite efectivo se multiplica. Pasar a base de datos al escalar.
const intentos = new Map<string, { inicio: number; cuenta: number }>();
const excedeLimite = (usuarioId: string) => !contarPeticion(intentos, `firma:${usuarioId}`, Date.now(), MAX_FIRMAS_POR_MIN).permitido;

async function ctxMedico() {
  const ctx = await exigirContexto(MEDICOS);
  await exigirModulo(ctx, "evolucion");
  return ctx;
}

/** Quién puede firmar: especialista, o admin que atiende como odontólogo. Devuelve el perfil para sellar la firma. */
async function firmanteDe(ctx: { organizationId: string; usuario: { id: string; name: string }; rol: string }) {
  const m = await prisma.member.findUnique({ where: { organizationId_userId: { organizationId: ctx.organizationId, userId: ctx.usuario.id } }, select: { esOdontologo: true } });
  if (!puedeFirmar(ctx.rol, !!m?.esOdontologo)) return null;
  const perfil = await prisma.perfilDoctor.findUnique({ where: { userId: ctx.usuario.id }, select: { tarjetaProfesional: true } });
  return { id: ctx.usuario.id, nombre: ctx.usuario.name, tarjeta: perfil?.tarjetaProfesional ?? null };
}

const refrescar = (pacienteId: string, ordenId?: string | null) => {
  revalidatePath(`/pacientes/${pacienteId}`);
  if (ordenId) revalidatePath(`/ordenes/${ordenId}`);
};

export async function crearBorrador(entrada: { pacienteId: string; ordenId?: string | null; citaId?: string | null; plantillaId?: string | null }): Promise<R & { id?: string }> {
  const ctx = await ctxMedico();
  const org = ctx.organizationId;
  if (!(await prisma.pacienteTenant.findFirst({ where: { id: entrada.pacienteId, organizationId: org }, select: { id: true } }))) return { error: "Paciente no encontrado" };
  const ordenId = entrada.ordenId || null;
  if (ordenId && !(await prisma.orden.findFirst({ where: { id: ordenId, organizationId: org, pacienteId: entrada.pacienteId }, select: { id: true } }))) return { error: "Orden no encontrada" };
  const citaId = entrada.citaId || null;
  if (citaId && !(await prisma.cita.findFirst({ where: { id: citaId, organizationId: org, pacienteId: entrada.pacienteId }, select: { id: true } }))) return { error: "Cita no encontrada" };
  const plantillaId = entrada.plantillaId || null;
  if (plantillaId && !(await prisma.plantillaEvolucion.findFirst({ where: { id: plantillaId, organizationId: org, activa: true }, select: { id: true } }))) return { error: "Plantilla no encontrada" };
  // Un solo borrador por autor, paciente y orden: el doble clic no duplica.
  const existente = await prisma.borradorEvolucion.findFirst({ where: { organizationId: org, pacienteId: entrada.pacienteId, autorId: ctx.usuario.id, ordenId }, select: { id: true } });
  if (existente) return { id: existente.id };
  const b = await prisma.borradorEvolucion.create({ data: { organizationId: org, pacienteId: entrada.pacienteId, autorId: ctx.usuario.id, ordenId, citaId, plantillaId, contenido: BORRADOR_VACIO } });
  refrescar(entrada.pacienteId, ordenId);
  return { id: b.id };
}

/** Autoguardado: solo el autor, solo borradores. Devuelve la hora del guardado. */
export async function guardarBorrador(id: string, contenido: unknown, plantillaId: string | null): Promise<R & { guardadoEn?: string }> {
  const ctx = await ctxMedico();
  const r = esquemaBorrador.safeParse(contenido);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const org = ctx.organizationId;
  if (plantillaId && !(await prisma.plantillaEvolucion.findFirst({ where: { id: plantillaId, organizationId: org, activa: true }, select: { id: true } }))) return { error: "Plantilla no encontrada" };
  const { count } = await prisma.borradorEvolucion.updateMany({ where: { id, organizationId: org, autorId: ctx.usuario.id }, data: { contenido: r.data, plantillaId } });
  if (!count) return { error: "El borrador ya no existe (¿ya fue firmado?)" };
  return { guardadoEn: new Date().toISOString() };
}

export async function descartarBorrador(id: string): Promise<R> {
  const ctx = await ctxMedico();
  const b = await prisma.borradorEvolucion.findFirst({ where: { id, organizationId: ctx.organizationId, autorId: ctx.usuario.id }, select: { pacienteId: true, ordenId: true } });
  if (!b) return { error: "El borrador ya no existe" };
  await prisma.borradorEvolucion.deleteMany({ where: { id, organizationId: ctx.organizationId, autorId: ctx.usuario.id } });
  refrescar(b.pacienteId, b.ordenId);
  return {};
}

export async function firmarBorrador(id: string, contenido: unknown, plantillaId: string | null, clave: string, codigo?: string): Promise<R & { folio?: number }> {
  const ctx = await ctxMedico();
  const org = ctx.organizationId;
  const firmante = await firmanteDe(ctx);
  if (!firmante) return { error: "Solo el especialista o el odontólogo del centro puede firmar evoluciones" };
  if (excedeLimite(ctx.usuario.id)) return { error: "Demasiados intentos de firma. Espera un minuto." };
  const r = esquemaBorrador.safeParse(contenido);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const b = await prisma.borradorEvolucion.findFirst({ where: { id, organizationId: org, autorId: ctx.usuario.id } });
  if (!b) return { error: "El borrador ya no existe (¿ya fue firmado?)" };
  const fila = plantillaId ? await prisma.plantillaEvolucion.findFirst({ where: { id: plantillaId, organizationId: org }, select: { id: true, version: true, campos: true } }) : null;
  if (plantillaId && !fila) return { error: "Plantilla no encontrada" };
  const campos = fila ? (esquemaCamposPlantilla.safeParse(fila.campos).data?.campos ?? CAMPOS_ESTANDAR) : CAMPOS_ESTANDAR;
  const compuesto = componerContenido(campos, r.data.valores);
  if (!tieneContenido(compuesto, r.data.diagnosticos)) return { error: "La evolución está vacía: escribe al menos un campo clínico" };
  const auth = await reautenticar(ctx.usuario, clave, codigo);
  if ("error" in auth) return { error: auth.error };
  const ev = await crearEvolucionFirmada(prisma, {
    organizationId: org, pacienteId: b.pacienteId, ordenId: b.ordenId, citaId: b.citaId, plantillaId: fila?.id ?? null, plantillaVersion: fila?.version ?? null,
    contenido: compuesto, diagnosticos: r.data.diagnosticos, proximaCita: r.data.proximaCita || null, firmante, metodoFirma: auth.metodo, borradorId: b.id, imagenIds: r.data.adjuntoIds,
  });
  refrescar(b.pacienteId, b.ordenId);
  return { folio: ev.folio };
}

export async function agregarAdenda(evolucionId: string, entrada: unknown, clave: string, codigo?: string): Promise<R> {
  const ctx = await ctxMedico();
  const org = ctx.organizationId;
  const firmante = await firmanteDe(ctx);
  if (!firmante) return { error: "Solo el especialista o el odontólogo del centro puede firmar adendas" };
  if (excedeLimite(ctx.usuario.id)) return { error: "Demasiados intentos de firma. Espera un minuto." };
  const r = esquemaAdenda.safeParse(entrada);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const ev = await prisma.evolucionClinica.findFirst({ where: { id: evolucionId, organizationId: org }, select: { id: true, pacienteId: true, ordenId: true, hashContenido: true } });
  if (!ev) return { error: "Evolución no encontrada" };
  const auth = await reautenticar(ctx.usuario, clave, codigo);
  if ("error" in auth) return { error: auth.error };
  const texto = textoAdenda(r.data.motivo, r.data.texto);
  const firmadaEn = new Date();
  const hashContenido = hashAdenda({ organizationId: org, evolucionId: ev.id, hashEvolucion: ev.hashContenido, texto, firmanteId: firmante.id, firmanteNombre: firmante.nombre, firmanteTarjeta: firmante.tarjeta, firmadaEn });
  await prisma.$transaction(async (tx) => {
    const a = await tx.adendaEvolucion.create({ data: { organizationId: org, evolucionId: ev.id, texto, firmanteId: firmante.id, firmanteNombre: firmante.nombre, firmanteTarjeta: firmante.tarjeta, hashContenido, metodoFirma: auth.metodo, firmadaEn } });
    await registrarEvento({ organizationId: org, pacienteId: ev.pacienteId, actorId: ctx.usuario.id, tipo: "hc.adenda", detalle: { evolucionId: ev.id, adendaId: a.id } }, tx);
  }, { timeout: TIMEOUT_TX });
  refrescar(ev.pacienteId, ev.ordenId);
  return {};
}

/** Nueva versión de una plantilla (las anteriores se conservan: las evoluciones firmadas apuntan a la versión usada). Solo admin. */
export async function guardarPlantilla(nombre: string, entrada: unknown): Promise<R> {
  const ctx = await exigirContexto(ADMIN);
  await exigirModulo(ctx, "evolucion");
  const n = nombre.trim();
  if (!n || n.length > 80) return { error: "El nombre debe tener entre 1 y 80 caracteres" };
  const r = esquemaCamposPlantilla.safeParse(entrada);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const claves = r.data.campos.map((c) => c.clave);
  if (new Set(claves).size !== claves.length) return { error: "Hay campos con la misma clave" };
  const org = ctx.organizationId;
  await prisma.$transaction(async (tx) => {
    const ult = await tx.plantillaEvolucion.aggregate({ where: { organizationId: org, nombre: n }, _max: { version: true } });
    const version = (ult._max.version ?? 0) + 1;
    await tx.plantillaEvolucion.updateMany({ where: { organizationId: org, nombre: n }, data: { activa: false } });
    await tx.plantillaEvolucion.create({ data: { organizationId: org, nombre: n, version, campos: r.data, creadaPorId: ctx.usuario.id } });
    await registrarEvento({ organizationId: org, actorId: ctx.usuario.id, tipo: "hc.plantilla", detalle: { nombre: n, version } }, tx);
  }, { timeout: TIMEOUT_TX });
  revalidatePath("/evolucion/plantillas");
  return {};
}

/** Registro de toma (centro radiológico): solo inserta; técnico = quien registra. */
export async function registrarToma(entrada: unknown): Promise<R> {
  const ctx = await exigirContexto(CLINICOS);
  if ((await tipoDeCentro(ctx.organizationId)) !== "CENTRO_RADIOLOGICO") notFound();
  const r = esquemaToma.safeParse(entrada);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const d = r.data;
  const org = ctx.organizationId;
  const orden = await prisma.orden.findFirst({ where: { id: d.ordenId, organizationId: org }, select: { id: true, pacienteId: true } });
  if (!orden) return { error: "Orden no encontrada" };
  if (d.salaId && !(await prisma.sala.findFirst({ where: { id: d.salaId, organizationId: org }, select: { id: true } }))) return { error: "Sala no encontrada" };
  const incidencias = [d.equipo?.trim() ? `Equipo: ${d.equipo.trim()}` : "", d.incidencias?.trim() ?? ""].filter(Boolean).join(". ") || null;
  await prisma.$transaction(async (tx) => {
    const t = await tx.registroToma.create({ data: { organizationId: org, pacienteId: orden.pacienteId, ordenId: orden.id, tecnicoId: ctx.usuario.id, salaId: d.salaId || null, repeticiones: d.repeticiones, motivoRepeticion: d.repeticiones ? d.motivoRepeticion?.trim() || null : null, incidencias } });
    await registrarEvento({ organizationId: org, pacienteId: orden.pacienteId, actorId: ctx.usuario.id, tipo: "hc.toma", detalle: { tomaId: t.id, ordenId: orden.id, repeticiones: d.repeticiones } }, tx);
  }, { timeout: TIMEOUT_TX });
  refrescar(orden.pacienteId, orden.id);
  return {};
}
