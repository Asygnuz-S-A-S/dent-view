// Lógica pura de pacientes (sin I/O) para poder probarla.
import { z } from "zod";

export const TIPOS_DOCUMENTO = ["CC", "TI", "CE", "PA", "RC"] as const;

export const esquemaTipoDocumento = z.enum(TIPOS_DOCUMENTO);
// Solo letras, números, guion, punto (y espacio entre grupos); se guarda en mayúsculas y sin separadores, de 3 a 20 caracteres.
export const esquemaNumeroDocumento = z.string()
  .regex(/^[A-Za-z0-9.\- ]*$/, "El documento solo admite letras, números, guion y punto")
  .transform(normalizarDocumento)
  .pipe(z.string().min(3, "El documento debe tener entre 3 y 20 caracteres").max(20, "El documento debe tener entre 3 y 20 caracteres"));

export const CONDICIONES = ["caries", "restauracion", "corona", "endodoncia", "implante", "ausente"] as const;
export type Condicion = (typeof CONDICIONES)[number];

/** Documento comparable: sin espacios, puntos ni guiones, en mayúsculas ("1.053-123 456" → "1053123456"). */
export function normalizarDocumento(s: string) {
  return s.replace(/[\s.\-]/g, "").toUpperCase();
}

/** Documento para buscar con `contains`: solo letras y dígitos (Prisma no escapa los comodines % y _ del texto). */
export const documentoDeBusqueda = (s: string) => normalizarDocumento(s).replace(/[^A-Z0-9]/g, "");

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
