// Implementación independiente (sala limpia) a partir de docs/sala-limpia/03-recordatorios-y-seguimiento.md
// Lógica pura del seguimiento de pacientes: vocabularios, normalización del mes, efecto de los intentos y conversión.
import { fechaIso } from "./fechas";


export const MOTIVOS = ["CONTROL", "ENTREGA_PENDIENTE", "ESTUDIO_SIN_TOMAR", "REPETICION", "OTRO"] as const;
export type Motivo = (typeof MOTIVOS)[number];
export const ETIQUETA_MOTIVO: Record<Motivo, string> = {
  CONTROL: "Control imagenológico", ENTREGA_PENDIENTE: "Entrega de resultados pendiente", ESTUDIO_SIN_TOMAR: "Estudio sin tomar",
  REPETICION: "Repetición por calidad técnica", OTRO: "Otro",
};
export const PRIORIDADES = ["ALTA", "NORMAL", "BAJA"] as const;
export const ESTADOS_SEG = ["PENDIENTE", "SIN_RESPUESTA", "AGENDADO", "DECLINO", "COMPLETADO", "CANCELADO"] as const;
export type EstadoSeg = (typeof ESTADOS_SEG)[number];
export const ETIQUETA_ESTADO_SEG: Record<EstadoSeg, string> = {
  PENDIENTE: "Pendiente", SIN_RESPUESTA: "Contactado sin respuesta", AGENDADO: "Contactado y agendado", DECLINO: "Contactado y declinó", COMPLETADO: "Completado", CANCELADO: "Cancelado",
};
export const CANALES_CONTACTO = ["TELEFONO", "WHATSAPP", "SMS", "CORREO"] as const;
export const RESULTADOS = ["SIN_RESPUESTA", "BUZON", "AGENDO", "DECLINO", "NUMERO_EQUIVOCADO"] as const;
export type Resultado = (typeof RESULTADOS)[number];
export const ETIQUETA_RESULTADO: Record<Resultado, string> = { SIN_RESPUESTA: "No contestó", BUZON: "Buzón de voz", AGENDO: "Agendó", DECLINO: "Declinó", NUMERO_EQUIVOCADO: "Número equivocado" };

/** Abiertos admiten operaciones; activos cuentan en la lista y los contadores. */
export const seguimientoAbierto = (e: string) => e !== "COMPLETADO" && e !== "CANCELADO";
export const ESTADOS_ACTIVOS: EstadoSeg[] = ["PENDIENTE", "SIN_RESPUESTA", "AGENDADO"];

/** Primer día del mes (UTC) de una fecha "YYYY-MM-DD" o Date. */
export function primerDiaMes(f: string | Date) {
  const d = typeof f === "string" ? new Date(`${f}T00:00:00Z`) : f;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
export const sumarMeses = (mes: Date, n: number) => new Date(Date.UTC(mes.getUTCFullYear(), mes.getUTCMonth() + n, 1));
/** Línea que se agrega a la nota al aplazar; la fecha es el día en Bogotá (no UTC). */
export const notaAplazamiento = (nota: string | null, ahora: Date, usuario: string, meses: number) =>
  [nota, `${fechaIso(ahora)} ${usuario}: aplazado ${meses} mes(es)`].filter(Boolean).join("\n");
export const mesTexto = (mes: Date) => mes.toLocaleDateString("es-CO", { timeZone: "UTC", month: "long", year: "numeric" });

/** Estado tras un intento de contacto. Sin respuesta/buzón/equivocado solo cambian a un pendiente. */
export function estadoTrasIntento(estado: EstadoSeg, resultado: Resultado): EstadoSeg {
  if (resultado === "AGENDO") return "AGENDADO";
  if (resultado === "DECLINO") return "DECLINO";
  return estado === "PENDIENTE" ? "SIN_RESPUESTA" : estado;
}

/** completados ÷ (completados + cancelados), entre 0 y 1; 0 si no hay ninguno. */
export const tasaConversion = (completados: number, cancelados: number) => (completados + cancelados === 0 ? 0 : completados / (completados + cancelados));

const PESO_PRIORIDAD: Record<string, number> = { ALTA: 0, NORMAL: 1, BAJA: 2 };
/** Orden de trabajo: prioridad, mes objetivo, antigüedad y id para desempate estable. */
export function ordenarLista<T extends { prioridad: string; mesObjetivo: Date; creadoEn: Date; id: string }>(xs: T[]) {
  return [...xs].sort((a, b) =>
    (PESO_PRIORIDAD[a.prioridad] ?? 1) - (PESO_PRIORIDAD[b.prioridad] ?? 1) ||
    a.mesObjetivo.getTime() - b.mesObjetivo.getTime() || a.creadoEn.getTime() - b.creadoEn.getTime() || a.id.localeCompare(b.id));
}
