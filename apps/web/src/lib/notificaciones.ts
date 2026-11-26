// Implementación independiente (sala limpia) a partir de docs/sala-limpia/04-notificaciones.md
// Lógica pura de notificaciones: decisión previa al envío, reintentos y plantillas.

export const CANALES = ["CORREO", "SMS", "WHATSAPP"] as const;
export type Canal = (typeof CANALES)[number];
export const TIPOS_MENSAJE = ["CITA_CREADA", "CITA_RECORDATORIO", "INFORME_PACIENTE", "INFORME_REMITENTE", "SEGUIMIENTO", "ENTREGA_ENLACE", "ENTREGA_CODIGO", "ESTUDIO_ENLACE", "ESTUDIO_CODIGO", "VALORACION_ENLACE", "VALORACION_CODIGO", "VALORACION_RESULTADO", "VALORACION_AVISO", "PRESUPUESTO_ENLACE", "PRESUPUESTO_CODIGO", "PRESUPUESTO_RESPUESTA", "VINCULO_SOLICITADO", "REMISION_RECIBIDA", "REMISION_RESPONDIDA"] as const;
/** Mensajes con credenciales de acceso: una vez enviados no se conserva su contenido. */
export const TIPOS_SENSIBLES: readonly string[] = ["ENTREGA_ENLACE", "ENTREGA_CODIGO", "ESTUDIO_ENLACE", "ESTUDIO_CODIGO", "VALORACION_ENLACE", "VALORACION_CODIGO", "VALORACION_RESULTADO", "PRESUPUESTO_ENLACE", "PRESUPUESTO_CODIGO"];
export type TipoMensaje = (typeof TIPOS_MENSAJE)[number];
export const ETIQUETA_TIPO_MENSAJE: Record<TipoMensaje, string> = {
  CITA_CREADA: "Cita agendada", CITA_RECORDATORIO: "Recordatorio de cita", INFORME_PACIENTE: "Informe listo (paciente)",
  INFORME_REMITENTE: "Informe listo (doctor remitente)", SEGUIMIENTO: "Seguimiento",
  ENTREGA_ENLACE: "Entrega de resultados (enlace)", ENTREGA_CODIGO: "Entrega de resultados (código)",
  ESTUDIO_ENLACE: "Estudio compartido (enlace)", ESTUDIO_CODIGO: "Estudio compartido (código)",
  VALORACION_ENLACE: "Valoración virtual (enlace)", VALORACION_CODIGO: "Valoración virtual (código)",
  VALORACION_RESULTADO: "Valoración virtual (resultado)", VALORACION_AVISO: "Valoración virtual (aviso al odontólogo)",
  PRESUPUESTO_ENLACE: "Cotización virtual (enlace)", PRESUPUESTO_CODIGO: "Cotización virtual (código)", PRESUPUESTO_RESPUESTA: "Cotización virtual (aviso al centro)",
  VINCULO_SOLICITADO: "Remisiones (solicitud de vínculo)", REMISION_RECIBIDA: "Remisiones (remisión recibida)", REMISION_RESPONDIDA: "Remisiones (respuesta del centro)",
};

export type Preferencia = { noContactar: boolean; correo: boolean; sms: boolean; whatsapp: boolean; tiposRechazados: string[] } | null;
export type Decision = { ok: true; canal: Canal; destinatario: string } | { ok: false; motivo: string };

/**
 * Decide si y por dónde se envía. La primera regla que bloquea gana; "no contactar" y el rechazo por tipo o canal
 * son absolutos (también con envío forzado). Se usa un único canal: el primer viable de `canales`.
 * `direccion` (p. ej. el correo del doctor remitente) reemplaza los datos de contacto del paciente en el correo.
 */
export function decidirEnvio(e: {
  tipo: string; pref: Preferencia; contacto: { correo?: string | null; celular?: string | null };
  canales?: readonly Canal[]; direccion?: string | null; /** el destinatario no es el paciente (p. ej. doctor): no aplican sus preferencias de canal */ ajeno?: boolean;
}): Decision {
  const pref = e.ajeno ? null : e.pref;
  if (pref?.noContactar) return { ok: false, motivo: "El paciente pidió no ser contactado" };
  if (pref?.tiposRechazados.includes(e.tipo)) return { ok: false, motivo: "El paciente rechazó este tipo de mensaje" };
  for (const canal of e.canales ?? ["CORREO"]) {
    if (canal === "CORREO") {
      const to = e.direccion ?? e.contacto.correo;
      if (to && pref?.correo !== false) return { ok: true, canal, destinatario: to };
    } else {
      const ok = canal === "SMS" ? pref?.sms !== false : pref?.whatsapp !== false;
      if (e.contacto.celular && ok) return { ok: true, canal, destinatario: e.contacto.celular };
    }
  }
  return { ok: false, motivo: "Sin canal viable (falta dato de contacto o el paciente lo desactivó)" };
}

/** Espera exponencial: 1, 2, 4, 8… minutos con tope de 60. `intentos` = envíos ya realizados. */
export const esperaMinutos = (intentos: number) => Math.min(60, 2 ** Math.max(0, intentos - 1));

/** Reemplaza {{variable}}; una variable ausente queda vacía (nunca rompe). */
export const renderPlantilla = (t: string, vars: Record<string, string | number | null | undefined>) =>
  t.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => String(vars[k] ?? ""));

export const escaparHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Regla de tono (es-CO): todo correo tutea ("tu", "te", imperativos en "tú"). Prohibido "usted/ustedes" y los posesivos "su/sus"
 * (salvo "su destinatario" en el pie legal, que no es una plantilla). Los asuntos nunca llevan el nombre del paciente ni datos clínicos.
 */
export const TONO_FORMAL_PROHIBIDO = /\b(usted(es)?|su|sus|le|les|lleve|retire|avise|solicite|consúltelo|úselo|ábralo|ábralos|llámenos)\b/i;

/** Plantillas por defecto (el centro puede sobrescribirlas). Nunca incluyen texto clínico libre. */
export const PLANTILLAS_DEFECTO: Record<TipoMensaje, { asunto: string; cuerpo: string }> = {
  CITA_CREADA: {
    asunto: "Tu cita en {{centro}} quedó agendada",
    cuerpo: "Hola {{paciente}}, tu cita en {{centro}} es el {{fecha}} a las {{hora}}.\nLleva la orden de tu doctor remitente, retira los objetos metálicos y avísanos si hay posibilidad de embarazo.\nDirección: {{direccion}}. Teléfono: {{telefono}}.",
  },
  CITA_RECORDATORIO: {
    asunto: "Recordatorio de tu cita en {{centro}}",
    cuerpo: "Hola {{paciente}}, te recordamos tu cita en {{centro}} el {{fecha}} a las {{hora}}.\nRetira los objetos metálicos antes del estudio y avísanos si hay posibilidad de embarazo.\nDirección: {{direccion}}. Teléfono: {{telefono}}.",
  },
  INFORME_PACIENTE: {
    asunto: "Tu informe está listo",
    cuerpo: "Hola {{paciente}}, el informe de tu estudio en {{centro}} (orden {{orden}}) ya está listo. Por seguridad no lo enviamos por correo: pide a {{centro}} el enlace de acceso a tus resultados.",
  },
  INFORME_REMITENTE: {
    asunto: "Informe listo: orden {{orden}}",
    cuerpo: "Doctor(a) {{medico}}, {{centro}} emitió el informe de la orden {{orden}}. Por seguridad el correo no lleva datos del paciente ni archivos: consúltalo con tu cuenta en {{enlace}}.",
  },
  SEGUIMIENTO: {
    asunto: "{{centro}}: es momento de tu control",
    cuerpo: "Hola {{paciente}}, en {{centro}} te recordamos que ({{motivo}}) está pendiente para {{mes}}. Llámanos al {{telefono}} para agendar.",
  },
  ENTREGA_ENLACE: {
    asunto: "Resultados disponibles en {{centro}}",
    cuerpo: "Hola {{destinatario}}, {{centro}} te comparte los resultados del estudio de {{paciente}}.\nÁbrelos en: {{enlace}}\nEl código de acceso te llega en un mensaje aparte. El enlace vence el {{vence}}.",
  },
  // Sin datos del paciente en el cuerpo (Ley 1581): solo el aviso y el enlace.
  ESTUDIO_ENLACE: {
    asunto: "{{centro}} te comparte un estudio",
    cuerpo: "Hola {{destinatario}}, tienes un estudio disponible de {{centro}}.\nÁbrelo en: {{enlace}}\nEl código de acceso te llega en un mensaje aparte. El enlace vence el {{vence}}.",
  },
  ESTUDIO_CODIGO: {
    asunto: "Código de acceso al estudio de {{centro}}",
    cuerpo: "Tu código de acceso al estudio es {{codigo}}. Úsalo en el enlace que recibiste por separado; no lo compartas.",
  },
  // Valoración virtual: sin nombre ni datos clínicos (Ley 1581); solo el aviso y el enlace.
  VALORACION_ENLACE: {
    asunto: "{{centro}}: completa tu valoración",
    cuerpo: "Hola, {{centro}} te invita a completar tu valoración virtual: subir fotos y un video corto desde tu celular.\nÁbrela en: {{enlace}}\nEl código de acceso te llega en un mensaje aparte. El enlace vence el {{vence}}.",
  },
  VALORACION_CODIGO: {
    asunto: "Código de acceso a tu valoración en {{centro}}",
    cuerpo: "Tu código de acceso es {{codigo}}. Úsalo en el enlace que recibiste por separado; no lo compartas.",
  },
  VALORACION_RESULTADO: {
    asunto: "{{centro}}: tu valoración está lista",
    cuerpo: "Hola, {{centro}} ya tiene lista tu valoración virtual.\nConsúltala en: {{enlace}}\nEl código de acceso te llega en un mensaje aparte. El enlace vence el {{vence}}.",
  },
  VALORACION_AVISO: {
    asunto: "Tienes una valoración virtual por revisar",
    cuerpo: "Llegó una valoración virtual para revisar en {{centro}}.\nÁbrela en: {{enlace}}",
  },
  // Cotización virtual: sin nombre del paciente, ítems ni valores (Ley 1581); solo el aviso y el enlace.
  PRESUPUESTO_ENLACE: {
    asunto: "{{centro}}: tu cotización está lista",
    cuerpo: "Hola, {{centro}} te comparte tu cotización.\nÁbrela en: {{enlace}}\nEl código de acceso te llega en un mensaje aparte. El enlace vence el {{vence}}.",
  },
  PRESUPUESTO_CODIGO: {
    asunto: "Código de acceso a tu cotización de {{centro}}",
    cuerpo: "Tu código de acceso es {{codigo}}. Úsalo en el enlace que recibiste por separado; no lo compartas.",
  },
  PRESUPUESTO_RESPUESTA: {
    asunto: "Novedad en la cotización {{numero}}",
    cuerpo: "En {{centro}} hay una novedad en la cotización {{numero}}: {{novedad}}.\nRevísala en: {{enlace}}",
  },
  // Remisiones entre centros: sin datos del paciente (Ley 1581); solo el aviso y el enlace.
  VINCULO_SOLICITADO: {
    asunto: "{{centro}} quiere vincularse contigo",
    cuerpo: "{{centro}} pidió vincularse con tu centro para enviarse remisiones.\nRevisa la solicitud en: {{enlace}}",
  },
  REMISION_RECIBIDA: {
    asunto: "Tienes una remisión nueva de {{centro}}",
    cuerpo: "{{centro}} te envió una remisión.\nÁbrela en: {{enlace}}",
  },
  REMISION_RESPONDIDA: {
    asunto: "{{centro}} respondió tu remisión",
    cuerpo: "{{centro}} actualizó una remisión que enviaste.\nConsúltala en: {{enlace}}",
  },
  ENTREGA_CODIGO: {
    asunto: "Código de acceso a los resultados de {{centro}}",
    cuerpo: "Tu código de acceso a los resultados del estudio de {{paciente}} es {{codigo}}. Úsalo en el enlace que recibiste por separado; no lo compartas.",
  },
};
