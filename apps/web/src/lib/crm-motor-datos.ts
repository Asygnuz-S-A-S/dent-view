// Motor de secuencias del CRM: capa de datos (siempre acotada por centro). Las reglas puras viven en crm-motor.ts.
// Todo es idempotente y seguro ante ejecuciones en paralelo: inscribir usa createMany skipDuplicates sobre (secuenciaId, claveUnica)
// y ejecutar reclama cada inscripción con SELECT … FOR UPDATE SKIP LOCKED dentro de una transacción.
import { prisma, type Prisma } from "@dent-view/db";
import { conectores } from "./conectores";
import { secretoCifrado } from "./cifrado";
import { coincideFiltro, esCierre, ETIQUETA_ETAPA, leerFiltro, type Disparador, type Etapa } from "./crm";
import { firmarBaja, urlBaja } from "./crm-baja";
import {
  claveLead, claveManual, clavePacienteAnio, clavePacienteOrden, clavePacienteTratamiento, clavePacienteValoracion, configEnvioDeEntorno, decidirCorreo, esCumpleanosHoy,
  inicioDiaBogota, motivoCancelacionPorEtapa, partesBogota, primerNombre, proximaEjecucion, renderVariables, type ConfigEnvio, type Decision,
} from "./crm-motor";
import { marcaDeCentro } from "./correo/marca";
import type { Marca } from "./correo/plantilla";

type Db = Prisma.TransactionClient | typeof prisma;
const DIA = 86_400_000;
const LIMITE_LOTE = 500;

// ---- Sujetos (lead o paciente) con sus salvaguardas de contacto ----
export type Sujeto = {
  tipo: "lead" | "paciente"; id: string; nombre: string; correo: string | null; noContactar: boolean; consentimientoMercadeo: boolean; responsableId: string | null;
};

export async function cargarSujeto(db: Db, organizationId: string, ref: { leadId?: string | null; pacienteId?: string | null }): Promise<Sujeto | null> {
  if (ref.leadId) {
    const l = await db.lead.findFirst({ where: { id: ref.leadId, organizationId } });
    return l && { tipo: "lead", id: l.id, nombre: l.nombre, correo: l.correo, noContactar: l.noContactar, consentimientoMercadeo: l.consentimientoMercadeo, responsableId: l.responsableId };
  }
  if (!ref.pacienteId) return null;
  const p = await db.pacienteTenant.findFirst({ where: { id: ref.pacienteId, organizationId } });
  if (!p) return null;
  const [pref, aut] = await Promise.all([
    db.preferenciaContacto.findUnique({ where: { pacienteId: p.id } }),
    db.autorizacion.findFirst({ where: { organizationId, pacienteId: p.id, finalidad: { equals: "mercadeo", mode: "insensitive" } }, orderBy: [{ creadoEn: "desc" }, { id: "desc" }] }),
  ]);
  return {
    tipo: "paciente", id: p.id, nombre: p.nombre, correo: p.correo, responsableId: null,
    noContactar: !!pref?.noContactar || pref?.correo === false,
    consentimientoMercadeo: !!aut && aut.otorgada && !aut.revocadaEn,
  };
}

// ---- Evaluación de un paso de correo (compartida por la ejecución real y la simulación) ----
type PasoDatos = { asunto: string | null; cuerpo: string | null };
export async function evaluarCorreo(db: Db, e: { organizationId: string; disparador: Disparador; filtro: unknown; sujeto: Sujeto; paso: PasoDatos; marca: Marca; ahora: Date; config: ConfigEnvio }) {
  const correoLimpio = e.sujeto.correo?.trim().toLowerCase() ?? null;
  const [enviadosHoyCentro, ultimo] = await Promise.all([
    db.ejecucionPaso.count({ where: { organizationId: e.organizationId, estado: "ENVIADO", creadoEn: { gte: inicioDiaBogota(e.ahora) } } }),
    correoLimpio
      ? db.ejecucionPaso.findFirst({
          where: {
            organizationId: e.organizationId, estado: "ENVIADO", creadoEn: { gte: new Date(e.ahora.getTime() - e.config.minHorasPorDestinatario * 3600_000) },
            inscripcion: { OR: [{ lead: { correo: { equals: correoLimpio, mode: "insensitive" } } }, { paciente: { correo: { equals: correoLimpio, mode: "insensitive" } } }] },
          },
          orderBy: { creadoEn: "desc" }, select: { creadoEn: true },
        })
      : null,
  ]);
  const f = leerFiltro(e.filtro);
  const decision: Decision = decidirCorreo({
    sujeto: e.sujeto, disparador: e.disparador, transaccional: !!f.transaccional, ahora: e.ahora, config: e.config, enviadosHoyCentro, ultimoEnvioDestinatario: ultimo?.creadoEn ?? null,
  });
  const vars = { nombre: primerNombre(e.sujeto.nombre), centro: e.marca.nombre, enlace: f.enlace ?? "" };
  return { decision, asunto: renderVariables(e.paso.asunto ?? "", vars).slice(0, 200), cuerpo: renderVariables(e.paso.cuerpo ?? "", vars), enlace: f.enlace ?? null };
}

// ---- Cancelaciones y cambio de etapa ----
export const cancelarInscripciones = (db: Db, where: Prisma.InscripcionSecuenciaWhereInput, motivo: string) =>
  db.inscripcionSecuencia.updateMany({ where: { ...where, estado: "ACTIVA" }, data: { estado: "CANCELADA", finalizadoEn: new Date(), motivoFin: motivo } });

/** Cambia la etapa del lead, deja la línea de tiempo y cancela las secuencias que dejan de aplicar (respuesta o cierre). */
export async function cambiarEtapaLead(db: Db, p: { organizationId: string; leadId: string; etapa: Etapa; autorId?: string | null; automatica?: boolean; motivoPerdida?: string | null; exceptoInscripcionId?: string }) {
  const lead = await db.lead.findFirst({ where: { id: p.leadId, organizationId: p.organizationId } });
  if (!lead) return null;
  if (lead.etapa === p.etapa) return lead;
  const actualizado = await db.lead.update({
    where: { id: lead.id },
    data: { etapa: p.etapa, cerradoEn: esCierre(p.etapa) ? new Date() : null, motivoPerdida: p.etapa === "PERDIDO" ? (p.motivoPerdida ?? null) : null },
  });
  await db.actividadLead.create({
    data: { organizationId: p.organizationId, leadId: lead.id, tipo: "CAMBIO_ETAPA", texto: `${ETIQUETA_ETAPA[lead.etapa as Etapa]} → ${ETIQUETA_ETAPA[p.etapa]}${p.etapa === "PERDIDO" && p.motivoPerdida ? ` (${p.motivoPerdida})` : ""}`, autorId: p.autorId ?? null, automatica: !!p.automatica },
  });
  const activas = await db.inscripcionSecuencia.findMany({
    where: { organizationId: p.organizationId, leadId: lead.id, estado: "ACTIVA", ...(p.exceptoInscripcionId ? { id: { not: p.exceptoInscripcionId } } : {}) },
    select: { id: true, secuencia: { select: { disparador: true } } },
  });
  const porMotivo = new Map<string, string[]>();
  for (const i of activas) {
    const m = motivoCancelacionPorEtapa(i.secuencia.disparador, p.etapa, lead.etapa as Etapa);
    if (m) porMotivo.set(m, [...(porMotivo.get(m) ?? []), i.id]);
  }
  for (const [m, ids] of porMotivo) await cancelarInscripciones(db, { id: { in: ids } }, m);
  return actualizado;
}

// ---- Detección de disparos ----
type Candidato = { clave: string; leadId?: string; pacienteId?: string; valoracionId?: string };
type SecuenciaConPasos = { id: string; disparador: Disparador; diasInactividad: number | null; filtro: unknown };
type ConfigFid = { activa: boolean; recordarCumpleanos: boolean } | null;

async function candidatosDe(db: Db, org: string, s: SecuenciaConPasos, ahora: Date, cfg: ConfigFid): Promise<Candidato[]> {
  const hace = (dias: number) => new Date(ahora.getTime() - dias * DIA);
  const filtro = leerFiltro(s.filtro);
  const fid = !!cfg?.activa;
  const bog = partesBogota(ahora);
  switch (s.disparador) {
    case "LEAD_NUEVO":
    case "LEAD_SIN_RESPUESTA": {
      const dias = s.diasInactividad ?? 3;
      const leads = await db.lead.findMany({
        where: { organizationId: org, etapa: "NUEVO", noContactar: false, creadoEn: s.disparador === "LEAD_NUEVO" ? { gte: hace(30) } : { gte: hace(90), lte: hace(dias) } },
        select: { id: true, origen: true, interes: true }, orderBy: { creadoEn: "asc" }, take: LIMITE_LOTE,
      });
      return leads.filter((l) => coincideFiltro(filtro, l)).map((l) => ({ clave: claveLead(l.id), leadId: l.id }));
    }
    case "VALORACION_COMPLETADA": {
      const v = await db.valoracion.findMany({
        where: { organizationId: org, estado: "COMPLETADA", completadaEn: { gte: hace(30) }, OR: [{ pacienteId: { not: null } }, { leadId: { not: null } }] },
        select: { id: true, pacienteId: true, leadId: true }, take: LIMITE_LOTE,
      });
      return v.map((x) => (x.pacienteId ? { clave: clavePacienteValoracion(x.pacienteId, x.id), pacienteId: x.pacienteId, valoracionId: x.id } : { clave: claveLead(x.leadId!), leadId: x.leadId!, valoracionId: x.id }));
    }
    case "ORDEN_ENTREGADA": {
      const o = await db.orden.findMany({ where: { organizationId: org, estado: "ENTREGADA", actualizadoEn: { gte: hace(30) } }, select: { id: true, pacienteId: true }, take: LIMITE_LOTE });
      return o.map((x) => ({ clave: clavePacienteOrden(x.pacienteId, x.id), pacienteId: x.pacienteId }));
    }
    case "TRATAMIENTO_TERMINADO": {
      // Plan con ítems realizados y ninguno pendiente, y una cita atendida en los últimos 30 días.
      const filas = await db.$queryRaw<{ id: string }[]>`
        SELECT p.id FROM "PacienteTenant" p WHERE p."organizationId" = ${org}
          AND EXISTS (SELECT 1 FROM "PlanTratamientoItem" i WHERE i."pacienteId" = p.id AND i.estado = 'REALIZADO')
          AND NOT EXISTS (SELECT 1 FROM "PlanTratamientoItem" i WHERE i."pacienteId" = p.id AND i.estado IN ('PLANEADO', 'ACEPTADO'))
          AND EXISTS (SELECT 1 FROM "Cita" c WHERE c."pacienteId" = p.id AND c.estado = 'ATENDIDA' AND c.inicio >= ${hace(30)})
        LIMIT ${LIMITE_LOTE}`;
      return filas.map((f) => ({ clave: clavePacienteTratamiento(f.id, bog.anio, bog.mes), pacienteId: f.id }));
    }
    case "PACIENTE_INACTIVO": {
      if (!fid) return [];
      const p = await db.pacienteTenant.findMany({ where: { organizationId: org, ultimaVisitaEn: { lte: hace(s.diasInactividad ?? 180) } }, select: { id: true }, orderBy: { ultimaVisitaEn: "desc" }, take: LIMITE_LOTE });
      return p.map((x) => ({ clave: clavePacienteAnio(x.id, bog.anio), pacienteId: x.id }));
    }
    case "CUMPLEANOS": {
      if (!fid || !cfg?.recordarCumpleanos) return [];
      const filas = await db.$queryRaw<{ id: string; fechaNacimiento: Date }[]>`
        SELECT id, "fechaNacimiento" FROM "PacienteTenant" WHERE "organizationId" = ${org} AND "fechaNacimiento" IS NOT NULL AND EXTRACT(MONTH FROM "fechaNacimiento") = ${bog.mes}`;
      return filas.filter((f) => esCumpleanosHoy(f.fechaNacimiento, ahora)).map((f) => ({ clave: clavePacienteAnio(f.id, bog.anio), pacienteId: f.id }));
    }
    case "CONTROL_PERIODICO": {
      if (!fid) return [];
      const p = await db.pacienteTenant.findMany({ where: { organizationId: org, proximoControlEn: { lte: ahora } }, select: { id: true, ultimaVisitaEn: true, proximoControlEn: true }, take: LIMITE_LOTE });
      return p.filter((x) => !x.ultimaVisitaEn || x.ultimaVisitaEn < x.proximoControlEn!).map((x) => ({ clave: clavePacienteAnio(x.id, bog.anio), pacienteId: x.id }));
    }
    default:
      return [];
  }
}

/** Inscribe a quien cumple el disparador de cada secuencia activa. Devuelve cuántas inscripciones nuevas creó. */
export async function detectarDisparos(organizationId: string, ahora = new Date()) {
  const [secuencias, cfg] = await Promise.all([
    prisma.secuenciaCRM.findMany({ where: { organizationId, activa: true, disparador: { not: "MANUAL" } }, include: { pasos: { orderBy: { orden: "asc" }, take: 1 } } }),
    prisma.configFidelizacion.findUnique({ where: { organizationId } }),
  ]);
  let creadas = 0;
  for (const s of secuencias) {
    const primero = s.pasos[0];
    if (!primero) continue;
    const c = await candidatosDe(prisma, organizationId, s, ahora, cfg);
    if (!c.length) continue;
    const r = await prisma.inscripcionSecuencia.createMany({
      data: c.map(({ clave, ...x }) => ({ organizationId, secuenciaId: s.id, ...x, claveUnica: clave, proximaEjecucion: proximaEjecucion(ahora, primero) })),
      skipDuplicates: true,
    });
    creadas += r.count;
  }
  return creadas;
}

// ---- Ejecución de pasos vencidos ----
type Resultado = "ejecutada" | "nada";
type Insc = Prisma.InscripcionSecuenciaGetPayload<{ include: { secuencia: { include: { pasos: true } } } }>;
const MAX_REINTENTOS = 3;

export async function procesarInscripcion(organizationId: string, id: string, ahora: Date, config: ConfigEnvio, marca: Marca): Promise<Resultado> {
  return prisma.$transaction(async (tx) => {
    // Bloqueo de fila: si otro proceso la tiene, SKIP LOCKED la omite; si ya avanzó, la condición deja de cumplirse.
    const bloqueada = await tx.$queryRaw<{ id: string }[]>`
      SELECT i.id FROM "InscripcionSecuencia" i JOIN "SecuenciaCRM" s ON s.id = i."secuenciaId"
      WHERE i.id = ${id} AND i."organizationId" = ${organizationId} AND i.estado = 'ACTIVA' AND s.activa AND i."proximaEjecucion" <= ${ahora}
      FOR UPDATE OF i SKIP LOCKED`;
    if (!bloqueada.length) return "nada";
    const ins = await tx.inscripcionSecuencia.findUniqueOrThrow({ where: { id }, include: { secuencia: { include: { pasos: { orderBy: { orden: "asc" } } } } } });
    const paso = ins.secuencia.pasos[ins.pasoActual];
    if (!paso) { await finalizar(tx, ins, "COMPLETADA", "completada"); return "ejecutada"; }
    const sujeto = await cargarSujeto(tx, organizationId, ins);
    if (!sujeto) { await finalizar(tx, ins, "CANCELADA", "sujeto_no_disponible"); return "ejecutada"; }
    const ref = sujeto.tipo === "lead" ? { leadId: sujeto.id } : { pacienteId: sujeto.id };
    const registrar = (estado: "ENVIADO" | "FALLIDO" | "OMITIDO" | "TAREA_CREADA", detalle: string) =>
      tx.ejecucionPaso.create({ data: { organizationId, inscripcionId: ins.id, pasoId: paso.id, estado, detalle: detalle.slice(0, 300) } });
    const actividad = (tipo: "CORREO" | "TAREA" | "AUTOMATICA", texto: string) =>
      tx.actividadLead.create({ data: { organizationId, ...ref, tipo, texto: `${ins.secuencia.nombre}: ${texto}`.slice(0, 500), automatica: true } });

    switch (paso.accion) {
      case "CORREO": {
        const ev = await evaluarCorreo(tx, { organizationId, disparador: ins.secuencia.disparador, filtro: ins.secuencia.filtro, sujeto, paso, marca, ahora, config });
        const d = ev.decision;
        if (d.accion === "reprogramar") { await tx.inscripcionSecuencia.update({ where: { id }, data: { proximaEjecucion: d.hasta } }); return "nada"; }
        if (d.accion === "omitir") {
          await registrar("OMITIDO", d.motivo);
          await actividad("AUTOMATICA", `correo omitido (${d.motivo.split(":")[0]})`);
          if (d.cancelar) await finalizar(tx, ins, "CANCELADA", "no_contactar");
          else await avanzar(tx, ins, ahora);
          return "ejecutada";
        }
        const secreto = secretoCifrado();
        try {
          if (!secreto) throw new Error("Falta BETTER_AUTH_SECRET/CIFRADO_SECRETO para firmar el enlace de baja");
          const baja = urlBaja(firmarBaja({ o: organizationId, t: sujeto.tipo === "lead" ? "l" : "p", i: sujeto.id }, secreto));
          const r = await conectores.CORREO.enviar({
            para: sujeto.correo!, asunto: ev.asunto, cuerpo: ev.cuerpo, marca,
            vista: {
              titulo: ev.asunto, ...(ev.enlace ? { boton: { texto: "Abrir enlace", url: ev.enlace } } : {}),
              aviso: `Recibes este mensaje de ${marca.nombre}. Si no quieres recibir más mensajes de seguimiento, entra a este enlace y confirma la baja: ${baja}`,
            },
          });
          await registrar("ENVIADO", `Correo «${ev.asunto}»${r.simulado ? " (simulado, sin SMTP)" : ""}`);
          await actividad("CORREO", `correo enviado «${ev.asunto}»`);
          await avanzar(tx, ins, ahora);
        } catch (err) {
          const detalle = String(err instanceof Error ? err.message : err);
          await registrar("FALLIDO", detalle);
          const fallos = await tx.ejecucionPaso.count({ where: { inscripcionId: id, pasoId: paso.id, estado: "FALLIDO" } });
          if (fallos >= MAX_REINTENTOS) await avanzar(tx, ins, ahora);
          else await tx.inscripcionSecuencia.update({ where: { id }, data: { proximaEjecucion: new Date(ahora.getTime() + 3600_000) } });
        }
        return "ejecutada";
      }
      case "TAREA": {
        await tx.tareaCRM.create({ data: { organizationId, ...ref, titulo: paso.tareaTitulo?.trim() || `Seguimiento: ${ins.secuencia.nombre}`, vence: ahora, asignadoId: sujeto.responsableId, automatica: true } });
        await registrar("TAREA_CREADA", paso.tareaTitulo ?? "Tarea de seguimiento");
        await actividad("TAREA", `tarea creada «${paso.tareaTitulo ?? "Seguimiento"}»`);
        await avanzar(tx, ins, ahora);
        return "ejecutada";
      }
      case "CAMBIAR_ETAPA": {
        if (sujeto.tipo !== "lead" || !paso.etapaDestino) await registrar("OMITIDO", "El cambio de etapa solo aplica a leads");
        else await cambiarEtapaLead(tx, { organizationId, leadId: sujeto.id, etapa: paso.etapaDestino, automatica: true, exceptoInscripcionId: id });
        await avanzar(tx, ins, ahora);
        return "ejecutada";
      }
      default:
        await finalizar(tx, ins, "COMPLETADA", "finalizada_por_paso");
        return "ejecutada";
    }
  }, { timeout: 30_000, maxWait: 5_000 });
}

const finalizar = (db: Db, ins: { id: string }, estado: "COMPLETADA" | "CANCELADA", motivo: string) =>
  db.inscripcionSecuencia.update({ where: { id: ins.id }, data: { estado, finalizadoEn: new Date(), motivoFin: motivo } });

async function avanzar(db: Db, ins: Insc, ahora: Date) {
  const sig = ins.secuencia.pasos.find((p) => p.orden > ins.secuencia.pasos[ins.pasoActual]!.orden);
  if (!sig) return finalizar(db, ins, "COMPLETADA", "completada");
  return db.inscripcionSecuencia.update({ where: { id: ins.id }, data: { pasoActual: ins.pasoActual + 1, proximaEjecucion: proximaEjecucion(ahora, sig) } });
}

/** Ejecuta los pasos vencidos de las secuencias activas del centro (un paso por inscripción y pasada). */
export async function ejecutarVencidas(organizationId: string, ahora = new Date(), limite = 100) {
  const config = configEnvioDeEntorno();
  const marca = await marcaDeCentro(organizationId);
  const ids = await prisma.$queryRaw<{ id: string }[]>`
    SELECT i.id FROM "InscripcionSecuencia" i JOIN "SecuenciaCRM" s ON s.id = i."secuenciaId"
    WHERE i."organizationId" = ${organizationId} AND i.estado = 'ACTIVA' AND s.activa AND i."proximaEjecucion" <= ${ahora}
    ORDER BY i."proximaEjecucion" LIMIT ${limite}`;
  let ejecutadas = 0, errores = 0;
  for (const { id } of ids) {
    try { if ((await procesarInscripcion(organizationId, id, ahora, config, marca)) === "ejecutada") ejecutadas++; }
    catch (e) { errores++; console.error("crm: error al ejecutar la inscripción", id, e instanceof Error ? e.message : e); }
  }
  return { vencidas: ids.length, ejecutadas, errores };
}

// ---- Mantenimiento de fidelización ----
/** Última visita = la cita atendida o factura (no anulada) más reciente; próximo control = última visita + días de control (solo con fidelización activa). */
export async function mantenimientoFidelizacion(organizationId: string) {
  const visitas = await prisma.$executeRaw`
    UPDATE "PacienteTenant" p SET "ultimaVisitaEn" = v.ult
    FROM (
      SELECT "pacienteId", MAX(f) AS ult FROM (
        SELECT "pacienteId", inicio AS f FROM "Cita" WHERE "organizationId" = ${organizationId} AND estado = 'ATENDIDA' AND "pacienteId" IS NOT NULL
        UNION ALL
        SELECT "pacienteId", fecha AS f FROM "Factura" WHERE "organizationId" = ${organizationId} AND estado <> 'ANULADA' AND "pacienteId" IS NOT NULL
      ) x GROUP BY "pacienteId"
    ) v
    WHERE p.id = v."pacienteId" AND p."organizationId" = ${organizationId} AND (p."ultimaVisitaEn" IS NULL OR p."ultimaVisitaEn" < v.ult)`;
  const cfg = await prisma.configFidelizacion.findUnique({ where: { organizationId } });
  let controles = 0;
  if (cfg?.activa) {
    controles = await prisma.$executeRaw`
      UPDATE "PacienteTenant" SET "proximoControlEn" = "ultimaVisitaEn" + make_interval(days => ${cfg.diasControl})
      WHERE "organizationId" = ${organizationId} AND "ultimaVisitaEn" IS NOT NULL AND ("proximoControlEn" IS NULL OR "proximoControlEn" < "ultimaVisitaEn")`;
  }
  return { visitas, controles };
}

/** Un ciclo completo para un centro: mantenimiento → disparos → ejecución. */
export async function correrCrmCentro(organizationId: string, ahora = new Date()) {
  const mant = await mantenimientoFidelizacion(organizationId);
  const inscritos = await detectarDisparos(organizationId, ahora);
  return { ...mant, inscritos, ...(await ejecutarVencidas(organizationId, ahora)) };
}

/** Centros con algo que hacer: secuencias activas o fidelización activa. */
export async function centrosConCrm() {
  const [a, b] = await Promise.all([
    prisma.secuenciaCRM.groupBy({ by: ["organizationId"], where: { activa: true } }),
    prisma.configFidelizacion.findMany({ where: { activa: true }, select: { organizationId: true } }),
  ]);
  return [...new Set([...a.map((x) => x.organizationId), ...b.map((x) => x.organizationId)])];
}

// ---- Inscripción manual ----
export async function inscribirManual(organizationId: string, secuenciaId: string, ref: { leadId?: string; pacienteId?: string }, ahora = new Date()): Promise<{ error: string } | { ok: true }> {
  const s = await prisma.secuenciaCRM.findFirst({ where: { id: secuenciaId, organizationId }, include: { pasos: { orderBy: { orden: "asc" }, take: 1 } } });
  if (!s) return { error: "Secuencia no encontrada" };
  if (!s.pasos[0]) return { error: "La secuencia no tiene pasos" };
  const sujeto = await cargarSujeto(prisma, organizationId, ref);
  if (!sujeto) return { error: "Persona no encontrada" };
  const ya = await prisma.inscripcionSecuencia.findFirst({ where: { organizationId, secuenciaId, estado: "ACTIVA", ...(ref.leadId ? { leadId: ref.leadId } : { pacienteId: ref.pacienteId }) }, select: { id: true } });
  if (ya) return { error: "Ya está inscrita en esta secuencia" };
  await prisma.inscripcionSecuencia.create({ data: { organizationId, secuenciaId, ...ref, claveUnica: claveManual(sujeto.id, ahora.getTime()), proximaEjecucion: proximaEjecucion(ahora, s.pasos[0]) } });
  return { ok: true };
}

// ---- Simulación (dry run) ----
export type FilaSimulacion = { nombre: string; motivo: string; paso: number; accion: string; resultado: string; asunto: string | null; cuerpo: string | null };

/** Lista a quién contactaría la secuencia hoy y con qué mensaje, sin enviar ni escribir nada. */
export async function simularSecuencia(organizationId: string, secuenciaId: string, ahora = new Date()): Promise<{ filas: FilaSimulacion[]; total: number } | null> {
  const s = await prisma.secuenciaCRM.findFirst({ where: { id: secuenciaId, organizationId }, include: { pasos: { orderBy: { orden: "asc" } } } });
  if (!s) return null;
  const [cfg, marca] = await Promise.all([prisma.configFidelizacion.findUnique({ where: { organizationId } }), marcaDeCentro(organizationId)]);
  const config = configEnvioDeEntorno();
  const finDia = new Date(inicioDiaBogota(ahora).getTime() + DIA);
  const items: { ref: { leadId?: string; pacienteId?: string }; motivo: string; indice: number }[] = [];

  const vencen = await prisma.inscripcionSecuencia.findMany({ where: { organizationId, secuenciaId, estado: "ACTIVA", proximaEjecucion: { lt: finDia } }, take: 100, orderBy: { proximaEjecucion: "asc" } });
  for (const i of vencen) items.push({ ref: i.leadId ? { leadId: i.leadId } : { pacienteId: i.pacienteId! }, motivo: `Paso ${i.pasoActual + 1} vence hoy`, indice: i.pasoActual });
  if (s.disparador !== "MANUAL" && s.pasos[0]) {
    const c = await candidatosDe(prisma, organizationId, s, ahora, cfg);
    const claves = c.length ? new Set((await prisma.inscripcionSecuencia.findMany({ where: { secuenciaId, claveUnica: { in: c.map((x) => x.clave) } }, select: { claveUnica: true } })).map((x) => x.claveUnica)) : new Set<string>();
    for (const x of c.filter((x) => !claves.has(x.clave)).slice(0, 100)) {
      items.push({ ref: x.leadId ? { leadId: x.leadId } : { pacienteId: x.pacienteId }, motivo: `Se inscribiría hoy (primer paso en ${s.pasos[0].esperaDias} d ${s.pasos[0].esperaHoras} h)`, indice: 0 });
    }
  }
  const filas: FilaSimulacion[] = [];
  for (const it of items.slice(0, 50)) {
    const paso = s.pasos[it.indice];
    const sujeto = paso && (await cargarSujeto(prisma, organizationId, it.ref));
    if (!paso || !sujeto) continue;
    if (paso.accion !== "CORREO") { filas.push({ nombre: sujeto.nombre, motivo: it.motivo, paso: it.indice + 1, accion: paso.accion, resultado: paso.accion === "TAREA" ? "Crearía la tarea" : paso.accion === "CAMBIAR_ETAPA" ? "Cambiaría la etapa" : "Finalizaría", asunto: null, cuerpo: null }); continue; }
    const ev = await evaluarCorreo(prisma, { organizationId, disparador: s.disparador, filtro: s.filtro, sujeto, paso, marca, ahora, config });
    const d = ev.decision;
    filas.push({
      nombre: sujeto.nombre, motivo: it.motivo, paso: it.indice + 1, accion: "CORREO",
      resultado: d.accion === "enviar" ? "Enviaría el correo" : d.accion === "omitir" ? `Se omitiría: ${d.motivo.split(":")[0]!.replace(/_/g, " ")}` : `Esperaría: ${d.motivo}`,
      asunto: d.accion === "enviar" ? ev.asunto : null, cuerpo: d.accion === "enviar" ? ev.cuerpo : null,
    });
  }
  return { filas, total: items.length };
}

// ---- Baja (la usa la página pública /baja/[token]) ----
export async function aplicarBaja(s: { o: string; t: "l" | "p"; i: string }): Promise<{ ok: true; centro: string } | { error: string }> {
  const org = await prisma.organization.findUnique({ where: { id: s.o }, select: { name: true } });
  if (!org) return { error: "Enlace no válido" };
  const ahora = new Date();
  if (s.t === "l") {
    const l = await prisma.lead.findFirst({ where: { id: s.i, organizationId: s.o }, select: { id: true } });
    if (!l) return { error: "Enlace no válido" };
    await prisma.$transaction([
      prisma.lead.update({ where: { id: l.id }, data: { noContactar: true, consentimientoMercadeo: false } }),
      prisma.actividadLead.create({ data: { organizationId: s.o, leadId: l.id, tipo: "AUTOMATICA", texto: "La persona pidió no recibir más mensajes (enlace de baja)", automatica: true } }),
      prisma.inscripcionSecuencia.updateMany({ where: { organizationId: s.o, leadId: l.id, estado: "ACTIVA" }, data: { estado: "CANCELADA", finalizadoEn: ahora, motivoFin: "no_contactar" } }),
      prisma.evento.create({ data: { organizationId: s.o, tipo: "crm.baja", detalle: { leadId: l.id, via: "enlace" } } }),
    ]);
  } else {
    const p = await prisma.pacienteTenant.findFirst({ where: { id: s.i, organizationId: s.o }, select: { id: true } });
    if (!p) return { error: "Enlace no válido" };
    await prisma.$transaction([
      prisma.preferenciaContacto.upsert({ where: { pacienteId: p.id }, update: { noContactar: true }, create: { pacienteId: p.id, organizationId: s.o, noContactar: true } }),
      prisma.autorizacion.create({ data: { organizationId: s.o, pacienteId: p.id, tipo: "DATOS", finalidad: "mercadeo", otorgada: false, revocadaEn: ahora, textoMostrado: "Baja desde el enlace de un correo de seguimiento" } }),
      prisma.actividadLead.create({ data: { organizationId: s.o, pacienteId: p.id, tipo: "AUTOMATICA", texto: "La persona pidió no recibir más mensajes (enlace de baja)", automatica: true } }),
      prisma.inscripcionSecuencia.updateMany({ where: { organizationId: s.o, pacienteId: p.id, estado: "ACTIVA" }, data: { estado: "CANCELADA", finalizadoEn: ahora, motivoFin: "no_contactar" } }),
      prisma.evento.create({ data: { organizationId: s.o, pacienteId: p.id, tipo: "crm.baja", detalle: { via: "enlace" } } }),
    ]);
  }
  return { ok: true, centro: org.name };
}
