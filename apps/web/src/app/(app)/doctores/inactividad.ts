export const DIAS_INACTIVIDAD = 60;

/**
 * Inactivo si pasaron más de 60 días desde su última remisión. Sin remisiones cuenta
 * desde que entró al centro, para no marcar como inactivo a un doctor recién agregado.
 */
export function estaInactivo(ultimaRemision: Date | null, miembroDesde: Date, hoy: Date = new Date()) {
  const referencia = ultimaRemision && ultimaRemision > miembroDesde ? ultimaRemision : miembroDesde;
  return hoy.getTime() - referencia.getTime() > DIAS_INACTIVIDAD * 86_400_000;
}

/** Inicio del mes en Bogotá (UTC-5 todo el año): las 05:00 UTC del día 1. */
export function inicioMesBogota(hoy: Date = new Date()) {
  const b = new Date(hoy.getTime() - 5 * 3600_000);
  return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 1, 5));
}
