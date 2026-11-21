// Implementación independiente (sala limpia) a partir de docs/sala-limpia/01-documentos-e-informes.md
// Lógica pura del informe radiológico: estados, edición, versionado y código de verificación.
import { randomInt } from "node:crypto";

export const ESTADOS_INFORME = ["BORRADOR", "EMITIDO", "ARCHIVADO"] as const;
export type EstadoInforme = (typeof ESTADOS_INFORME)[number];
export const ETIQUETA_ESTADO_INFORME: Record<EstadoInforme, string> = { BORRADOR: "Borrador", EMITIDO: "Emitido", ARCHIVADO: "Archivado" };

/** Solo un borrador se edita; un informe emitido es inmutable y se corrige creando una nueva versión. */
export const informeEditable = (estado: string) => estado === "BORRADOR";
export const puedeEmitir = (i: { estado: string; hallazgos: string; impresion: string }) =>
  i.estado === "BORRADOR" && i.hallazgos.trim().length > 0 && i.impresion.trim().length > 0;
export const puedeCorregir = (i: { estado: string; vigente: boolean }) => i.estado === "EMITIDO" && i.vigente;
export const puedeArchivar = (estado: string) => estado === "BORRADOR" || estado === "EMITIDO";

const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sin caracteres ambiguos (I, L, O, 0, 1)
/** Código de verificación de 10 caracteres para el PDF (≈ 50 bits). */
export function generarCodigo(aleatorio: (max: number) => number = (m) => randomInt(m)) {
  return Array.from({ length: 10 }, () => ALFABETO[aleatorio(ALFABETO.length)]).join("");
}

/** Nombre de archivo limpio y portable: sin acentos, espacios ni caracteres de control. */
export function nombreArchivoInforme(numeroOrden: number | null, paciente: string, version: number) {
  const limpio = paciente.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "paciente";
  return `informe-${numeroOrden ?? "sin-orden"}-${limpio}-v${version}.pdf`;
}
