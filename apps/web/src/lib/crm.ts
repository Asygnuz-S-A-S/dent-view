// CRM: constantes, etiquetas y lógica pura (sin I/O) compartida por páginas, acciones y pruebas.
// Los valores de los enums reflejan packages/db/prisma/schema/crm.prisma.

export const ETAPAS = ["NUEVO", "CONTACTADO", "VALORACION_AGENDADA", "VALORACION_REALIZADA", "PROPUESTA", "GANADO", "PERDIDO"] as const;
export type Etapa = (typeof ETAPAS)[number];
export const ETIQUETA_ETAPA: Record<Etapa, string> = {
  NUEVO: "Nuevo", CONTACTADO: "Contactado", VALORACION_AGENDADA: "Valoración agendada", VALORACION_REALIZADA: "Valoración realizada",
  PROPUESTA: "Propuesta", GANADO: "Ganado", PERDIDO: "Perdido",
};
export const ETAPAS_ABIERTAS: readonly Etapa[] = ["NUEVO", "CONTACTADO", "VALORACION_AGENDADA", "VALORACION_REALIZADA", "PROPUESTA"];
export const esEtapa = (v: unknown): v is Etapa => ETAPAS.includes(v as Etapa);
export const esCierre = (e: Etapa) => e === "GANADO" || e === "PERDIDO";

export const ORIGENES = ["WEB", "REFERIDO", "REDES", "LLAMADA", "WHATSAPP", "DOCTOR", "VALORACION_VIRTUAL", "OTRO"] as const;
export type Origen = (typeof ORIGENES)[number];
export const ETIQUETA_ORIGEN: Record<Origen, string> = {
  WEB: "Página web", REFERIDO: "Referido", REDES: "Redes sociales", LLAMADA: "Llamada", WHATSAPP: "WhatsApp", DOCTOR: "Doctor", VALORACION_VIRTUAL: "Valoración virtual", OTRO: "Otro",
};
export const etiquetaOrigen = (o: string) => ETIQUETA_ORIGEN[o as Origen] ?? o;

export const TIPOS_ACTIVIDAD = ["NOTA", "LLAMADA", "CORREO", "WHATSAPP", "VISITA", "CAMBIO_ETAPA", "VALORACION", "AUTOMATICA", "TAREA"] as const;
export type TipoActividad = (typeof TIPOS_ACTIVIDAD)[number];
export const ETIQUETA_ACTIVIDAD: Record<TipoActividad, string> = {
  NOTA: "Nota", LLAMADA: "Llamada", CORREO: "Correo", WHATSAPP: "WhatsApp", VISITA: "Visita", CAMBIO_ETAPA: "Cambio de etapa", VALORACION: "Valoración", AUTOMATICA: "Automática", TAREA: "Tarea",
};
/** Tipos que el equipo registra a mano como "contacto" con el lead (cuentan como primera respuesta). */
export const TIPOS_CONTACTO = ["LLAMADA", "CORREO", "WHATSAPP", "VISITA"] as const;

export const DISPARADORES = ["LEAD_NUEVO", "LEAD_SIN_RESPUESTA", "VALORACION_COMPLETADA", "ORDEN_ENTREGADA", "TRATAMIENTO_TERMINADO", "PACIENTE_INACTIVO", "CUMPLEANOS", "CONTROL_PERIODICO", "MANUAL"] as const;
export type Disparador = (typeof DISPARADORES)[number];
export const INFO_DISPARADOR: Record<Disparador, { texto: string; ayuda: string; umbral?: string }> = {
  LEAD_NUEVO: { texto: "Lead nuevo", ayuda: "Se inscribe cada lead nuevo (creado en los últimos 30 días)." },
  LEAD_SIN_RESPUESTA: { texto: "Lead sin respuesta", ayuda: "Leads que siguen en «Nuevo» pasados N días.", umbral: "Días sin respuesta" },
  VALORACION_COMPLETADA: { texto: "Valoración completada", ayuda: "Cuando el profesional completa una valoración virtual." },
  ORDEN_ENTREGADA: { texto: "Orden entregada", ayuda: "Cuando se entrega el resultado de una orden del paciente." },
  TRATAMIENTO_TERMINADO: { texto: "Tratamiento terminado", ayuda: "Pacientes cuyo plan de tratamiento quedó completamente realizado." },
  PACIENTE_INACTIVO: { texto: "Paciente inactivo", ayuda: "Pacientes sin visita hace N días (requiere fidelización activa).", umbral: "Días sin visita" },
  CUMPLEANOS: { texto: "Cumpleaños", ayuda: "El día del cumpleaños del paciente (requiere fidelización activa)." },
  CONTROL_PERIODICO: { texto: "Control periódico", ayuda: "Cuando al paciente le toca su control (requiere fidelización activa)." },
  MANUAL: { texto: "Manual", ayuda: "Solo se inscribe a quien elijas a mano (ficha del lead o lista de fidelización)." },
};
export const ETIQUETA_DISPARADOR = Object.fromEntries(DISPARADORES.map((d) => [d, INFO_DISPARADOR[d].texto])) as Record<Disparador, string>;
export const esDisparador = (v: unknown): v is Disparador => DISPARADORES.includes(v as Disparador);

export const ACCIONES = ["CORREO", "TAREA", "CAMBIAR_ETAPA", "FINALIZAR"] as const;
export type Accion = (typeof ACCIONES)[number];
export const ETIQUETA_ACCION: Record<Accion, string> = { CORREO: "Enviar correo", TAREA: "Crear tarea", CAMBIAR_ETAPA: "Cambiar etapa", FINALIZAR: "Finalizar" };

export const VARIABLES = ["nombre", "centro", "enlace"] as const;

/** Filtro opcional de una secuencia (se guarda en SecuenciaCRM.filtro). `transaccional` solo se respeta en VALORACION_COMPLETADA (ver crm-motor.ts). */
export type FiltroSecuencia = { origen?: string; interes?: string; enlace?: string; transaccional?: boolean };
export function leerFiltro(raw: unknown): FiltroSecuencia {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const txt = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
  const enlace = txt(r.enlace, 500);
  return { origen: txt(r.origen, 40), interes: txt(r.interes, 80), enlace: enlace && /^https?:\/\/[^\s<>"']+$/i.test(enlace) ? enlace : undefined, transaccional: r.transaccional === true ? true : undefined };
}

/** Un lead cumple el filtro de la secuencia (origen exacto; interés contiene, sin distinguir mayúsculas). */
export function coincideFiltro(f: FiltroSecuencia, lead: { origen: string; interes: string | null }) {
  if (f.origen && lead.origen !== f.origen) return false;
  if (f.interes && !(lead.interes ?? "").toLowerCase().includes(f.interes.toLowerCase())) return false;
  return true;
}

// ---- WhatsApp manual ----
/** Celular colombiano → número internacional para wa.me ("300 123 4567" → "573001234567"); null si no parece un número válido. */
export function numeroWhatsapp(tel: string | null | undefined): string | null {
  const d = (tel ?? "").replace(/\D/g, "");
  if (/^3\d{9}$/.test(d)) return `57${d}`;
  if (/^57[1-9]\d{9}$/.test(d)) return d;
  return /^[1-9]\d{10,14}$/.test(d) ? d : null;
}
export function enlaceWhatsapp(tel: string | null | undefined, mensaje: string) {
  const n = numeroWhatsapp(tel);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(mensaje)}` : null;
}

// ---- Importación CSV ----
export const MAX_FILAS_CSV = 500;
export type FilaLead = { nombre: string; telefono: string | null; correo: string | null; ciudad: string | null; origen: string; interes: string | null };
const CORREO_RE = /^[^\s<>,;"']+@[^\s<>,;"']+\.[^\s<>,;"']+$/;

/** Divide una línea CSV (coma o punto y coma; comillas dobles con "" como escape). */
function celdas(linea: string, sep: string) {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]!;
    if (q) {
      if (c === '"') { if (linea[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

const sinTilde = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const ALIAS: Record<string, keyof FilaLead> = { nombre: "nombre", telefono: "telefono", celular: "telefono", correo: "correo", email: "correo", ciudad: "ciudad", origen: "origen", interes: "interes" };

/** CSV simple con encabezado (nombre, telefono, correo, ciudad, origen, interes). Valida cada fila y topa en MAX_FILAS_CSV. */
export function parsearCsvLeads(texto: string, max = MAX_FILAS_CSV) {
  const lineas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const errores: { fila: number; motivo: string }[] = [];
  const validos: FilaLead[] = [];
  if (lineas.length === 0) return { validos, errores: [{ fila: 0, motivo: "El archivo está vacío" }] };
  const sep = (lineas[0]!.match(/;/g)?.length ?? 0) > (lineas[0]!.match(/,/g)?.length ?? 0) ? ";" : ",";
  const cols = celdas(lineas[0]!, sep).map((h) => ALIAS[sinTilde(h)]);
  if (!cols.includes("nombre")) return { validos, errores: [{ fila: 1, motivo: "Falta la columna «nombre» en el encabezado" }] };
  if (lineas.length - 1 > max) return { validos, errores: [{ fila: 0, motivo: `Máximo ${max} filas por importación (el archivo trae ${lineas.length - 1})` }] };
  const vistos = new Set<string>();
  lineas.slice(1).forEach((l, i) => {
    const fila = i + 2;
    const v = celdas(l, sep);
    const r: Record<string, string> = {};
    cols.forEach((c, j) => { if (c && v[j]) r[c] = v[j]!; });
    if (!r.nombre || r.nombre.length < 2) return errores.push({ fila, motivo: "Falta el nombre" });
    if (r.nombre.length > 120) return errores.push({ fila, motivo: "Nombre demasiado largo" });
    const correo = r.correo?.toLowerCase() ?? null;
    if (correo && !CORREO_RE.test(correo)) return errores.push({ fila, motivo: "Correo inválido" });
    const telefono = r.telefono ? r.telefono.replace(/[^\d+\s()-]/g, "").trim() : null;
    if (r.telefono && (!telefono || telefono.replace(/\D/g, "").length < 7)) return errores.push({ fila, motivo: "Teléfono inválido" });
    if (!telefono && !correo) return errores.push({ fila, motivo: "Se necesita teléfono o correo" });
    const origen = r.origen ? r.origen.toUpperCase().replace(/\s+/g, "_") : "OTRO";
    if (!ORIGENES.includes(origen as Origen)) return errores.push({ fila, motivo: `Origen no válido (${r.origen})` });
    const clave = correo ?? telefono!.replace(/\D/g, "");
    if (vistos.has(clave)) return errores.push({ fila, motivo: "Repetido en el archivo" });
    vistos.add(clave);
    validos.push({ nombre: r.nombre, telefono, correo, ciudad: r.ciudad?.slice(0, 80) ?? null, origen, interes: r.interes?.slice(0, 120) ?? null });
  });
  return { validos, errores };
}

// ---- Indicadores del panel (puros) ----
const IDX_ETAPA = Object.fromEntries(ETAPAS.map((e, i) => [e, i])) as Record<Etapa, number>;

/** Embudo acumulado: cuántos leads llegaron al menos a cada etapa abierta (PERDIDO cuenta solo en el total) y la conversión entre etapas. */
export function embudo(porEtapa: Partial<Record<Etapa, number>>) {
  const n = (e: Etapa) => porEtapa[e] ?? 0;
  const total = ETAPAS.reduce((s, e) => s + n(e), 0);
  const llegaron = ETAPAS_ABIERTAS.map((e) => ETAPAS.filter((x) => x !== "PERDIDO" && IDX_ETAPA[x] >= IDX_ETAPA[e]).reduce((s, x) => s + n(x), 0));
  llegaron[0] = total;
  return ETAPAS_ABIERTAS.map((etapa, i) => ({
    etapa, llegaron: llegaron[i]!,
    conversion: i === 0 || llegaron[i - 1] === 0 ? null : Math.round((llegaron[i]! / llegaron[i - 1]!) * 100),
  }));
}

/** Horas medias entre la creación del lead y su primer contacto; null si ninguno fue contactado. */
export function tiempoMedioRespuestaHoras(pares: { creado: Date; primerContacto: Date }[]) {
  const validos = pares.map((p) => (p.primerContacto.getTime() - p.creado.getTime()) / 3_600_000).filter((h) => h >= 0);
  return validos.length ? validos.reduce((a, b) => a + b, 0) / validos.length : null;
}
export const textoDuracion = (horas: number | null) => (horas === null ? "—" : horas < 1 ? `${Math.max(1, Math.round(horas * 60))} min` : horas < 48 ? `${Math.round(horas * 10) / 10} h` : `${Math.round(horas / 24)} días`);
export const porcentaje = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 1000) / 10);

// ---- Fidelización: segmentos ----
export const SEGMENTOS = ["ACTIVO", "EN_RIESGO", "INACTIVO", "NUEVO", "VIP"] as const;
export type Segmento = (typeof SEGMENTOS)[number];
export const ETIQUETA_SEGMENTO: Record<Segmento, string> = { ACTIVO: "Activos", EN_RIESGO: "En riesgo de abandono", INACTIVO: "Inactivos", NUEVO: "Nuevos", VIP: "VIP" };
export const AYUDA_SEGMENTO: Record<Segmento, string> = {
  ACTIVO: "Con visita en los últimos 90 días.", EN_RIESGO: "Sin visita hace 90 a 180 días: todavía se pueden recuperar.",
  INACTIVO: "Sin visita hace más de 180 días.", NUEVO: "Registrados en los últimos 30 días.", VIP: "Alto gasto o muchas visitas en los últimos 12 meses.",
};
export const UMBRALES_SEGMENTO = { riesgoDias: 90, inactivoDias: 180, nuevoDias: 30, vipGasto: 2_000_000, vipVisitas: 6 } as const;

/** Segmentos a los que pertenece un paciente (puede estar en varios: p. ej. VIP y en riesgo). Sin visita registrada solo cuenta como nuevo. */
export function segmentosDe(p: { ultimaVisitaEn: Date | null; creadoEn: Date; gasto12m: number; visitas12m: number }, ahora: Date, u = UMBRALES_SEGMENTO): Segmento[] {
  const dias = (d: Date) => (ahora.getTime() - d.getTime()) / 86_400_000;
  const s: Segmento[] = [];
  if (dias(p.creadoEn) <= u.nuevoDias) s.push("NUEVO");
  if (p.ultimaVisitaEn) {
    const d = dias(p.ultimaVisitaEn);
    s.push(d < u.riesgoDias ? "ACTIVO" : d < u.inactivoDias ? "EN_RIESGO" : "INACTIVO");
  }
  if (p.gasto12m >= u.vipGasto || p.visitas12m >= u.vipVisitas) s.push("VIP");
  return s;
}

// ---- Plantillas de secuencia predefinidas (se instalan inactivas) ----
export type PasoPlantilla = { esperaDias: number; esperaHoras?: number; accion: Accion; asunto?: string; cuerpo?: string; etapaDestino?: Etapa; tareaTitulo?: string };
export type PlantillaSecuencia = { clave: string; nombre: string; descripcion: string; disparador: Disparador; diasInactividad?: number; filtro?: FiltroSecuencia; pasos: PasoPlantilla[] };

// Sin PHI: ningún texto menciona diagnósticos ni tratamientos concretos; solo {{nombre}}, {{centro}} y {{enlace}}.
export const PLANTILLAS_SECUENCIA: PlantillaSecuencia[] = [
  {
    clave: "lead-nuevo", nombre: "Seguimiento de lead nuevo (1, 3 y 7 días)", disparador: "LEAD_NUEVO",
    descripcion: "Tres correos y una tarea de llamada para no dejar enfriar a un interesado. Se detiene solo cuando el lead avanza de etapa.",
    pasos: [
      { esperaDias: 1, accion: "CORREO", asunto: "Gracias por escribirnos, {{nombre}}", cuerpo: "Hola, {{nombre}}:\n\nGracias por tu interés en {{centro}}. Con gusto resolvemos tus dudas y te ayudamos a agendar una primera cita.\n\nResponde este correo o llámanos cuando te quede cómodo." },
      { esperaDias: 2, accion: "TAREA", tareaTitulo: "Llamar al lead (seguimiento de 3 días)" },
      { esperaDias: 0, accion: "CORREO", asunto: "{{nombre}}, ¿pudimos ayudarte?", cuerpo: "Hola, {{nombre}}:\n\nEn {{centro}} seguimos atentos a tu solicitud. Si aún quieres agendar, responde este correo y te proponemos horarios." },
      { esperaDias: 4, accion: "CORREO", asunto: "Última nota de {{centro}}", cuerpo: "Hola, {{nombre}}:\n\nNo queremos insistir: si todavía te interesa una cita en {{centro}}, aquí estaremos. Cuando quieras, escríbenos." },
    ],
  },
  {
    clave: "valoracion-sin-respuesta", nombre: "Valoración completada sin respuesta", disparador: "VALORACION_COMPLETADA", filtro: { transaccional: true },
    descripcion: "Después de una valoración solicitada por la propia persona: recordatorio a los 3 días y tarea de llamada a los 7. Mensaje de servicio (ver nota de consentimiento).",
    pasos: [
      { esperaDias: 3, accion: "CORREO", asunto: "{{nombre}}, tu valoración está lista en {{centro}}", cuerpo: "Hola, {{nombre}}:\n\nHace unos días recibiste la respuesta a tu valoración en {{centro}}. Si tienes preguntas o quieres dar el siguiente paso, responde este correo y te ayudamos a agendar." },
      { esperaDias: 4, accion: "TAREA", tareaTitulo: "Llamar: valoración completada sin respuesta" },
    ],
  },
  {
    clave: "post-tratamiento", nombre: "Post-tratamiento (1, 7 y 30 días)", disparador: "TRATAMIENTO_TERMINADO",
    descripcion: "Cuida al paciente tras terminar su tratamiento y, al mes, pide una reseña (agrega tu enlace de reseña en el campo «Enlace» de la secuencia).",
    pasos: [
      { esperaDias: 1, accion: "CORREO", asunto: "¿Cómo te sientes, {{nombre}}?", cuerpo: "Hola, {{nombre}}:\n\nEn {{centro}} queremos saber cómo te has sentido. Si tienes alguna duda o molestia, responde este correo y te contactamos." },
      { esperaDias: 6, accion: "CORREO", asunto: "Seguimos pendientes de ti, {{nombre}}", cuerpo: "Hola, {{nombre}}:\n\nHan pasado unos días desde tu atención en {{centro}}. Recuerda que estamos para ayudarte con cualquier inquietud." },
      { esperaDias: 23, accion: "CORREO", asunto: "{{nombre}}, tu opinión nos ayuda", cuerpo: "Hola, {{nombre}}:\n\nGracias por confiar en {{centro}}. Si tuviste una buena experiencia, nos ayudaría mucho que la compartieras:\n{{enlace}}" },
    ],
  },
  {
    clave: "reactivacion", nombre: "Reactivación de paciente inactivo (180 días)", disparador: "PACIENTE_INACTIVO", diasInactividad: 180,
    descripcion: "Invita a volver a quien no nos visita hace 180 días, con una tarea de llamada si no responde.",
    pasos: [
      { esperaDias: 0, accion: "CORREO", asunto: "{{nombre}}, te extrañamos en {{centro}}", cuerpo: "Hola, {{nombre}}:\n\nHace tiempo no nos visitas en {{centro}}. Si quieres agendar una cita de control, responde este correo y buscamos un horario para ti." },
      { esperaDias: 14, accion: "TAREA", tareaTitulo: "Llamar a paciente inactivo para invitarlo a control" },
    ],
  },
  {
    clave: "control-periodico", nombre: "Control periódico", disparador: "CONTROL_PERIODICO",
    descripcion: "Recordatorio cuando al paciente le toca su control (según los días configurados en Fidelización).",
    pasos: [{ esperaDias: 0, accion: "CORREO", asunto: "{{nombre}}, es momento de tu control", cuerpo: "Hola, {{nombre}}:\n\nEn {{centro}} te recordamos que es buen momento para tu control periódico. Responde este correo para agendarlo." }],
  },
  {
    clave: "cumpleanos", nombre: "Felicitación de cumpleaños", disparador: "CUMPLEANOS",
    descripcion: "Un correo de felicitación el día del cumpleaños (requiere fidelización activa).",
    pasos: [{ esperaDias: 0, accion: "CORREO", asunto: "¡Feliz cumpleaños, {{nombre}}!", cuerpo: "Hola, {{nombre}}:\n\nTodo el equipo de {{centro}} te desea un feliz cumpleaños. ¡Que tengas un gran día!" }],
  },
];
