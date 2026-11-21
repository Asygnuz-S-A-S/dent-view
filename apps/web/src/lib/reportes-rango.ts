// Rango de fechas de los reportes (días calendario en America/Bogota, UTC-5 fijo).
import { esFecha, hoyBogota } from "./agenda";
import { inicioDiaBogota } from "./inicio";

const DIA = 86_400_000;
const MAX_DIAS = 366;

/** Rango [desde, hasta] inclusive. Por defecto el mes actual; si es inválido o invertido se corrige. */
export function rangoReporte(desde?: string, hasta?: string, ahora = new Date()) {
  const hoy = hoyBogota(ahora);
  const d = esFecha(desde) ? desde : `${hoy.slice(0, 8)}01`;
  let h = esFecha(hasta) ? hasta : hoy;
  if (h < d) h = d;
  const ini = inicioDiaBogota(d);
  const maxFin = new Date(ini.getTime() + MAX_DIAS * DIA);
  const fin = new Date(Math.min(inicioDiaBogota(h).getTime() + DIA, maxFin.getTime())); // exclusivo
  return { desde: d, hasta: new Date(fin.getTime() - DIA).toLocaleDateString("en-CA", { timeZone: "America/Bogota" }), ini, fin };
}

/** Claves YYYY-MM-DD de cada día del rango. */
export function diasDelRango(r: { ini: Date; fin: Date }) {
  const n = Math.round((r.fin.getTime() - r.ini.getTime()) / DIA);
  return Array.from({ length: n }, (_, i) => new Date(r.ini.getTime() + i * DIA).toLocaleDateString("en-CA", { timeZone: "America/Bogota" }));
}
