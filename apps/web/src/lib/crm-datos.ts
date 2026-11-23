// CRM: consultas para las pantallas (siempre acotadas por centro; el especialista solo ve lo asignado a él).
import { prisma, type Prisma } from "@dent-view/db";
import { embudo, ETAPAS_ABIERTAS, porcentaje, segmentosDe, SEGMENTOS, tiempoMedioRespuestaHoras, TIPOS_CONTACTO, type Etapa, type Segmento } from "./crm";
import { GESTION } from "./roles";

const DIA = 86_400_000;
type Ctx = { organizationId: string; rol: string; usuario: { id: string } };

/** Gestión ve todo; el especialista solo los leads que tiene asignados. */
export const alcanceLeads = (ctx: Ctx): Prisma.LeadWhereInput => ({ organizationId: ctx.organizationId, ...(ctx.rol === "especialista" ? { responsableId: ctx.usuario.id } : {}) });
export const esGestion = (rol: string) => (GESTION as readonly string[]).includes(rol);

export async function cargarResponsables(organizationId: string) {
  const m = await prisma.member.findMany({ where: { organizationId, role: { in: [...GESTION, "especialista"] } }, include: { user: { select: { name: true } } }, orderBy: { createdAt: "asc" } });
  return m.map((x) => ({ id: x.userId, nombre: x.user.name }));
}

export type FiltrosLeads = { etapa?: string; responsable?: string; origen?: string; interes?: string; desde?: string; sinContacto?: string; q?: string };
const esFechaIso = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function dondeLeads(ctx: Ctx, f: FiltrosLeads, ahora = new Date()): Prisma.LeadWhereInput {
  const and: Prisma.LeadWhereInput[] = [];
  if (f.etapa && (ETAPAS_ABIERTAS as readonly string[]).concat(["GANADO", "PERDIDO"]).includes(f.etapa)) and.push({ etapa: f.etapa as Etapa });
  if (f.responsable) and.push(f.responsable === "sin" ? { responsableId: null } : { responsableId: f.responsable });
  if (f.origen) and.push({ origen: f.origen });
  if (f.interes) and.push({ interes: f.interes });
  if (esFechaIso(f.desde)) and.push({ creadoEn: { gte: new Date(`${f.desde}T00:00:00-05:00`) } });
  const n = Number(f.sinContacto);
  if (n > 0) {
    const corte = new Date(ahora.getTime() - n * DIA);
    and.push({ etapa: { notIn: ["GANADO", "PERDIDO"] }, OR: [{ ultimoContactoEn: { lt: corte } }, { ultimoContactoEn: null, creadoEn: { lt: corte } }] });
  }
  const q = f.q?.trim();
  if (q) and.push({ OR: [{ nombre: { contains: q, mode: "insensitive" } }, { correo: { contains: q, mode: "insensitive" } }, { telefono: { contains: q } }, { interes: { contains: q, mode: "insensitive" } }] });
  return { ...alcanceLeads(ctx), AND: and };
}

export const SELECT_TARJETA = {
  id: true, nombre: true, etapa: true, origen: true, interes: true, valorEstimado: true, telefono: true, correo: true, creadoEn: true, ultimoContactoEn: true, proximoContacto: true,
  noContactar: true, responsable: { select: { name: true } },
} satisfies Prisma.LeadSelect;

// ---- Panel ----
export type PanelCrm = Awaited<ReturnType<typeof panelCrm>>;
export async function panelCrm(organizationId: string, dias: number, ahora = new Date()) {
  const fin = ahora, ini = new Date(ahora.getTime() - dias * DIA), iniAnt = new Date(ini.getTime() - dias * DIA);
  const sel = { id: true, etapa: true, origen: true, pacienteId: true, creadoEn: true } as const;
  const [actual, anterior, abiertos, vencidas, secuencias, inscActivas] = await Promise.all([
    prisma.lead.findMany({ where: { organizationId, creadoEn: { gte: ini, lte: fin } }, select: sel, take: 10_000 }),
    prisma.lead.findMany({ where: { organizationId, creadoEn: { gte: iniAnt, lt: ini } }, select: sel, take: 10_000 }),
    prisma.lead.aggregate({ where: { organizationId, etapa: { in: [...ETAPAS_ABIERTAS] } }, _sum: { valorEstimado: true }, _count: true }),
    prisma.tareaCRM.count({ where: { organizationId, estado: "PENDIENTE", vence: { lt: ahora } } }),
    prisma.secuenciaCRM.count({ where: { organizationId, activa: true } }),
    prisma.inscripcionSecuencia.count({ where: { organizationId, estado: "ACTIVA" } }),
  ]);
  const primerosContactos = async (leads: { id: string; creadoEn: Date }[]) => {
    if (!leads.length) return [];
    const g = await prisma.actividadLead.groupBy({ by: ["leadId"], where: { organizationId, leadId: { in: leads.map((l) => l.id) }, tipo: { in: [...TIPOS_CONTACTO] }, automatica: false }, _min: { creadoEn: true } });
    const creado = new Map(leads.map((l) => [l.id, l.creadoEn]));
    return g.flatMap((x) => (x.leadId && x._min.creadoEn ? [{ creado: creado.get(x.leadId)!, primerContacto: x._min.creadoEn }] : []));
  };
  const [respAct, respAnt] = await Promise.all([primerosContactos(actual), primerosContactos(anterior)]);
  const porEtapa: Partial<Record<Etapa, number>> = {};
  for (const l of actual) porEtapa[l.etapa as Etapa] = (porEtapa[l.etapa as Etapa] ?? 0) + 1;
  const convertidos = (ls: typeof actual) => ls.filter((l) => l.pacienteId).length;
  const origenes = new Map<string, { total: number; convertidos: number }>();
  for (const l of actual) {
    const o = origenes.get(l.origen) ?? { total: 0, convertidos: 0 };
    o.total++; if (l.pacienteId) o.convertidos++;
    origenes.set(l.origen, o);
  }
  return {
    dias, nuevos: actual.length, nuevosAnterior: anterior.length,
    embudo: embudo(porEtapa),
    respuestaHoras: tiempoMedioRespuestaHoras(respAct), respuestaHorasAnterior: tiempoMedioRespuestaHoras(respAnt),
    convertidos: convertidos(actual), tasa: porcentaje(convertidos(actual), actual.length), tasaAnterior: porcentaje(convertidos(anterior), anterior.length),
    pipelineValor: abiertos._sum.valorEstimado ?? 0, pipelineLeads: abiertos._count,
    origenes: [...origenes].map(([origen, v]) => ({ origen, ...v, tasa: porcentaje(v.convertidos, v.total) })).sort((a, b) => b.tasa - a.tasa || b.total - a.total),
    tareasVencidas: vencidas, secuenciasActivas: secuencias, inscripcionesActivas: inscActivas,
  };
}

// ---- Estadísticas por secuencia ----
export async function estadisticasSecuencias(organizationId: string) {
  const [insc, ejec] = await Promise.all([
    prisma.inscripcionSecuencia.groupBy({ by: ["secuenciaId", "estado", "motivoFin"], where: { organizationId }, _count: true }),
    prisma.$queryRaw<{ secuenciaId: string; estado: string; n: bigint }[]>`
      SELECT i."secuenciaId", e.estado::text AS estado, COUNT(*) AS n FROM "EjecucionPaso" e JOIN "InscripcionSecuencia" i ON i.id = e."inscripcionId"
      WHERE e."organizationId" = ${organizationId} GROUP BY 1, 2`,
  ]);
  const r = new Map<string, { inscritos: number; activas: number; enviados: number; omitidos: number; respuestas: number }>();
  const get = (id: string) => r.get(id) ?? r.set(id, { inscritos: 0, activas: 0, enviados: 0, omitidos: 0, respuestas: 0 }).get(id)!;
  for (const x of insc) {
    const s = get(x.secuenciaId);
    s.inscritos += x._count;
    if (x.estado === "ACTIVA") s.activas += x._count;
    if (x.motivoFin && ["respondio", "ganado", "convertido"].includes(x.motivoFin)) s.respuestas += x._count;
  }
  for (const x of ejec) {
    const s = get(x.secuenciaId);
    if (x.estado === "ENVIADO") s.enviados += Number(x.n);
    if (x.estado === "OMITIDO") s.omitidos += Number(x.n);
  }
  return r;
}

// ---- Fidelización ----
export async function segmentosFidelizacion(organizationId: string, ahora = new Date()) {
  const hace12m = new Date(ahora.getTime() - 365 * DIA);
  const [pacientes, gasto, visitas] = await Promise.all([
    prisma.pacienteTenant.findMany({ where: { organizationId }, select: { id: true, nombre: true, correo: true, ultimaVisitaEn: true, creadoEn: true, proximoControlEn: true }, take: 20_000 }),
    prisma.factura.groupBy({ by: ["pacienteId"], where: { organizationId, pacienteId: { not: null }, estado: { not: "ANULADA" }, fecha: { gte: hace12m } }, _sum: { total: true } }),
    prisma.cita.groupBy({ by: ["pacienteId"], where: { organizationId, pacienteId: { not: null }, estado: "ATENDIDA", inicio: { gte: hace12m } }, _count: true }),
  ]);
  const g = new Map(gasto.map((x) => [x.pacienteId, x._sum.total ?? 0])), v = new Map(visitas.map((x) => [x.pacienteId, x._count]));
  const conteos = Object.fromEntries(SEGMENTOS.map((s) => [s, 0])) as Record<Segmento, number>;
  const porSegmento = new Map<Segmento, { id: string; nombre: string; correo: string | null; ultimaVisitaEn: Date | null; proximoControlEn: Date | null; gasto12m: number }[]>();
  for (const p of pacientes) {
    const gasto12m = g.get(p.id) ?? 0;
    for (const s of segmentosDe({ ultimaVisitaEn: p.ultimaVisitaEn, creadoEn: p.creadoEn, gasto12m, visitas12m: v.get(p.id) ?? 0 }, ahora)) {
      conteos[s]++;
      const l = porSegmento.get(s) ?? [];
      if (l.length < 100) l.push({ id: p.id, nombre: p.nombre, correo: p.correo, ultimaVisitaEn: p.ultimaVisitaEn, proximoControlEn: p.proximoControlEn, gasto12m });
      porSegmento.set(s, l);
    }
  }
  return { total: pacientes.length, conteos, porSegmento };
}
