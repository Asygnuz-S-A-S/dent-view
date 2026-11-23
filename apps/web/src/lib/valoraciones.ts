// Valoración virtual (teleodontología): lógica pura (sin I/O) para poder probarla.
// Retención: shortcut: no hay borrado automático de fotos/videos ni de solicitudes vencidas; definir la política (Ley 1581) y un cron de purga antes de producción.
import { z } from "zod";
import { tipoDeImagenEstudio } from "./imagenes";

export const DIAS_VENCIMIENTO = 7;
export const DIAS_RESULTADO = 30;
export const MAX_FOTOS = 12;
export const MAX_VIDEOS = 2;
export const MIN_FOTOS = 3;
export const FOTO_MAX_BYTES = 15 * 1024 * 1024; // el cliente comprime a ~1 MB; esto cubre HEIC/JPEG crudos de la galería
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const VIDEO_MAX_SEG = 45;
export const MAX_SUBIDAS_VENTANA = 40; // por valoración, cada 10 minutos
export const CONSENTIMIENTO_VERSION = "2026-11-v1";
export const COOKIE_VALORACION = "dv_valoracion";
export const SESION_VALORACION_MS = 3 * 60 * 60 * 1000;

export const ESTADOS = ["BORRADOR", "PENDIENTE_PACIENTE", "RECIBIDA", "EN_REVISION", "REQUIERE_MAS_INFO", "COMPLETADA", "CANCELADA", "EXPIRADA"] as const;
export type EstadoVal = (typeof ESTADOS)[number];
export const ETIQUETA_ESTADO: Record<EstadoVal, string> = {
  BORRADOR: "Borrador", PENDIENTE_PACIENTE: "Esperando al paciente", RECIBIDA: "Recibida", EN_REVISION: "En revisión",
  REQUIERE_MAS_INFO: "Requiere más información", COMPLETADA: "Completada", CANCELADA: "Cancelada", EXPIRADA: "Vencida",
};

const TRANSICIONES: Record<EstadoVal, readonly EstadoVal[]> = {
  BORRADOR: ["PENDIENTE_PACIENTE", "CANCELADA"],
  PENDIENTE_PACIENTE: ["RECIBIDA", "EXPIRADA", "CANCELADA"],
  RECIBIDA: ["EN_REVISION", "REQUIERE_MAS_INFO", "COMPLETADA", "CANCELADA"],
  EN_REVISION: ["REQUIERE_MAS_INFO", "COMPLETADA", "CANCELADA"],
  // El paciente responde (RECIBIDA) o el profesional completa con lo que ya tiene.
  REQUIERE_MAS_INFO: ["RECIBIDA", "EN_REVISION", "COMPLETADA", "EXPIRADA", "CANCELADA"],
  COMPLETADA: [],
  CANCELADA: [],
  EXPIRADA: ["PENDIENTE_PACIENTE"], // se reenvía el enlace
};
export const transicionValida = (de: EstadoVal, a: EstadoVal) => TRANSICIONES[de].includes(a);

/** El vencimiento no se persiste (no hay cron): se deriva al leer. Solo vencen las que esperan al paciente. */
export function estadoEfectivo(v: { estado: EstadoVal; expiraEn: Date }, ahora = new Date()): EstadoVal {
  return (v.estado === "PENDIENTE_PACIENTE" || v.estado === "REQUIERE_MAS_INFO") && v.expiraEn <= ahora ? "EXPIRADA" : v.estado;
}
/** El paciente solo puede subir/editar mientras espera su parte. */
export const pacienteEdita = (v: { estado: EstadoVal; expiraEn: Date }, ahora = new Date()) => {
  const e = estadoEfectivo(v, ahora);
  return e === "PENDIENTE_PACIENTE" || e === "REQUIERE_MAS_INFO";
};

export const MAX_INTENTOS_CODIGO = 5;
export type EstadoCodigo = "ACTIVO" | "VENCIDO" | "CERRADO" | "BLOQUEADO";
/** Si el enlace aún admite verificar el código (vencimiento, estado final o demasiados intentos). */
export function estadoCodigo(v: { estado: EstadoVal; expiraEn: Date; intentosCodigo: number }, ahora = new Date()): EstadoCodigo {
  if (v.estado === "CANCELADA" || v.estado === "BORRADOR") return "CERRADO";
  if (v.expiraEn <= ahora) return "VENCIDO";
  return v.intentosCodigo >= MAX_INTENTOS_CODIGO ? "BLOQUEADO" : "ACTIVO";
}
export const vencimiento = (dias: number, ahora = new Date()) => new Date(ahora.getTime() + dias * 86_400_000);
export const venceSesionValoracion = (ahora: Date, expiraEn: Date) => new Date(Math.min(ahora.getTime() + SESION_VALORACION_MS, expiraEn.getTime()));

// --- Ángulos de captura (orden = orden de la guía) ---
export const ANGULOS = [
  "FRONTAL_REPOSO", "SONRISA", "LATERAL_DERECHA", "LATERAL_IZQUIERDA", "OCLUSAL_SUPERIOR", "OCLUSAL_INFERIOR",
  "INTRAORAL_FRONTAL", "INTRAORAL_DERECHA", "INTRAORAL_IZQUIERDA", "ZONA_DOLOR", "RADIOGRAFIA", "VIDEO_APERTURA", "OTRO",
] as const;
export type Angulo = (typeof ANGULOS)[number];
export const ANGULOS_FOTO = ANGULOS.filter((a) => a !== "VIDEO_APERTURA");
export const ANGULOS_MULTIPLES: readonly Angulo[] = ["OTRO"]; // el resto admite una sola foto (repetirla la reemplaza)
export const ANGULOS_CAMARA_FRONTAL: readonly Angulo[] = ["FRONTAL_REPOSO", "SONRISA"]; // selfie

export const INFO_ANGULO: Record<Angulo, { etiqueta: string; instruccion: string }> = {
  FRONTAL_REPOSO: { etiqueta: "Rostro de frente", instruccion: "De frente, boca cerrada y relajada, con buena luz y sin lentes." },
  SONRISA: { etiqueta: "Sonrisa", instruccion: "De frente, sonríe mostrando todos tus dientes." },
  LATERAL_DERECHA: { etiqueta: "Perfil derecho", instruccion: "Gira la cabeza para mostrar el lado derecho de tu cara." },
  LATERAL_IZQUIERDA: { etiqueta: "Perfil izquierdo", instruccion: "Gira la cabeza para mostrar el lado izquierdo de tu cara." },
  OCLUSAL_SUPERIOR: { etiqueta: "Dientes de arriba", instruccion: "Abre bien la boca e inclina la cabeza hacia atrás: fotografía el techo de la boca." },
  OCLUSAL_INFERIOR: { etiqueta: "Dientes de abajo", instruccion: "Abre bien la boca y baja el mentón: fotografía los dientes de abajo desde arriba." },
  INTRAORAL_FRONTAL: { etiqueta: "Mordida de frente", instruccion: "Muerde con los dientes juntos y separa los labios con los dedos; foto de frente." },
  INTRAORAL_DERECHA: { etiqueta: "Mordida lado derecho", instruccion: "Dientes juntos, separa la mejilla derecha y toma la foto desde ese lado." },
  INTRAORAL_IZQUIERDA: { etiqueta: "Mordida lado izquierdo", instruccion: "Dientes juntos, separa la mejilla izquierda y toma la foto desde ese lado." },
  ZONA_DOLOR: { etiqueta: "Zona que te duele", instruccion: "Acércate a la zona con molestia (diente, encía o hinchazón) y fotografíala." },
  RADIOGRAFIA: { etiqueta: "Radiografía (si tienes)", instruccion: "Si tienes una radiografía reciente, tómale una foto o súbela desde tu galería." },
  VIDEO_APERTURA: { etiqueta: "Video de apertura y mordida", instruccion: `Video de máximo ${VIDEO_MAX_SEG} segundos: abre y cierra la boca despacio y muerde con los dientes juntos.` },
  OTRO: { etiqueta: "Otras fotos", instruccion: "Cualquier otra foto que ayude al odontólogo (puedes subir varias)." },
};
export const ordenAngulo = (a: string) => ANGULOS.indexOf(a as Angulo);
/** Ordena por el orden de la guía y, a igual ángulo, por fecha de subida. */
export const ordenarMedios = <T extends { angulo: string; creadoEn: Date }>(m: readonly T[]) =>
  [...m].sort((a, b) => ordenAngulo(a.angulo) - ordenAngulo(b.angulo) || a.creadoEn.getTime() - b.creadoEn.getTime());

export type Medio = { tipo: "FOTO" | "VIDEO"; angulo: string };
/** Por qué no se puede enviar todavía; null si está lista. */
export function faltaParaEnviar(e: { consentimiento: boolean; motivo: string; medios: readonly Medio[] }): string | null {
  if (!e.consentimiento) return "Falta aceptar el consentimiento.";
  if (!e.motivo.trim()) return "Cuéntanos el motivo de tu consulta.";
  const fotos = e.medios.filter((m) => m.tipo === "FOTO").length;
  return fotos < MIN_FOTOS ? `Sube al menos ${MIN_FOTOS} fotos (llevas ${fotos}).` : null;
}
/** Si se puede añadir otro archivo de este tipo/ángulo (límites por valoración; repetir un ángulo único lo reemplaza). */
export function validarCupo(medios: readonly Medio[], nuevo: Medio): string | null {
  if ((nuevo.tipo === "VIDEO") !== (nuevo.angulo === "VIDEO_APERTURA")) return "El ángulo no corresponde al tipo de archivo.";
  const reemplaza = nuevo.tipo === "FOTO" && !ANGULOS_MULTIPLES.includes(nuevo.angulo as Angulo) && medios.some((m) => m.tipo === "FOTO" && m.angulo === nuevo.angulo);
  const fotos = medios.filter((m) => m.tipo === "FOTO").length, videos = medios.length - fotos;
  if (nuevo.tipo === "FOTO" && !reemplaza && fotos >= MAX_FOTOS) return `Máximo ${MAX_FOTOS} fotos por valoración.`;
  if (nuevo.tipo === "VIDEO" && videos >= MAX_VIDEOS) return `Máximo ${MAX_VIDEOS} videos por valoración.`;
  return null;
}

// --- Archivos: tipo real por firma (nunca por lo que declara el cliente) ---
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.slice(i, i + n));
/** mp4/mov (caja `ftyp`) o webm (cabecera EBML); null si no es un video aceptado. */
export function tipoDeVideo(b: Uint8Array): "video/mp4" | "video/quicktime" | "video/webm" | null {
  if (b.length >= 12 && ascii(b, 4, 4) === "ftyp") return ascii(b, 8, 4) === "qt  " ? "video/quicktime" : "video/mp4";
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "video/webm";
  return null;
}
export function validarVideo(b: Uint8Array): string | null {
  if (b.length === 0) return "El archivo está vacío";
  if (b.length > VIDEO_MAX_BYTES) return "El video supera los 50 MB";
  return tipoDeVideo(b) ? null : "Solo se aceptan videos mp4, mov o webm";
}
export function validarFotoValoracion(b: Uint8Array): string | null {
  if (b.length === 0) return "El archivo está vacío";
  if (b.length > FOTO_MAX_BYTES) return "La foto supera los 15 MB";
  return tipoDeImagenEstudio(b) ? null : "Solo se aceptan fotos JPEG, PNG, WebP o HEIC";
}
export const EXT_VIDEO = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" } as const;

/** Claves S3: por centro y valoración. */
export const baseClave = (organizationId: string, valoracionId: string) => `tenants/${organizationId}/valoraciones/${valoracionId}`;
export const claveMedia = (organizationId: string, valoracionId: string, mediaId: string, ext: string) => `${baseClave(organizationId, valoracionId)}/${mediaId}/original.${ext}`;
export const claveCopia = (claveOriginal: string, v: "web" | "thumb") => `${claveOriginal.slice(0, claveOriginal.lastIndexOf("/"))}/${v}.jpg`;
/** La clave guardada debe pertenecer al centro y a la valoración antes de leerla o borrarla. */
export const claveValida = (key: string, organizationId: string, valoracionId: string) => key.startsWith(`${baseClave(organizationId, valoracionId)}/`) && !key.includes("..");

// --- Permisos ---
export const ROLES_VER_VALORACIONES = ["admin_tenant", "recepcion", "especialista"] as const;
export const ROLES_CREAR_VALORACION = ["admin_tenant", "recepcion"] as const;
/** Valoran el especialista y el administrador marcado como odontólogo (Member.esOdontologo). */
export const puedeValorar = (rol: string, esOdontologo: boolean) => rol === "especialista" || (rol === "admin_tenant" && esOdontologo);
export const puedeCrearValoracion = (rol: string) => (ROLES_CREAR_VALORACION as readonly string[]).includes(rol);
export const puedeVerValoraciones = (rol: string) => (ROLES_VER_VALORACIONES as readonly string[]).includes(rol);
/** Filtro Prisma: admin y recepción ven todas las del centro; el especialista solo las asignadas a él. */
export function filtroValoraciones(organizationId: string, usuarioId: string, rol: string) {
  return rol === "especialista" ? { organizationId, doctorId: usuarioId } : { organizationId };
}

// --- Datos ---
export const IP_DESCONOCIDA = "desconocida";
/** IPv4 → a.b.c.0; IPv6 → primeros 4 grupos; otra cosa → null (no se guarda la IP completa). */
export function truncarIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(ip);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0`;
  return ip.includes(":") ? `${ip.split(":").slice(0, 4).join(":")}::` : null;
}
/** Teléfono colombiano (10 dígitos, móvil) → wa.me con mensaje prellenado; otro formato se usa tal cual si tiene 8–15 dígitos. */
export function enlaceWhatsapp(telefono: string | null | undefined, mensaje: string): string | null {
  const d = (telefono ?? "").replace(/\D/g, "");
  const num = d.length === 10 && d.startsWith("3") ? `57${d}` : d;
  return num.length >= 8 && num.length <= 15 ? `https://wa.me/${num}?text=${encodeURIComponent(mensaje)}` : null;
}

export const CONSENTIMIENTO_TEXTO = [
  "Autorizo a este centro odontológico a tratar mis datos personales, incluidos datos de salud (dato sensible) y mis imágenes y videos, con la única finalidad de realizar una valoración odontológica a distancia y comunicarme su resultado.",
  "Entiendo que una valoración virtual es una orientación preliminar y no reemplaza un examen clínico presencial, y que es voluntario responder o subir material.",
  "Puedo conocer, actualizar, rectificar o pedir la supresión de mis datos, y revocar esta autorización, escribiendo al centro (Ley 1581 de 2012).",
];

const texto = (max: number) => z.string().trim().max(max);
export const esquemaSolicitud = z.object({
  nombre: z.string().trim().min(2, "Falta el nombre").max(120),
  telefono: texto(30).optional(),
  correo: z.string().trim().email("Correo no válido").max(160).optional().or(z.literal("")),
  ciudad: texto(80).optional(),
  motivo: z.string().trim().min(3, "Cuenta brevemente el motivo").max(500),
  doctorId: z.string().optional(),
  pacienteId: z.string().optional(),
  leadId: z.string().optional(),
}).refine((d) => d.correo || d.telefono, { message: "Escribe un correo o un teléfono para enviar el enlace", path: ["correo"] });

export const esquemaCuestionario = z.object({
  dolor: z.number().int().min(0).max(10),
  desde: texto(120).optional(),
  sintomas: z.array(z.enum(["DOLOR", "SENSIBILIDAD", "SANGRADO", "INFLAMACION", "MAL_ALIENTO", "MOVILIDAD", "FRACTURA", "ESTETICA", "OTRO"])).max(9),
  alergias: texto(300).optional(),
  medicamentos: texto(300).optional(),
  embarazo: z.enum(["SI", "NO", "NA"]).optional(),
  motivo: z.string().trim().min(3, "Cuéntanos el motivo de tu consulta").max(500),
});
export type Cuestionario = z.infer<typeof esquemaCuestionario>;
export const ETIQUETA_SINTOMA: Record<Cuestionario["sintomas"][number], string> = {
  DOLOR: "Dolor", SENSIBILIDAD: "Sensibilidad", SANGRADO: "Sangrado de encías", INFLAMACION: "Inflamación", MAL_ALIENTO: "Mal aliento",
  MOVILIDAD: "Dientes que se mueven", FRACTURA: "Diente roto o fracturado", ESTETICA: "Quiero mejorar mi sonrisa", OTRO: "Otro",
};

export const esquemaResultado = z.object({
  diagnosticoPreliminar: z.string().trim().min(3, "Escribe el diagnóstico preliminar").max(3000),
  recomendaciones: z.string().trim().min(3, "Escribe las recomendaciones").max(3000),
  tratamientoSugerido: z.string().trim().max(2000).optional(),
  requierePresencial: z.boolean(),
  presupuestoEstimado: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
});
export type Resultado = z.infer<typeof esquemaResultado>;
export const esquemaMensaje = z.object({ texto: z.string().trim().min(1, "Escribe un mensaje").max(1000), solicitaMedia: z.enum(ANGULOS).optional() });

/** Promedio en ms entre pares (recibida → completada); null si no hay pares válidos. */
export function promedioRespuestaMs(pares: readonly { desde: Date; hasta: Date }[]): number | null {
  const v = pares.map((p) => p.hasta.getTime() - p.desde.getTime()).filter((x) => x >= 0);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
export function duracionLegible(ms: number | null): string {
  if (ms === null) return "—";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.round(ms / 3_600_000);
  return h < 48 ? `${h} h` : `${Math.round(ms / 86_400_000)} días`;
}
/** Filtro Prisma por estado "visible": el vencimiento se deriva de expiraEn (ver estadoEfectivo). */
export function filtroEstado(estado: EstadoVal, ahora = new Date()) {
  const espera = estado === "PENDIENTE_PACIENTE" || estado === "REQUIERE_MAS_INFO";
  if (espera) return { estado, expiraEn: { gt: ahora } };
  if (estado === "EXPIRADA") return { OR: [{ estado }, { estado: { in: ["PENDIENTE_PACIENTE", "REQUIERE_MAS_INFO"] as EstadoVal[] }, expiraEn: { lte: ahora } }] };
  return { estado };
}
