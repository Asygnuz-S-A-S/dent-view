// Cartera: saldos abiertos agrupados por responsable y antigüedad por tramos.
import type { Responsable } from "./facturacion";

export const TRAMOS = ["0–30", "31–60", "61–90", "> 90"] as const;
const DIA = 86_400_000;

/** Días transcurridos desde el vencimiento (o la fecha si no vence); nunca negativo. */
export const diasAntiguedad = (fecha: Date, vence: Date | null, ahora = new Date()) =>
  Math.max(0, Math.floor((ahora.getTime() - (vence ?? fecha).getTime()) / DIA));

/** Índice del tramo (0–30, 31–60, 61–90, >90) para unos días de antigüedad. */
export const tramoDe = (dias: number) => (dias <= 30 ? 0 : dias <= 60 ? 1 : dias <= 90 ? 2 : 3);

export type FilaCartera = {
  id: string;
  fecha: Date;
  vence: Date | null;
  saldo: number;
  responsable: Responsable;
  responsableId: string | null;
  pacienteId: string | null;
  convenio: string | null;
};

export const claveResponsable = (f: Pick<FilaCartera, "responsable" | "responsableId" | "pacienteId" | "convenio">) =>
  f.responsable === "DOCTOR"
    ? `DOCTOR:${f.responsableId}`
    : f.responsable === "CONVENIO"
      ? `CONVENIO:${(f.convenio ?? "").trim().toLowerCase()}`
      : `PACIENTE:${f.pacienteId}`;

/** Agrupa saldos por responsable con totales por tramo; ordena por saldo total descendente. */
export function agruparCartera<T extends FilaCartera>(filas: T[], ahora = new Date()) {
  const grupos = new Map<string, { clave: string; porTramo: number[]; total: number; filas: (T & { dias: number })[] }>();
  for (const f of filas) {
    const clave = claveResponsable(f);
    const g = grupos.get(clave) ?? { clave, porTramo: [0, 0, 0, 0], total: 0, filas: [] };
    const dias = diasAntiguedad(f.fecha, f.vence, ahora);
    g.porTramo[tramoDe(dias)] += f.saldo;
    g.total += f.saldo;
    g.filas.push({ ...f, dias });
    grupos.set(clave, g);
  }
  return [...grupos.values()].sort((a, b) => b.total - a.total);
}
