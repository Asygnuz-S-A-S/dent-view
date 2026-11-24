// Motor de secuencias del CRM: reglas puras (sin I/O). La capa de datos vive en crm-motor-datos.ts.
import { coincideFiltro, leerFiltro, type Disparador, type Etapa } from "./crm";

// ---- Zona horaria (Bogotá es UTC−5 fijo, sin horario de verano) ----
const OFFSET_MS = 5 * 3600_000;
const aBogota = (d: Date) => new Date(d.getTime() - OFFSET_MS);
export function partesBogota(d: Date) {
  const l = aBogota(d);
  return { anio: l.getUTCFullYear(), mes: l.getUTCMonth() + 1, dia: l.getUTCDate(), hora: l.getUTCHours(), minuto: l.getUTCMinutes(), diaSemana: l.getUTCDay() };
}
/** Instante UTC de las `hora`:00 de Bogotá del día de `d` + `masDias`. */
const aperturaBogota = (d: Date, hora: number, masDias = 0) => {
  const l = aBogota(d);
  return new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() + masDias, hora) + OFFSET_MS);
};

// ---- Límites de envío ----
export type ConfigEnvio = { desde: number; hasta: number; domingos: boolean; topeDiarioCentro: number; minHorasPorDestinatario: number };
export const CONFIG_ENVIO: ConfigEnvio = { desde: 8, hasta: 19, domingos: false, topeDiarioCentro: 100, minHorasPorDestinatario: 24 };

/** Config desde variables de entorno (CRM_VENTANA_DESDE/HASTA, CRM_ENVIAR_DOMINGOS, CRM_TOPE_DIARIO). CRM_VENTANA_LIBRE=1 solo para pruebas locales. */
export function configEnvioDeEntorno(env: Record<string, string | undefined> = process.env): ConfigEnvio {
  const n = (v: string | undefined, d: number, min: number, max: number) => { const x = Number(v); return v !== undefined && v !== "" && Number.isInteger(x) && x >= min && x <= max ? x : d; };
  const libre = env.CRM_VENTANA_LIBRE === "1";
  return {
    desde: libre ? 0 : n(env.CRM_VENTANA_DESDE, CONFIG_ENVIO.desde, 0, 23),
    hasta: libre ? 24 : n(env.CRM_VENTANA_HASTA, CONFIG_ENVIO.hasta, 1, 24),
    domingos: libre || env.CRM_ENVIAR_DOMINGOS === "1",
    topeDiarioCentro: n(env.CRM_TOPE_DIARIO, CONFIG_ENVIO.topeDiarioCentro, 1, 100_000),
    minHorasPorDestinatario: CONFIG_ENVIO.minHorasPorDestinatario,
  };
}

/** ¿Se puede enviar correo en este instante? (hora local de Bogotá en [desde, hasta); domingo solo si se permite). */
export function enVentana(d: Date, c: ConfigEnvio = CONFIG_ENVIO) {
  const p = partesBogota(d);
  return (c.domingos || p.diaSemana !== 0) && p.hora >= c.desde && p.hora < c.hasta;
}

/** Primer instante a partir de `d` en que se puede enviar (d mismo si ya está en ventana). */
export function siguienteVentana(d: Date, c: ConfigEnvio = CONFIG_ENVIO): Date {
  if (enVentana(d, c)) return d;
  const p = partesBogota(d);
  let dia = p.hora < c.desde ? 0 : 1; // antes de abrir: hoy; después de cerrar: mañana
  while (!c.domingos && partesBogota(aperturaBogota(d, c.desde, dia)).diaSemana === 0) dia++;
  return aperturaBogota(d, c.desde, dia);
}

/** Medianoche (00:00) de Bogotá del día de `d`, como instante UTC. */
export const inicioDiaBogota = (d: Date) => aperturaBogota(d, 0);

// ---- Variables de plantilla ----
export type Variables = { nombre: string; centro: string; enlace: string };
/** Valor seguro para insertar en texto: sin saltos de línea ni caracteres de control, acotado. */
const limpio = (v: string, max = 160) => v.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
/** Una sola pasada: un valor que contenga "{{x}}" no se vuelve a expandir. Variables desconocidas se quitan. Salida en texto plano (renderCorreo escapa el HTML). */
export function renderVariables(texto: string, v: Variables) {
  return texto.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => (k === "nombre" ? limpio(v.nombre) : k === "centro" ? limpio(v.centro) : k === "enlace" ? limpio(v.enlace, 500) : ""));
}
/** Primer nombre para saludar. */
export const primerNombre = (n: string) => n.trim().split(/\s+/)[0] ?? n;

// ---- Decisión de envío de correo (salvaguardas Ley 1581 / anti-spam) ----
export type SujetoContacto = { correo: string | null; noContactar: boolean; consentimientoMercadeo: boolean };
export type EntradaDecision = {
  sujeto: SujetoContacto;
  disparador: Disparador;
  /** Marca de la secuencia (filtro.transaccional); solo se respeta en VALORACION_COMPLETADA. */
  transaccional: boolean;
  ahora: Date;
  config: ConfigEnvio;
  enviadosHoyCentro: number;
  /** Último correo enviado a este destinatario (null si ninguno en la ventana de 24 h). */
  ultimoEnvioDestinatario: Date | null;
};
export type Decision =
  | { accion: "enviar" }
  | { accion: "omitir"; motivo: string; cancelar?: boolean }
  | { accion: "reprogramar"; hasta: Date; motivo: string };

/**
 * Orden: baja (cancela todo) → sin correo → consentimiento (omite el paso) → ventana horaria → tope del centro → 1 correo/24 h por destinatario.
 * Un mensaje transaccional solo se salta el consentimiento de mercadeo: es el seguimiento de un servicio que la propia persona pidió (valoración
 * virtual). Nunca se salta noContactar, la ventana horaria ni los topes, y siempre lleva enlace de baja.
 */
export function decidirCorreo(e: EntradaDecision): Decision {
  if (e.sujeto.noContactar) return { accion: "omitir", motivo: "no_contactar: la persona pidió no ser contactada", cancelar: true };
  if (!e.sujeto.correo) return { accion: "omitir", motivo: "sin_correo: no hay dirección de correo registrada" };
  const transaccional = e.transaccional && e.disparador === "VALORACION_COMPLETADA";
  if (!transaccional && !e.sujeto.consentimientoMercadeo) return { accion: "omitir", motivo: "sin_consentimiento: no hay consentimiento vigente de mercadeo" };
  if (!enVentana(e.ahora, e.config)) return { accion: "reprogramar", hasta: siguienteVentana(e.ahora, e.config), motivo: "fuera de la ventana horaria" };
  if (e.enviadosHoyCentro >= e.config.topeDiarioCentro) return { accion: "reprogramar", hasta: siguienteVentana(aperturaBogota(e.ahora, 0, 1), e.config), motivo: "tope diario del centro alcanzado" };
  if (e.ultimoEnvioDestinatario) {
    const libre = new Date(e.ultimoEnvioDestinatario.getTime() + e.config.minHorasPorDestinatario * 3600_000);
    if (libre > e.ahora) return { accion: "reprogramar", hasta: siguienteVentana(libre, e.config), motivo: "ya recibió un correo en las últimas 24 horas" };
  }
  return { accion: "enviar" };
}

// ---- Avance de pasos ----
export const esperaMs = (p: { esperaDias: number; esperaHoras: number }) => (p.esperaDias * 24 + p.esperaHoras) * 3600_000;
export const proximaEjecucion = (base: Date, p: { esperaDias: number; esperaHoras: number }) => new Date(base.getTime() + esperaMs(p));

// ---- Claves de idempotencia (ver docs/producto/crm-valoraciones-modelo.md) ----
export const claveLead = (leadId: string) => `lead:${leadId}`;
export const clavePacienteValoracion = (pacienteId: string, valoracionId: string) => `pac:${pacienteId}:val:${valoracionId}`;
export const clavePacienteAnio = (pacienteId: string, anio: number) => `pac:${pacienteId}:${anio}`;
export const clavePacienteOrden = (pacienteId: string, ordenId: string) => `pac:${pacienteId}:ord:${ordenId}`;
/** Un cierre de tratamiento = el último ítem del plan: no cambia de mes (la cita atendida cuenta 30 días) y un plan nuevo da otra clave. */
export const clavePacienteTratamiento = (pacienteId: string, ultimoItemId: string) => `pac:${pacienteId}:trat:${ultimoItemId}`;
export const claveManual = (sujeto: string, marca: number) => `man:${sujeto}:${marca}`;

// ---- Cumpleaños ----
/** Las fechas de nacimiento se guardan a medianoche UTC. Un 29 de febrero se celebra el 28 en años no bisiestos. */
export function esCumpleanosHoy(nacimiento: Date, ahora: Date) {
  const h = partesBogota(ahora);
  const bisiesto = (h.anio % 4 === 0 && h.anio % 100 !== 0) || h.anio % 400 === 0;
  let mes = nacimiento.getUTCMonth() + 1, dia = nacimiento.getUTCDate();
  if (mes === 2 && dia === 29 && !bisiesto) dia = 28;
  return mes === h.mes && dia === h.dia;
}

// ---- Cancelación por respuesta / cierre ----
/** Motivo por el que un cambio de etapa del lead cancela una inscripción; null si no la afecta. */
export function motivoCancelacionPorEtapa(disparador: Disparador, nueva: Etapa, anterior?: Etapa): string | null {
  if (nueva === "GANADO") return "ganado";
  if (nueva === "PERDIDO") return "perdido";
  if (disparador === "LEAD_SIN_RESPUESTA" && nueva !== "NUEVO" && anterior !== nueva) return "respondio";
  return null;
}
/** Motivos de fin que cuentan como "respuesta o conversión" en las estadísticas de la secuencia. */
export const MOTIVOS_CONVERSION = ["respondio", "ganado", "convertido"] as const;

// ---- Filtro de elegibilidad ----
export const leadElegible = (filtroRaw: unknown, lead: { origen: string; interes: string | null }) => coincideFiltro(leerFiltro(filtroRaw), lead);
