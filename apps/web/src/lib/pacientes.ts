// Lógica pura de pacientes (sin I/O) para poder probarla.
import { z } from "zod";

export const TIPOS_DOCUMENTO = ["CC", "TI", "CE", "PA", "RC"] as const;

export const esquemaTipoDocumento = z.enum(TIPOS_DOCUMENTO);
export const esquemaNumeroDocumento = z.string().transform(normalizarDocumento).pipe(z.string().min(3, "Documento inválido").max(20));

export const CONDICIONES = ["caries", "restauracion", "corona", "endodoncia", "implante", "ausente"] as const;
export type Condicion = (typeof CONDICIONES)[number];

/** Documento comparable: sin espacios, puntos ni guiones, en mayúsculas ("1.053-123 456" → "1053123456"). */
export function normalizarDocumento(s: string) {
  return s.replace(/[\s.\-]/g, "").toUpperCase();
}

/** Edad en años cumplidos. Las fechas de nacimiento se guardan como medianoche UTC. */
export function calcularEdad(nacimiento: Date, hoy: Date = new Date()) {
  let edad = hoy.getUTCFullYear() - nacimiento.getUTCFullYear();
  const aunNoCumple =
    hoy.getUTCMonth() < nacimiento.getUTCMonth() ||
    (hoy.getUTCMonth() === nacimiento.getUTCMonth() && hoy.getUTCDate() < nacimiento.getUTCDate());
  if (aunNoCumple) edad--;
  return edad;
}

/** Iniciales (máx. 2) para el avatar de respaldo. */
export const iniciales = (nombre: string) => nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join("");
