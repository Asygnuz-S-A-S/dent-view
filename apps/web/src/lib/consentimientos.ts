// Implementación independiente (sala limpia) a partir de docs/sala-limpia/02-consentimientos-y-proteccion-de-datos.md
// Lógica pura: normalización de finalidades, estado vigente, plazos y transiciones de solicitudes.

export const TIPOS_SOLICITUD = ["CONSULTA", "ACTUALIZACION", "SUPRESION", "REVOCATORIA", "RECLAMO"] as const;
export type TipoSolicitud = (typeof TIPOS_SOLICITUD)[number];
export const ETIQUETA_TIPO_SOLICITUD: Record<TipoSolicitud, string> = {
  CONSULTA: "Consulta de datos", ACTUALIZACION: "Actualización o rectificación", SUPRESION: "Supresión", REVOCATORIA: "Revocatoria de autorización", RECLAMO: "Reclamo",
};
export const ESTADOS_SOLICITUD = ["RECIBIDA", "EN_TRAMITE", "COMPLETADA", "RECHAZADA"] as const;
export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number];
export const ETIQUETA_ESTADO_SOLICITUD: Record<EstadoSolicitud, string> = { RECIBIDA: "Recibida", EN_TRAMITE: "En trámite", COMPLETADA: "Completada", RECHAZADA: "Rechazada" };

// Decisión de producto (validar con jurídica): consultas 10 días hábiles; el resto 15.
export const DIAS_HABILES: Record<TipoSolicitud, number> = { CONSULTA: 10, ACTUALIZACION: 15, SUPRESION: 15, REVOCATORIA: 15, RECLAMO: 15 };

export const FINALIDADES_SUGERIDAS = [
  "tratamiento de datos de salud", "envío de imágenes e informes al doctor remitente", "contacto por mensajería", "uso de imágenes para docencia (anonimizadas)",
] as const;

/** Finalidad comparable: sin espacios sobrantes y en minúsculas ("SMS " y "sms" son la misma). */
export const normalizarFinalidad = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** Suma días hábiles (lunes a viernes) a una fecha. shortcut: no descuenta festivos; añadir calendario si se exige exactitud legal. */
export function sumarDiasHabiles(desde: Date, dias: number) {
  const d = new Date(desde);
  let falta = dias;
  while (falta > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) falta--;
  }
  return d;
}
export const fechaLimite = (tipo: TipoSolicitud, recibida: Date) => sumarDiasHabiles(recibida, DIAS_HABILES[tipo]);

/** Días corridos que faltan (negativo = vencida). */
export const diasRestantes = (vence: Date, hoy = new Date()) => Math.ceil((vence.getTime() - hoy.getTime()) / 86_400_000);

const ABIERTAS: Record<EstadoSolicitud, EstadoSolicitud[]> = {
  RECIBIDA: ["EN_TRAMITE", "COMPLETADA", "RECHAZADA"], EN_TRAMITE: ["COMPLETADA", "RECHAZADA", "RECIBIDA"], COMPLETADA: [], RECHAZADA: [],
};
export const transicionSolicitudValida = (de: EstadoSolicitud, a: EstadoSolicitud) => ABIERTAS[de].includes(a);
export const solicitudCerrada = (e: EstadoSolicitud) => e === "COMPLETADA" || e === "RECHAZADA";

type Registro = { finalidad: string; otorgada: boolean; creadoEn: Date; id: string };
/** Estado vigente por finalidad: el registro más reciente (empate de fecha: el de id mayor). */
export function estadoVigente<T extends Registro>(registros: T[]) {
  const m = new Map<string, T>();
  for (const r of registros) {
    const a = m.get(r.finalidad);
    if (!a || r.creadoEn > a.creadoEn || (r.creadoEn.getTime() === a.creadoEn.getTime() && r.id > a.id)) m.set(r.finalidad, r);
  }
  return m;
}

/** Finalidad con la que se registra el consentimiento informado de un procedimiento (por orden). */
export const finalidadProcedimiento = (ordenNumero: number) => `consentimiento del procedimiento orden ${ordenNumero}`;
