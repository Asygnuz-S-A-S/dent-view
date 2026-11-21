// Fechas del tablero en America/Bogota (UTC-5 fijo, sin horario de verano).
const claveDia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" });

export const diaBogota = (d: Date) => claveDia.format(d); // YYYY-MM-DD
export const inicioDiaBogota = (clave: string) => new Date(`${clave}T00:00:00-05:00`);

/** Conteo por día de los últimos `dias` días (incluye hoy), con ceros donde no hubo registros. */
export function serieDiaria(fechas: Date[], dias: number, hoy = new Date()) {
  const conteo = new Map<string, number>();
  for (const f of fechas) conteo.set(diaBogota(f), (conteo.get(diaBogota(f)) ?? 0) + 1);
  return Array.from({ length: dias }, (_, i) => {
    const dia = diaBogota(new Date(hoy.getTime() - (dias - 1 - i) * 86_400_000));
    return { dia, total: conteo.get(dia) ?? 0 };
  });
}
