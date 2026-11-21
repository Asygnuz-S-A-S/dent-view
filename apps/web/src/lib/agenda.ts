// Lógica pura de agenda. Bogotá es UTC−5 fijo (sin horario de verano).
export const INICIO_DIA_MIN = 7 * 60;
export const FIN_DIA_MIN = 19 * 60;
export const PASO_MIN = 15;
export const DURACIONES = [15, 30, 45, 60] as const;
const OFFSET_MS = 5 * 60 * 60 * 1000;

export const ESTADOS_CITA = ["PROGRAMADA", "CONFIRMADA", "LLEGO", "EN_ATENCION", "ATENDIDA", "NO_ASISTIO", "CANCELADA"] as const;
export type EstadoCita = (typeof ESTADOS_CITA)[number];
export const ETIQUETA_ESTADO_CITA: Record<EstadoCita, string> = {
  PROGRAMADA: "Programada",
  CONFIRMADA: "Confirmada",
  LLEGO: "Llegó",
  EN_ATENCION: "En atención",
  ATENDIDA: "Atendida",
  NO_ASISTIO: "No asistió",
  CANCELADA: "Cancelada",
};
/** Clases Tailwind de la tarjeta por estado. */
export const COLOR_ESTADO_CITA: Record<EstadoCita, string> = {
  PROGRAMADA: "border-sky-500 bg-sky-50 text-sky-950 dark:bg-sky-950/60 dark:text-sky-100",
  CONFIRMADA: "border-emerald-500 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/60 dark:text-emerald-100",
  LLEGO: "border-amber-500 bg-amber-50 text-amber-950 dark:bg-amber-950/60 dark:text-amber-100",
  EN_ATENCION: "border-violet-500 bg-violet-50 text-violet-950 dark:bg-violet-950/60 dark:text-violet-100",
  ATENDIDA: "border-zinc-400 bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
  NO_ASISTIO: "border-red-500 bg-red-50 text-red-950 dark:bg-red-950/60 dark:text-red-100",
  CANCELADA: "border-zinc-300 bg-zinc-50 text-zinc-400 line-through dark:bg-zinc-900",
};

/** Paleta de salas (valor guardado en Sala.color → punto de color). */
export const COLORES_SALA: Record<string, string> = {
  teal: "bg-teal-500",
  sky: "bg-sky-500",
  violet: "bg-violet-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  emerald: "bg-emerald-500",
};

export const esFecha = (s: string | undefined | null): s is string =>
  !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** "YYYY-MM-DD" de hoy en Bogotá. */
export const hoyBogota = (ahora = new Date()) => new Date(ahora.getTime() - OFFSET_MS).toISOString().slice(0, 10);

/** Fecha local de Bogotá ("YYYY-MM-DD") + minutos desde las 00:00 → instante UTC. */
export function bogotaAUtc(fecha: string, minutos: number) {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + minutos * 60_000 + OFFSET_MS);
}

/** Instante UTC → { fecha, minutos } en hora local de Bogotá. */
export function utcABogota(d: Date) {
  const l = new Date(d.getTime() - OFFSET_MS);
  return { fecha: l.toISOString().slice(0, 10), minutos: l.getUTCHours() * 60 + l.getUTCMinutes() };
}

export const horaTexto = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

type Rango = { inicio: Date; fin: Date };

/** ¿Se cruza `nuevo` con alguna cita activa (no cancelada / no asistió) de la misma sala? Rangos semiabiertos [inicio, fin). */
export function hayCruce(
  existentes: (Rango & { id?: string; salaId: string; estado?: string })[],
  nuevo: Rango & { salaId: string; id?: string },
) {
  return existentes.some(
    (c) =>
      c.salaId === nuevo.salaId &&
      c.id !== nuevo.id &&
      c.estado !== "CANCELADA" &&
      c.estado !== "NO_ASISTIO" &&
      c.inicio < nuevo.fin &&
      nuevo.inicio < c.fin,
  );
}
