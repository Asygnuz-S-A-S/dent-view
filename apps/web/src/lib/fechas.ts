// Utilidades de fecha únicas (español de Colombia, zona America/Bogota). No formatees fechas a mano en las pantallas.
const ZONA = "America/Bogota";
const dos = (n: number) => String(n).padStart(2, "0");
const norm = (s: string) => s.replace(/[  ]/g, " ");
const f = (o: Intl.DateTimeFormatOptions, zona = ZONA) => new Intl.DateTimeFormat("es-CO", { timeZone: zona, ...o });

const corta = f({ day: "2-digit", month: "2-digit", year: "numeric" });
const hora = f({ hour: "numeric", minute: "2-digit", hour12: true });
const completa = f({ day: "2-digit", month: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
const diaCorto = f({ weekday: "short", day: "numeric", month: "short" });
const larga = f({ weekday: "long", day: "numeric", month: "long", year: "numeric" });
const mesAnio = f({ month: "long", year: "numeric" });

/** "20/11/2026". `utc: true` para fechas sin hora (p. ej. fecha de nacimiento) guardadas a medianoche UTC. */
export const fechaCorta = (d: Date | null | undefined, utc = false) =>
  d ? (utc ? f({ day: "2-digit", month: "2-digit", year: "numeric" }, "UTC").format(d) : corta.format(d)) : "—";

/** "vie, 20 nov., 10:00 a. m." */
export const fechaHora = (d: Date | null | undefined) =>
  d ? norm(`${diaCorto.format(d)}, ${hora.format(d)}`) : "—";

/** "20/11/2026, 10:00 a. m." (registros e historiales). */
export const fechaHoraCompleta = (d: Date | null | undefined) => (d ? norm(completa.format(d)) : "—");

/** "viernes 20 de noviembre de 2026" (todo en minúscula, como se escribe en español). */
export const fechaLarga = (d: Date | null | undefined) => (d ? norm(larga.format(d)).replace(",", "") : "—");

/** "noviembre de 2026" */
export const mesAnioTexto = (d: Date) => mesAnio.format(d);

/** "YYYY-MM-DD" en hora de Bogotá (para inputs de fecha y claves de día). */
export function fechaIso(d: Date) {
  const l = new Date(d.getTime() - 5 * 3600_000); // Bogotá es UTC−5 fijo
  return `${l.getUTCFullYear()}-${dos(l.getUTCMonth() + 1)}-${dos(l.getUTCDate())}`;
}

/** Texto largo de una fecha "YYYY-MM-DD" (la usada por la agenda). */
export const fechaLargaDeIso = (iso: string) => fechaLarga(new Date(`${iso}T12:00:00-05:00`));
