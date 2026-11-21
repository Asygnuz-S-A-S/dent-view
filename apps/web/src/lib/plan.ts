// Adaptado de OpenDentist (MIT, © 2026 Clawnify) — https://github.com/clawnify/OpenDentist
// Lógica pura del plan de tratamiento y las notas clínicas.
export const ESTADOS_PLAN = ["PLANEADO", "ACEPTADO", "REALIZADO", "RECHAZADO"] as const;
export type EstadoPlan = (typeof ESTADOS_PLAN)[number];
export const ETIQUETA_PLAN: Record<EstadoPlan, string> = { PLANEADO: "Planeado", ACEPTADO: "Aceptado", REALIZADO: "Realizado", RECHAZADO: "Rechazado" };
export const SUPERFICIES = ["M", "D", "O", "V", "L"] as const;

/** Suma de valores por estado (todos los estados presentes, en 0 si no hay ítems). */
export function totalesPorEstado(items: { estado: EstadoPlan; valor: number }[]) {
  const t = Object.fromEntries(ESTADOS_PLAN.map((e) => [e, 0])) as Record<EstadoPlan, number>;
  for (const i of items) t[i.estado] += i.valor;
  return t;
}

const diaBogota = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

/** Una nota solo la edita su autor y únicamente el mismo día (hora de Bogotá) en que se escribió. */
export const puedeEditarNota = (n: { autorId: string | null; creadoEn: Date }, usuarioId: string, ahora = new Date()) =>
  n.autorId === usuarioId && diaBogota(n.creadoEn) === diaBogota(ahora);
