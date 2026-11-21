// Implementación independiente (sala limpia) a partir de docs/sala-limpia/04-notificaciones.md
// Lógica pura de notificaciones: decisión previa al envío, reintentos y plantillas.

export const CANALES = ["CORREO", "SMS", "WHATSAPP"] as const;
export type Canal = (typeof CANALES)[number];
export const TIPOS_MENSAJE = ["CITA_CREADA", "CITA_RECORDATORIO", "INFORME_PACIENTE", "INFORME_REMITENTE", "SEGUIMIENTO", "ENTREGA_ENLACE", "ENTREGA_CODIGO", "ESTUDIO_ENLACE", "ESTUDIO_CODIGO"] as const;
/** Mensajes con credenciales de acceso: una vez enviados no se conserva su contenido. */
export const TIPOS_SENSIBLES: readonly string[] = ["ENTREGA_ENLACE", "ENTREGA_CODIGO", "ESTUDIO_ENLACE", "ESTUDIO_CODIGO"];
export type TipoMensaje = (typeof TIPOS_MENSAJE)[number];
export const ETIQUETA_TIPO_MENSAJE: Record<TipoMensaje, string> = {
  CITA_CREADA: "Cita agendada", CITA_RECORDATORIO: "Recordatorio de cita", INFORME_PACIENTE: "Informe listo (paciente)",
  INFORME_REMITENTE: "Informe listo (doctor remitente)", SEGUIMIENTO: "Seguimiento",
  ENTREGA_ENLACE: "Entrega de resultados (enlace)", ENTREGA_CODIGO: "Entrega de resultados (código)",
  ESTUDIO_ENLACE: "Estudio compartido (enlace)", ESTUDIO_CODIGO: "Estudio compartido (código)",
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

/** Plantillas por defecto (el centro puede sobrescribirlas). Nunca incluyen texto clínico libre. */
export const PLANTILLAS_DEFECTO: Record<TipoMensaje, { asunto: string; cuerpo: string }> = {
  CITA_CREADA: {
    asunto: "Su cita en {{centro}} quedó agendada",
    cuerpo: "Hola {{paciente}}, su cita en {{centro}} es el {{fecha}} a las {{hora}}.\nLleve la orden de su doctor remitente, retire objetos metálicos y avise si hay posibilidad de embarazo.\nDirección: {{direccion}}. Teléfono: {{telefono}}.",
  },
  CITA_RECORDATORIO: {
    asunto: "Recordatorio de su cita en {{centro}}",
    cuerpo: "Hola {{paciente}}, le recordamos su cita en {{centro}} el {{fecha}} a las {{hora}}.\nRetire objetos metálicos antes del estudio y avise si hay posibilidad de embarazo.\nDirección: {{direccion}}. Teléfono: {{telefono}}.",
  },
  INFORME_PACIENTE: {
    asunto: "Su informe radiológico está listo",
    cuerpo: "Hola {{paciente}}, el informe de su estudio en {{centro}} (orden {{orden}}) ya está listo. Lo encuentra adjunto a este mensaje.",
  },
  INFORME_REMITENTE: {
    asunto: "Informe radiológico listo: orden {{orden}}",
    cuerpo: "Doctor(a) {{medico}}, el informe de su paciente {{paciente}} (orden {{orden}}) fue emitido por {{centro}}. Lo encuentra adjunto y también puede consultarlo en {{enlace}}.",
  },
  SEGUIMIENTO: {
    asunto: "{{centro}}: es momento de su control",
    cuerpo: "Hola {{paciente}}, en {{centro}} le recordamos que ({{motivo}}) está pendiente para {{mes}}. Llámenos al {{telefono}} para agendar.",
  },
  ENTREGA_ENLACE: {
    asunto: "Resultados del estudio de {{paciente}} en {{centro}}",
    cuerpo: "Hola {{destinatario}}, {{centro}} le comparte los resultados del estudio de {{paciente}}.\nÁbralos en: {{enlace}}\nEl código de acceso le llega en un mensaje aparte. El enlace vence el {{vence}}.",
  },
  // Sin datos del paciente en el cuerpo (Ley 1581): solo el aviso y el enlace.
  ESTUDIO_ENLACE: {
    asunto: "{{centro}} le comparte un estudio",
    cuerpo: "Hola {{destinatario}}, tiene un estudio disponible de {{centro}}.\nÁbralo en: {{enlace}}\nEl código de acceso le llega en un mensaje aparte. El enlace vence el {{vence}}.",
  },
  ESTUDIO_CODIGO: {
    asunto: "Código de acceso al estudio de {{centro}}",
    cuerpo: "Su código de acceso al estudio es {{codigo}}. Úselo en el enlace que recibió por separado; no lo comparta.",
  },
  ENTREGA_CODIGO: {
    asunto: "Código de acceso a los resultados de {{centro}}",
    cuerpo: "Su código de acceso a los resultados del estudio de {{paciente}} es {{codigo}}. Úselo en el enlace que recibió por separado; no lo comparta.",
  },
};
