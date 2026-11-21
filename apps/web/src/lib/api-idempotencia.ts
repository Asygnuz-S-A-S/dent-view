// Idempotencia de los POST: misma clave + misma petición → misma respuesta; misma clave + otro cuerpo → 422.
import { createHash } from "node:crypto";

export const MAX_CLAVE = 80;
export const VIDA_CLAVE_MS = 24 * 3600_000;

export const claveValida = (c: string) => c.length >= 1 && c.length <= MAX_CLAVE && /^[\x21-\x7E]+$/.test(c);

/** Huella de la petición (método, ruta y cuerpo normalizado) que se guarda en `metodoRuta`. */
export const huellaPeticion = (metodo: string, ruta: string, cuerpo: unknown) =>
  `${metodo} ${ruta}#${createHash("sha256").update(JSON.stringify(cuerpo ?? null)).digest("hex")}`;

export type Decision = "NUEVA" | "REPETIR" | "CONFLICTO";
export function decidirIdempotencia(guardado: { metodoRuta: string; creadoEn: Date } | null, huella: string, ahora = new Date()): Decision {
  if (!guardado || ahora.getTime() - guardado.creadoEn.getTime() >= VIDA_CLAVE_MS) return "NUEVA";
  return guardado.metodoRuta === huella ? "REPETIR" : "CONFLICTO";
}
