// Firma de una evolución: folio consecutivo por paciente y centro dentro de una transacción con bloqueo.
// Recibe el cliente Prisma (no importa @dent-view/db) para poder probarlo contra la base real.
import type { PrismaClient } from "@dent-view/db";
import type { Compuesto } from "./evolucion";
import { hashEvolucion } from "./evolucion-hash";

export type DatosFirma = {
  organizationId: string; pacienteId: string; ordenId: string | null; citaId: string | null;
  plantillaId: string | null; plantillaVersion: number | null; contenido: Compuesto;
  diagnosticos: { codigo: string; descripcion: string }[]; proximaCita: string | null;
  firmante: { id: string; nombre: string; tarjeta: string | null }; metodoFirma: "CLAVE" | "TOTP" | "CLAVE_TOTP";
  borradorId?: string | null; imagenIds?: string[];
};

export async function crearEvolucionFirmada(db: PrismaClient, d: DatosFirma) {
  return db.$transaction(async (tx) => {
    // Serializa las firmas del mismo paciente: sin huecos ni duplicados de folio bajo concurrencia.
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${`evolucion:${d.organizationId}:${d.pacienteId}`}, 0))`;
    const ult = await tx.evolucionClinica.aggregate({ where: { organizationId: d.organizationId, pacienteId: d.pacienteId }, _max: { folio: true } });
    const folio = (ult._max.folio ?? 0) + 1;
    const condiciones = await tx.condicionDental.findMany({ where: { pacienteId: d.pacienteId }, orderBy: [{ diente: "asc" }, { superficie: "asc" }, { condicion: "asc" }], select: { diente: true, superficie: true, condicion: true, notas: true } });
    const firmadaEn = new Date();
    const c = d.contenido;
    const fila = {
      organizationId: d.organizationId, pacienteId: d.pacienteId, folio, ordenId: d.ordenId, citaId: d.citaId,
      plantillaId: d.plantillaId, plantillaVersion: d.plantillaVersion,
      motivoConsulta: c.motivoConsulta, hallazgos: c.hallazgos, procedimiento: c.procedimiento,
      diagnosticosCie10: d.diagnosticos, plan: c.plan, indicaciones: c.indicaciones,
      proximaCita: d.proximaCita ? new Date(`${d.proximaCita}T00:00:00Z`) : null, odontogramaSnapshot: condiciones,
      firmanteId: d.firmante.id, firmanteNombre: d.firmante.nombre, firmanteTarjeta: d.firmante.tarjeta, firmadaEn,
    };
    const hashContenido = hashEvolucion(fila);
    const ev = await tx.evolucionClinica.create({ data: { ...fila, hashContenido, metodoFirma: d.metodoFirma } });
    if (d.imagenIds?.length) {
      const imgs = await tx.imagenEstudio.findMany({ where: { id: { in: d.imagenIds }, organizationId: d.organizationId, pacienteId: d.pacienteId } });
      if (imgs.length) await tx.adjuntoEvolucion.createMany({ data: imgs.map((i) => ({ organizationId: d.organizationId, evolucionId: ev.id, key: i.claveS3, nombre: i.titulo || i.nombreOriginal, mime: i.mime, tamano: i.bytes, subidoPorId: d.firmante.id })) });
    }
    if (d.borradorId) await tx.borradorEvolucion.deleteMany({ where: { id: d.borradorId, organizationId: d.organizationId } });
    await tx.evento.create({ data: { organizationId: d.organizationId, pacienteId: d.pacienteId, actorId: d.firmante.id, tipo: "hc.firmada", detalle: { evolucionId: ev.id, folio, ordenId: d.ordenId, hash: hashContenido.slice(0, 12) } } });
    return { id: ev.id, folio, hashContenido };
  }, { timeout: 15_000 });
}
