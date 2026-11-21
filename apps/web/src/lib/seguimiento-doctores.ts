// Seguimiento de doctores remitentes: cálculo puro (sin base de datos) del semáforo comercial. Fechas en America/Bogota.
import { fechaIso } from "./fechas";

export const SEMAFOROS = ["ACTIVO", "EN_RIESGO", "INACTIVO", "CRITICO", "NUEVO"] as const;
export type Semaforo = (typeof SEMAFOROS)[number];
export const ETIQUETA_SEMAFORO: Record<Semaforo, string> = {
  ACTIVO: "Activo", EN_RIESGO: "En riesgo", INACTIVO: "Inactivo", CRITICO: "Crítico", NUEVO: "Nuevo",
};
export const VARIANTE_SEMAFORO: Record<Semaforo, "success" | "warning" | "danger" | "info" | "secondary"> = {
  ACTIVO: "success", EN_RIESGO: "warning", INACTIVO: "danger", CRITICO: "danger", NUEVO: "info",
};

export const ESTADOS_SEG_DOCTOR = ["PENDIENTE", "CONTACTADO", "PROGRAMADO", "RECUPERADO", "DESCARTADO"] as const;
export type EstadoSegDoctor = (typeof ESTADOS_SEG_DOCTOR)[number];
export const ETIQUETA_ESTADO_SEG_DOCTOR: Record<EstadoSegDoctor, string> = {
  PENDIENTE: "Pendiente", CONTACTADO: "Contactado", PROGRAMADO: "Programado", RECUPERADO: "Recuperado", DESCARTADO: "Descartado",
};
export const ESTADOS_ABIERTOS: readonly EstadoSegDoctor[] = ["PENDIENTE", "CONTACTADO", "PROGRAMADO"];
export const MOTIVOS_SEG_DOCTOR = ["SIN_REMISIONES", "CAIDA_FRECUENCIA", "NUEVO", "OTRO"] as const;
export type MotivoSegDoctor = (typeof MOTIVOS_SEG_DOCTOR)[number];
export const ETIQUETA_MOTIVO_SEG_DOCTOR: Record<MotivoSegDoctor, string> = {
  SIN_REMISIONES: "Dejó de remitir", CAIDA_FRECUENCIA: "Cayó la frecuencia", NUEVO: "Doctor nuevo", OTRO: "Otro",
};
export const CANALES_DOCTOR = ["LLAMADA", "VISITA", "CORREO", "WHATSAPP"] as const;
export const ETIQUETA_CANAL_DOCTOR: Record<(typeof CANALES_DOCTOR)[number], string> = {
  LLAMADA: "Llamada", VISITA: "Visita", CORREO: "Correo", WHATSAPP: "WhatsApp",
};

export type Umbrales = { umbralRiesgoFactor: number; diasInactivo: number; diasInactivoCritico: number };
export const UMBRALES_POR_DEFECTO: Umbrales = { umbralRiesgoFactor: 2, diasInactivo: 60, diasInactivoCritico: 90 };
/** Mínimo de días sin enviar para hablar de riesgo, aunque el doctor remita muy seguido. */
export const MIN_DIAS_RIESGO = 21;
/** Con menos remisiones no hay ritmo confiable: el doctor es NUEVO. */
export const MIN_REMISIONES_RITMO = 3;

const DIA = 86_400_000;
/** Número de día calendario (Bogotá) de un instante, para restar fechas sin errores por horas. */
const numeroDia = (d: Date) => Date.parse(`${fechaIso(d)}T00:00:00Z`) / DIA;
export const diasEntre = (desde: Date, hasta: Date) => numeroDia(hasta) - numeroDia(desde);

/** Clave "YYYY-MM" del mes calendario en Bogotá. */
export const claveMes = (d: Date) => fechaIso(d).slice(0, 7);

/** Las `n` claves de mes que terminan en el mes de `ahora` (la más antigua primero). */
export function ultimosMeses(ahora: Date, n = 12) {
  const [a, m] = claveMes(ahora).split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 - (n - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export function mediana(xs: number[]) {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export type Tendencia = "SUBE" | "BAJA" | "ESTABLE";

export type ResumenDoctor = {
  totalRemisiones: number;
  ultimaRemision: Date | null;
  diasSinEnviar: number | null;
  porMes: { mes: string; n: number }[];
  remisiones12m: number;
  promedioMensual: number;
  tendencia: Tendencia;
  intervaloHabitual: number | null;
  semaforo: Semaforo;
};

/** Semáforo y métricas de un doctor a partir de las fechas de sus remisiones (órdenes/estudios no cancelados). */
export function calcularDoctor(remisiones: Date[], ahora: Date, umbrales: Umbrales = UMBRALES_POR_DEFECTO): ResumenDoctor {
  const orden = [...remisiones].sort((a, b) => a.getTime() - b.getTime());
  const ultimaRemision = orden.at(-1) ?? null;
  const diasSinEnviar = ultimaRemision ? Math.max(0, diasEntre(ultimaRemision, ahora)) : null;

  const meses = ultimosMeses(ahora);
  const conteo = new Map(meses.map((m) => [m, 0]));
  for (const r of orden) { const k = claveMes(r); if (conteo.has(k)) conteo.set(k, conteo.get(k)! + 1); }
  const porMes = meses.map((mes) => ({ mes, n: conteo.get(mes)! }));
  const remisiones12m = porMes.reduce((s, x) => s + x.n, 0);
  const suma = (xs: { n: number }[]) => xs.reduce((s, x) => s + x.n, 0);
  const reciente = suma(porMes.slice(-3)), previo = suma(porMes.slice(-6, -3));
  const tendencia: Tendencia = reciente > previo * 1.2 ? "SUBE" : reciente < previo * 0.8 ? "BAJA" : "ESTABLE";

  // Intervalo habitual: mediana de los días entre remisiones consecutivas de días distintos.
  const intervalos = orden.slice(1).map((r, i) => diasEntre(orden[i], r)).filter((d) => d > 0);
  const intervaloHabitual = mediana(intervalos);

  let semaforo: Semaforo;
  if (diasSinEnviar === null) semaforo = "NUEVO";
  else if (diasSinEnviar >= umbrales.diasInactivoCritico) semaforo = "CRITICO";
  else if (diasSinEnviar >= umbrales.diasInactivo) semaforo = "INACTIVO";
  else if (orden.length < MIN_REMISIONES_RITMO) semaforo = "NUEVO";
  else if (diasSinEnviar > Math.max(MIN_DIAS_RIESGO, umbrales.umbralRiesgoFactor * (intervaloHabitual ?? 0))) semaforo = "EN_RIESGO";
  else semaforo = "ACTIVO";

  return { totalRemisiones: orden.length, ultimaRemision, diasSinEnviar, porMes, remisiones12m, promedioMensual: remisiones12m / 12, tendencia, intervaloHabitual, semaforo };
}

/** Semáforos que ameritan gestión comercial (y suman a "ingresos en riesgo"). */
export const requiereGestion = (s: Semaforo) => s === "EN_RIESGO" || s === "INACTIVO" || s === "CRITICO";

export const motivoParaSemaforo = (s: Semaforo): MotivoSegDoctor => (s === "EN_RIESGO" ? "CAIDA_FRECUENCIA" : "SIN_REMISIONES");

/** Valida los umbrales editados por el admin; devuelve el mensaje de error o null. */
export function validarUmbrales(u: Umbrales) {
  if (!(u.umbralRiesgoFactor >= 1 && u.umbralRiesgoFactor <= 10)) return "El factor de riesgo debe estar entre 1 y 10";
  if (!Number.isInteger(u.diasInactivo) || u.diasInactivo < 7 || u.diasInactivo > 365) return "Los días de inactividad deben estar entre 7 y 365";
  if (!Number.isInteger(u.diasInactivoCritico) || u.diasInactivoCritico <= u.diasInactivo || u.diasInactivoCritico > 730) return "Los días críticos deben ser mayores que los de inactividad (máx. 730)";
  return null;
}

const PESO: Record<Semaforo, number> = { CRITICO: 0, INACTIVO: 1, EN_RIESGO: 2, NUEVO: 3, ACTIVO: 4 };
export const ORDENES_LISTA = ["riesgo", "ultima", "ingresos", "nombre"] as const;
export type OrdenLista = (typeof ORDENES_LISTA)[number];
type Fila = { nombre: string; semaforo: Semaforo; diasSinEnviar: number | null; ingresos12m: number };
/** Orden de la lista: por riesgo (más urgente primero), última remisión (más antigua primero), ingresos o nombre. */
export function ordenarDoctores<T extends Fila>(xs: T[], por: OrdenLista = "riesgo") {
  const cmp: Record<OrdenLista, (a: T, b: T) => number> = {
    riesgo: (a, b) => PESO[a.semaforo] - PESO[b.semaforo] || b.ingresos12m - a.ingresos12m,
    ultima: (a, b) => (b.diasSinEnviar ?? Infinity) - (a.diasSinEnviar ?? Infinity),
    ingresos: (a, b) => b.ingresos12m - a.ingresos12m,
    nombre: (a, b) => a.nombre.localeCompare(b.nombre, "es"),
  };
  return [...xs].sort((a, b) => cmp[por](a, b) || a.nombre.localeCompare(b.nombre, "es"));
}
