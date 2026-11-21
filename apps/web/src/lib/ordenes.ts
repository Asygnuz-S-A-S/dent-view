// Lógica pura de órdenes de remisión.
export const ESTADOS_ORDEN = ["SOLICITADA", "AGENDADA", "TOMADA", "INFORMADA", "ENTREGADA", "CANCELADA"] as const;
export type EstadoOrden = (typeof ESTADOS_ORDEN)[number];

export const ETIQUETA_ESTADO_ORDEN: Record<EstadoOrden, string> = {
  SOLICITADA: "Solicitada",
  AGENDADA: "Agendada",
  TOMADA: "Tomada",
  INFORMADA: "Informada",
  ENTREGADA: "Entregada",
  CANCELADA: "Cancelada",
};

export const VARIANTE_ESTADO_ORDEN: Record<EstadoOrden, "default" | "secondary" | "outline" | "destructive"> = {
  SOLICITADA: "outline",
  AGENDADA: "secondary",
  TOMADA: "secondary",
  INFORMADA: "default",
  ENTREGADA: "default",
  CANCELADA: "destructive",
};

const AVANCE: Partial<Record<EstadoOrden, EstadoOrden>> = {
  SOLICITADA: "AGENDADA",
  AGENDADA: "TOMADA",
  TOMADA: "INFORMADA",
  INFORMADA: "ENTREGADA",
};
const CANCELABLES: EstadoOrden[] = ["SOLICITADA", "AGENDADA", "TOMADA"];

export const siguienteEstado = (e: EstadoOrden) => AVANCE[e] ?? null;

export function transicionValida(de: EstadoOrden, a: EstadoOrden) {
  return a === "CANCELADA" ? CANCELABLES.includes(de) : AVANCE[de] === a;
}

export const numeroOrden = (n: number) => `#${String(n).padStart(4, "0")}`;

/**
 * Interpreta un texto de búsqueda como n.º de orden ("#0028", "28"). Devuelve null si no es un entero
 * que quepa en el INT de la BD: una cédula de 10 dígitos puede superar ese tope y rompería la consulta.
 */
export function numeroDeBusqueda(texto: string): number | null {
  const n = Number(texto.replace("#", ""));
  return Number.isInteger(n) && n > 0 && n <= 2_147_483_647 ? n : null;
}

/** Cuadrantes FDI (permanentes) en el orden de la ficha: 18→11 | 21→28, 48→41 | 31→38. */
export const CUADRANTES_FDI = [
  [18, 17, 16, 15, 14, 13, 12, 11],
  [21, 22, 23, 24, 25, 26, 27, 28],
  [48, 47, 46, 45, 44, 43, 42, 41],
  [31, 32, 33, 34, 35, 36, 37, 38],
].map((c) => c.map(String));

/**
 * Ejecuta `crear` (que debe calcular máx+1 y guardar en una transacción nueva) y reintenta si choca el
 * unique (organizationId, numero) por una creación concurrente (Prisma P2002).
 */
export async function conReintentoNumero<T>(crear: () => Promise<T>, intentos = 5): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await crear();
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002" || i >= intentos) throw e;
    }
  }
}

/** Servicios que se piden por diente (periapicales y parciales). */
export const usaDientes = (s: { categoria: string; nombre: string }) =>
  s.categoria === "ESTUDIO_2D" && /periapical|parcial/i.test(s.nombre);
