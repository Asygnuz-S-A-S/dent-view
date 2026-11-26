// Hash de contenido de la evolución clínica (SHA-256 del JSON canónico). Solo servidor y pruebas: usa node:crypto.
import { createHash } from "node:crypto";

/** JSON con claves ordenadas, sin espacios, sin `undefined`, fechas en ISO: mismo contenido => mismos bytes. */
export function jsonCanonico(v: unknown): string {
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  if (v === null || typeof v !== "object") return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return `[${v.map((x) => jsonCanonico(x)).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${jsonCanonico(o[k])}`).join(",")}}`;
}

export const sha256 = (texto: string) => createHash("sha256").update(texto, "utf8").digest("hex");
export const hashCorto = (h: string) => h.slice(0, 12);

/** Contenido firmado de una evolución (lo que cubre el hash). Los adjuntos no entran: se vinculan aparte y solo se insertan. */
export type ContenidoFirmado = {
  organizationId: string; pacienteId: string; folio: number; ordenId: string | null; citaId: string | null;
  plantillaId: string | null; plantillaVersion: number | null;
  motivoConsulta: string | null; hallazgos: string | null; procedimiento: string | null;
  diagnosticosCie10: unknown; plan: string | null; indicaciones: string | null;
  proximaCita: Date | string | null; odontogramaSnapshot: unknown;
  firmanteId: string; firmanteNombre: string; firmanteTarjeta: string | null; firmadaEn: Date;
};

const dia = (d: Date | string | null) => (d == null ? null : typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10));

export function hashEvolucion(c: ContenidoFirmado): string {
  // Campos explícitos: una fila completa de la base (con id, hash, método…) debe dar el mismo hash que el contenido recién armado.
  return sha256(jsonCanonico({
    v: 1, organizationId: c.organizationId, pacienteId: c.pacienteId, folio: c.folio, ordenId: c.ordenId, citaId: c.citaId, plantillaId: c.plantillaId, plantillaVersion: c.plantillaVersion,
    motivoConsulta: c.motivoConsulta, hallazgos: c.hallazgos, procedimiento: c.procedimiento, diagnosticosCie10: c.diagnosticosCie10 ?? null, plan: c.plan, indicaciones: c.indicaciones,
    proximaCita: dia(c.proximaCita), odontogramaSnapshot: c.odontogramaSnapshot ?? null,
    firmanteId: c.firmanteId, firmanteNombre: c.firmanteNombre, firmanteTarjeta: c.firmanteTarjeta, firmadaEn: c.firmadaEn,
  }));
}

/** La adenda queda atada al hash de la evolución que corrige. */
export function hashAdenda(a: { organizationId: string; evolucionId: string; hashEvolucion: string; texto: string; firmanteId: string; firmanteNombre: string; firmanteTarjeta: string | null; firmadaEn: Date }): string {
  return sha256(jsonCanonico({
    v: 1, organizationId: a.organizationId, evolucionId: a.evolucionId, hashEvolucion: a.hashEvolucion, texto: a.texto,
    firmanteId: a.firmanteId, firmanteNombre: a.firmanteNombre, firmanteTarjeta: a.firmanteTarjeta, firmadaEn: a.firmadaEn,
  }));
}
