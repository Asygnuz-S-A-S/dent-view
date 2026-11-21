// Seguimiento de doctores: acceso a datos (siempre acotado por centro). La lógica del semáforo vive en seguimiento-doctores.ts.
import { prisma } from "@dent-view/db";
import { registrarEvento } from "./eventos";
import { fechaIso } from "./fechas";
import {
  calcularDoctor, ESTADOS_ABIERTOS, motivoParaSemaforo, requiereGestion, UMBRALES_POR_DEFECTO, ultimosMeses,
  type EstadoSegDoctor, type MotivoSegDoctor, type ResumenDoctor, type Umbrales,
} from "./seguimiento-doctores";

const ABIERTOS = [...ESTADOS_ABIERTOS] as EstadoSegDoctor[];

export type SeguimientoAbierto = {
  id: string; estado: EstadoSegDoctor; motivo: MotivoSegDoctor; responsableId: string | null; proximoContacto: Date | null; nota: string | null; creadoEn: Date;
};
export type FilaDoctor = ResumenDoctor & {
  doctorId: string; nombre: string; correo: string; especialidad: string | null; telefono: string | null; miembroDesde: Date;
  ingresos12m: number;
  convenio: { id: string; nombre: string; descuento: number | null } | null;
  tarifasEspeciales: number;
  abierto: SeguimientoAbierto | null;
  responsable: string | null;
};

export async function cargarUmbrales(organizationId: string): Promise<Umbrales> {
  const c = await prisma.configSeguimientoDoctor.findUnique({ where: { organizationId } });
  return c ? { umbralRiesgoFactor: c.umbralRiesgoFactor, diasInactivo: c.diasInactivo, diasInactivoCritico: c.diasInactivoCritico } : UMBRALES_POR_DEFECTO;
}

/** Un doctor queda RECUPERADO cuando remite después de abierto su seguimiento (orden no cancelada o estudio sin orden). */
export async function sincronizarRecuperados(organizationId: string) {
  const abiertos = await prisma.seguimientoDoctor.findMany({ where: { organizationId, estado: { in: ABIERTOS } }, select: { id: true, doctorId: true, creadoEn: true } });
  if (abiertos.length === 0) return 0;
  const doctorIds = [...new Set(abiertos.map((s) => s.doctorId))];
  const donde = { organizationId, doctorRemitenteId: { in: doctorIds } };
  const [ord, est] = await Promise.all([
    prisma.orden.groupBy({ by: ["doctorRemitenteId"], where: { ...donde, estado: { not: "CANCELADA" } }, _max: { creadoEn: true } }),
    prisma.estudio.groupBy({ by: ["doctorRemitenteId"], where: { ...donde, ordenId: null }, _max: { creadoEn: true } }),
  ]);
  const ultima = new Map<string, number>();
  for (const x of [...ord, ...est]) if (x.doctorRemitenteId && x._max.creadoEn) ultima.set(x.doctorRemitenteId, Math.max(ultima.get(x.doctorRemitenteId) ?? 0, x._max.creadoEn.getTime()));
  let n = 0;
  for (const s of abiertos) {
    if ((ultima.get(s.doctorId) ?? 0) <= s.creadoEn.getTime()) continue;
    const r = await prisma.seguimientoDoctor.updateMany({ where: { id: s.id, organizationId, estado: { in: ABIERTOS } }, data: { estado: "RECUPERADO", cerradoEn: new Date() } });
    if (r.count) {
      n++;
      await registrarEvento({ organizationId, actorId: null, tipo: "seguimiento_doctor.recuperado", detalle: { seguimientoId: s.id, doctorId: s.doctorId, automatico: true } });
    }
  }
  return n;
}

/** Una fila por doctor remitente del centro con su semáforo, ingresos de 12 meses, convenio y seguimiento abierto. */
export async function cargarDoctores(organizationId: string, ahora = new Date()): Promise<FilaDoctor[]> {
  const [umbrales, miembros] = await Promise.all([
    cargarUmbrales(organizationId),
    prisma.member.findMany({ where: { organizationId, role: "doctor_remitente" }, include: { user: { include: { perfilDoctor: true } } } }),
  ]);
  const ids = miembros.map((m) => m.userId);
  if (ids.length === 0) return [];
  const desde = new Date(`${ultimosMeses(ahora)[0]}-01T00:00:00-05:00`);
  const donde = { organizationId, doctorRemitenteId: { in: ids } };
  const [ordenes, estudios, facturas, abiertos, tarifas] = await Promise.all([
    prisma.orden.findMany({ where: { ...donde, estado: { not: "CANCELADA" } }, select: { doctorRemitenteId: true, creadoEn: true, convenioId: true }, orderBy: { creadoEn: "desc" } }),
    prisma.estudio.findMany({ where: { ...donde, ordenId: null }, select: { doctorRemitenteId: true, creadoEn: true } }),
    prisma.factura.findMany({
      where: { organizationId, estado: { not: "ANULADA" }, fecha: { gte: desde }, OR: [{ orden: { doctorRemitenteId: { in: ids } } }, { responsable: "DOCTOR", responsableId: { in: ids } }] },
      select: { total: true, responsableId: true, orden: { select: { doctorRemitenteId: true } } },
    }),
    prisma.seguimientoDoctor.findMany({ where: { organizationId, doctorId: { in: ids }, estado: { in: ABIERTOS } }, orderBy: { creadoEn: "desc" } }),
    prisma.tarifaEspecial.groupBy({ by: ["doctorId"], where: { organizationId, doctorId: { in: ids } }, _count: true }),
  ]);

  const fechas = new Map<string, Date[]>();
  const convenioId = new Map<string, string>(); // el de la orden más reciente que tenga convenio
  for (const o of ordenes) {
    if (!o.doctorRemitenteId) continue;
    (fechas.get(o.doctorRemitenteId) ?? fechas.set(o.doctorRemitenteId, []).get(o.doctorRemitenteId)!).push(o.creadoEn);
    if (o.convenioId && !convenioId.has(o.doctorRemitenteId)) convenioId.set(o.doctorRemitenteId, o.convenioId);
  }
  for (const e of estudios) if (e.doctorRemitenteId) (fechas.get(e.doctorRemitenteId) ?? fechas.set(e.doctorRemitenteId, []).get(e.doctorRemitenteId)!).push(e.creadoEn);
  const ingresos = new Map<string, number>();
  for (const f of facturas) { const d = f.orden?.doctorRemitenteId ?? f.responsableId; if (d) ingresos.set(d, (ingresos.get(d) ?? 0) + f.total); }
  const seguimiento = new Map<string, SeguimientoAbierto>();
  for (const s of abiertos) if (!seguimiento.has(s.doctorId)) seguimiento.set(s.doctorId, { ...s, estado: s.estado as EstadoSegDoctor, motivo: s.motivo as MotivoSegDoctor });
  const nTarifas = new Map(tarifas.map((t) => [t.doctorId, t._count]));

  const hoy = fechaIso(ahora);
  const convenios = await prisma.convenio.findMany({ where: { organizationId, id: { in: [...new Set(convenioId.values())] }, activo: true } });
  const vigente = new Map(convenios
    .filter((c) => (!c.vigenteDesde || c.vigenteDesde.toISOString().slice(0, 10) <= hoy) && (!c.vigenteHasta || c.vigenteHasta.toISOString().slice(0, 10) >= hoy))
    .map((c) => [c.id, { id: c.id, nombre: c.nombre, descuento: c.descuentoGeneral }]));
  const responsables = new Map((await prisma.user.findMany({ where: { id: { in: [...new Set([...seguimiento.values()].map((s) => s.responsableId).filter((x): x is string => !!x))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));

  return miembros.map((m) => {
    const ab = seguimiento.get(m.userId) ?? null;
    return {
      ...calcularDoctor(fechas.get(m.userId) ?? [], ahora, umbrales),
      doctorId: m.userId, nombre: m.user.name, correo: m.user.email, especialidad: m.user.perfilDoctor?.especialidad ?? null, telefono: m.user.perfilDoctor?.telefono ?? null,
      miembroDesde: m.createdAt, ingresos12m: ingresos.get(m.userId) ?? 0,
      convenio: vigente.get(convenioId.get(m.userId) ?? "") ?? null, tarifasEspeciales: nTarifas.get(m.userId) ?? 0,
      abierto: ab, responsable: ab?.responsableId ? responsables.get(ab.responsableId) ?? null : null,
    };
  });
}

/**
 * Crea una tarea por cada doctor en riesgo/inactivo/crítico sin tarea abierta. Idempotente: un candado por centro
 * evita duplicados si se lanza a la vez desde el botón y el cron.
 */
export async function generarSeguimientos(organizationId: string, actorId: string | null, ahora = new Date()) {
  await sincronizarRecuperados(organizationId);
  const filas = await cargarDoctores(organizationId, ahora);
  const candidatos = filas.filter((f) => requiereGestion(f.semaforo) && !f.abierto);
  if (candidatos.length === 0) return 0;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`seg-doctores:${organizationId}`}))`;
    let creados = 0;
    for (const f of candidatos) {
      if (await tx.seguimientoDoctor.findFirst({ where: { organizationId, doctorId: f.doctorId, estado: { in: ABIERTOS } }, select: { id: true } })) continue;
      const s = await tx.seguimientoDoctor.create({ data: { organizationId, doctorId: f.doctorId, motivo: motivoParaSemaforo(f.semaforo) } });
      await registrarEvento({ organizationId, actorId, tipo: "seguimiento_doctor.creado", detalle: { seguimientoId: s.id, doctorId: f.doctorId, motivo: s.motivo, automatico: true } }, tx);
      creados++;
    }
    return creados;
  });
}
