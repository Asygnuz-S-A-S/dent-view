// Máquina de estados del documento electrónico (pura).
export type EstadoDoc = "BORRADOR" | "ENVIANDO" | "ACEPTADA" | "RECHAZADA" | "ERROR" | "ANULADA";

export const MAX_INTENTOS = 8;
/** Tiempo de reserva de un documento mientras un proceso lo trabaja (si el proceso muere, otro lo retoma al vencer). */
export const RESERVA_MS = 5 * 60_000;

const TRANSICIONES: Record<EstadoDoc, EstadoDoc[]> = {
  BORRADOR: ["ENVIANDO"],
  ENVIANDO: ["ACEPTADA", "RECHAZADA", "ERROR", "ENVIANDO"],
  ACEPTADA: ["ANULADA"], // solo con una nota crédito electrónica aceptada por el total
  RECHAZADA: ["ENVIANDO"], // reintento manual
  ERROR: ["ENVIANDO"], // reintento manual
  ANULADA: [],
};
export const puedeTransicionar = (de: EstadoDoc, a: EstadoDoc) => TRANSICIONES[de].includes(a);
export const esFinal = (e: EstadoDoc) => e === "ACEPTADA" || e === "ANULADA";
/** FEV vigente: bloquea una nueva emisión sobre la misma cuenta. */
export const esVigente = (e: EstadoDoc) => e !== "RECHAZADA" && e !== "ANULADA" && e !== "ERROR";

/** Espera antes del siguiente intento: 1 min, 2, 4... tope 2 h. `intentos` = intentos ya hechos. */
export const backoffMs = (intentos: number) => Math.min(60_000 * 2 ** Math.max(0, intentos - 1), 2 * 3600_000);

export const ETIQUETA_ESTADO_DOC: Record<EstadoDoc, string> = { BORRADOR: "Borrador", ENVIANDO: "Enviando", ACEPTADA: "Aceptada", RECHAZADA: "Rechazada", ERROR: "Con error", ANULADA: "Anulada" };
