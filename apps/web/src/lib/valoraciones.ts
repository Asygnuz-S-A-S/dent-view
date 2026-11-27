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
export const MAX_NOTA_FOTO = 500;
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
export const MAX_RECORDATORIOS = 2;
export const HORAS_ENTRE_RECORDATORIOS = 48;
/**
 * Si toca recordarle al paciente que su valoración sigue pendiente: espera su parte, tiene correo, el enlace aún vive >1 h, van menos de 2 recordatorios,
 * pasaron ≥48 h desde el último envío del enlace o recordatorio y no la tiene abierta (sin acceso en las últimas 3 h).
 */
export function debeRecordar(v: { estado: EstadoVal; expiraEn: Date; correo: string | null; recordatoriosEnviados: number; ultimoRecordatorioEn: Date | null; enlaceEnviadoEn: Date | null; ultimoAccesoEn: Date | null }, ahora = new Date()): boolean {
  if (!v.correo || !pacienteEdita(v, ahora) || v.expiraEn.getTime() - ahora.getTime() <= 3_600_000 || v.recordatoriosEnviados >= MAX_RECORDATORIOS) return false;
  const ultimo = Math.max(v.ultimoRecordatorioEn?.getTime() ?? 0, v.enlaceEnviadoEn?.getTime() ?? 0);
  if (!ultimo || ahora.getTime() - ultimo < HORAS_ENTRE_RECORDATORIOS * 3_600_000) return false;
  return !v.ultimoAccesoEn || ahora.getTime() - v.ultimoAccesoEn.getTime() >= SESION_VALORACION_MS;
}
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

export type InfoAngulo = {
  etiqueta: string; instruccion: string;
  bien: readonly string[]; evita: readonly string[]; // consejos para la toma
  orientacion: "vertical" | "horizontal"; // cómo sostener el celular
  opcional: boolean; // no cuenta en "X de N tomas"
};
const rostro = { orientacion: "vertical", opcional: false } as const;
const boca = { orientacion: "horizontal", opcional: false } as const;
export const INFO_ANGULO: Record<Angulo, InfoAngulo> = {
  FRONTAL_REPOSO: { etiqueta: "Rostro de frente", instruccion: "De frente, boca cerrada y relajada, con buena luz y sin lentes.", bien: ["Mira a la cámara, cabeza recta", "Luz natural de frente"], evita: ["Lentes, gorra o cabello sobre la cara", "Luz solo desde atrás"], ...rostro },
  SONRISA: { etiqueta: "Sonrisa", instruccion: "De frente, sonríe mostrando todos tus dientes.", bien: ["Sonríe de forma natural y muestra los dientes", "Se ve la boca completa"], evita: ["Tapar la boca con la mano", "Foto cortada abajo"], ...rostro },
  LATERAL_DERECHA: { etiqueta: "Perfil derecho", instruccion: "Gira la cabeza para mostrar el lado derecho de tu cara.", bien: ["Gira todo el cuerpo, no solo los ojos", "Se ve la oreja y la nariz"], evita: ["Medio perfil", "Cabello tapando la mandíbula"], ...rostro },
  LATERAL_IZQUIERDA: { etiqueta: "Perfil izquierdo", instruccion: "Gira la cabeza para mostrar el lado izquierdo de tu cara.", bien: ["Gira todo el cuerpo, no solo los ojos", "Se ve la oreja y la nariz"], evita: ["Medio perfil", "Cabello tapando la mandíbula"], ...rostro },
  OCLUSAL_SUPERIOR: { etiqueta: "Dientes de arriba", instruccion: "Abre bien la boca e inclina la cabeza hacia atrás: fotografía el techo de la boca.", bien: ["Boca muy abierta, cabeza hacia atrás", "Pide ayuda para sostener el celular"], evita: ["Sombra de la nariz sobre los dientes", "Lengua o labios tapando"], ...boca },
  OCLUSAL_INFERIOR: { etiqueta: "Dientes de abajo", instruccion: "Abre bien la boca y baja el mentón: fotografía los dientes de abajo desde arriba.", bien: ["Boca muy abierta, lengua hacia atrás", "Pide ayuda para sostener el celular"], evita: ["Lengua sobre los dientes", "Foto borrosa por el movimiento"], ...boca },
  INTRAORAL_FRONTAL: { etiqueta: "Mordida de frente", instruccion: "Muerde con los dientes juntos y separa los labios con los dedos; foto de frente.", bien: ["Dientes juntos y labios separados", "Celular a la altura de la boca"], evita: ["Labios cubriendo los dientes", "Foto desde abajo o desde arriba"], ...boca },
  INTRAORAL_DERECHA: { etiqueta: "Mordida lado derecho", instruccion: "Dientes juntos, separa la mejilla derecha y toma la foto desde ese lado.", bien: ["Separa bien la mejilla", "Se ven los dientes del fondo"], evita: ["Mejilla cerrando el encuadre", "Foto oscura"], ...boca },
  INTRAORAL_IZQUIERDA: { etiqueta: "Mordida lado izquierdo", instruccion: "Dientes juntos, separa la mejilla izquierda y toma la foto desde ese lado.", bien: ["Separa bien la mejilla", "Se ven los dientes del fondo"], evita: ["Mejilla cerrando el encuadre", "Foto oscura"], ...boca },
  ZONA_DOLOR: { etiqueta: "Zona que te duele", instruccion: "Acércate a la zona con molestia (diente, encía o hinchazón) y fotografíala.", bien: ["Acércate a 10-15 cm de la zona", "Separa labios o mejilla con los dedos"], evita: ["Foto lejana donde no se distingue", "Dedos tapando la zona"], ...boca },
  RADIOGRAFIA: { etiqueta: "Radiografía (si tienes)", instruccion: "Si tienes una radiografía reciente, tómale una foto o súbela desde tu galería.", bien: ["Ponla contra una ventana o pantalla blanca", "Que se vea completa y derecha"], evita: ["Reflejos del flash", "Radiografía cortada"], orientacion: "horizontal", opcional: true },
  VIDEO_APERTURA: { etiqueta: "Video de apertura y mordida", instruccion: `Video de máximo ${VIDEO_MAX_SEG} segundos: abre y cierra la boca despacio y muerde con los dientes juntos.`, bien: ["Celular vertical, de frente", "De 10 a 20 segundos"], evita: ["Moverte demasiado", "Hablar tapando la boca"], orientacion: "vertical", opcional: true },
  OTRO: { etiqueta: "Otras fotos", instruccion: "Cualquier otra foto que ayude al odontólogo (puedes subir varias).", bien: ["Cualquier foto que ayude a entender tu caso"], evita: ["Fotos sin relación con tu boca"], orientacion: "horizontal", opcional: true },
};
// --- Plantillas de captura: tomas SUGERIDAS por tipo de consulta (el mínimo de fotos no cambia) ---
export const PLANTILLAS_CAPTURA = {
  REVISION: { nombre: "Revisión / limpieza", angulos: ["FRONTAL_REPOSO", "SONRISA", "INTRAORAL_FRONTAL", "INTRAORAL_DERECHA", "INTRAORAL_IZQUIERDA", "OCLUSAL_SUPERIOR", "OCLUSAL_INFERIOR", "VIDEO_APERTURA"] },
  DOLOR: { nombre: "Dolor / urgencia", angulos: ["FRONTAL_REPOSO", "ZONA_DOLOR", "INTRAORAL_FRONTAL", "INTRAORAL_DERECHA", "INTRAORAL_IZQUIERDA", "RADIOGRAFIA", "VIDEO_APERTURA"] },
  ORTODONCIA: { nombre: "Ortodoncia / estética", angulos: ["FRONTAL_REPOSO", "SONRISA", "LATERAL_DERECHA", "LATERAL_IZQUIERDA", "INTRAORAL_FRONTAL", "INTRAORAL_DERECHA", "INTRAORAL_IZQUIERDA", "OCLUSAL_SUPERIOR", "OCLUSAL_INFERIOR", "VIDEO_APERTURA"] },
  IMPLANTE: { nombre: "Implante / dientes perdidos", angulos: ["FRONTAL_REPOSO", "SONRISA", "INTRAORAL_FRONTAL", "INTRAORAL_DERECHA", "INTRAORAL_IZQUIERDA", "OCLUSAL_SUPERIOR", "OCLUSAL_INFERIOR", "RADIOGRAFIA"] },
  COMPLETA: { nombre: "Completa", angulos: [...ANGULOS] },
  PERSONALIZADA: { nombre: "Personalizada", angulos: [] },
} as const satisfies Record<string, { nombre: string; angulos: readonly Angulo[] }>;
export type PlantillaCaptura = keyof typeof PLANTILLAS_CAPTURA;
export const CLAVES_PLANTILLA = Object.keys(PLANTILLAS_CAPTURA) as [PlantillaCaptura, ...PlantillaCaptura[]];
/** Tomas que se le piden al paciente: lo guardado en la solicitud; vacío (solicitudes anteriores) = todas. */
export const angulosDeSolicitud = (v: { angulosPedidos?: readonly string[] | null }): Angulo[] =>
  v.angulosPedidos?.length ? ANGULOS.filter((a) => v.angulosPedidos!.includes(a)) : [...ANGULOS];
/** Orden de la guía con las tomas obligatorias primero y las opcionales (radiografía, video, otras) al final. */
export const ordenarTomas = (a: readonly Angulo[]): Angulo[] =>
  ANGULOS.filter((x) => a.includes(x)).sort((x, y) => Number(INFO_ANGULO[x].opcional) - Number(INFO_ANGULO[y].opcional));

/**
 * Fotos que el odontólogo pidió y siguen pendientes: un pedido se cumple solo con una foto de ese ángulo subida DESPUÉS del mensaje
 * (repetir una toma que ya existía cuenta como pendiente hasta que llegue la nueva).
 */
export function pedidosPendientes(mensajes: readonly { autor: string; solicitaMedia: string | null; creadoEn: Date }[], medios: readonly { angulo: string; creadoEn: Date }[]): Angulo[] {
  const ultimo = new Map<string, number>(); // último pedido por ángulo
  for (const m of mensajes) if (m.autor === "PROFESIONAL" && m.solicitaMedia) ultimo.set(m.solicitaMedia, Math.max(ultimo.get(m.solicitaMedia) ?? 0, m.creadoEn.getTime()));
  return [...ultimo].filter(([a, t]) => !medios.some((x) => x.angulo === a && x.creadoEn.getTime() > t)).map(([a]) => a as Angulo);
}

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
export const ROLES_CREAR_VALORACION = ["admin_tenant", "recepcion", "especialista"] as const; // el especialista se la asigna a sí mismo
export const ROLES_ASIGNAR_VALORACION = ["admin_tenant", "recepcion"] as const;
/** Valoran el especialista y el administrador marcado como odontólogo (Member.esOdontologo). */
export const puedeValorar = (rol: string, esOdontologo: boolean) => rol === "especialista" || (rol === "admin_tenant" && esOdontologo);
export const puedeCrearValoracion = (rol: string) => (ROLES_CREAR_VALORACION as readonly string[]).includes(rol);
export const puedeAsignarValoracion = (rol: string) => (ROLES_ASIGNAR_VALORACION as readonly string[]).includes(rol);
export const puedeVerValoraciones = (rol: string) => (ROLES_VER_VALORACIONES as readonly string[]).includes(rol);
/** Solo quien valora ve el contenido clínico de la solicitud (motivo, cuestionario, fotos, video, mensajes y resultado). */
export const puedeVerClinico = puedeValorar;
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
  plantilla: z.enum(CLAVES_PLANTILLA).optional(),
  angulos: z.array(z.enum(ANGULOS)).max(ANGULOS.length).optional(), // vacío = todas las tomas
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

// --- Etapas del tablero: se derivan del estado (sin cambiar el enum) y de las marcas de seguimiento ---
export const ETAPAS = ["SIN_ABRIR", "COMPLETANDO", "POR_VALORAR", "EN_REVISION", "ESPERANDO_PACIENTE", "POR_ENVIAR", "CERRADA", "VENCIDA"] as const;
export type Etapa = (typeof ETAPAS)[number];
export const ETIQUETA_ETAPA: Record<Etapa, string> = {
  SIN_ABRIR: "Enlace sin abrir", COMPLETANDO: "Paciente completando", POR_VALORAR: "Lista para valorar", EN_REVISION: "Valorando",
  ESPERANDO_PACIENTE: "Esperando respuesta", POR_ENVIAR: "Resultado sin enviar", CERRADA: "Cerrada", VENCIDA: "Enlace vencido",
};
export type FilaEtapa = { estado: EstadoVal; expiraEn: Date; ultimoAccesoEn: Date | null; resultadoEnviadoEn: Date | null };
export function etapaValoracion(v: FilaEtapa, ahora = new Date()): Etapa {
  switch (estadoEfectivo(v, ahora)) {
    case "EXPIRADA": return "VENCIDA";
    case "BORRADOR": return "SIN_ABRIR"; // aún no se envía; no se crea en el flujo actual
    case "PENDIENTE_PACIENTE": return v.ultimoAccesoEn ? "COMPLETANDO" : "SIN_ABRIR";
    case "RECIBIDA": return "POR_VALORAR";
    case "EN_REVISION": return "EN_REVISION";
    case "REQUIERE_MAS_INFO": return "ESPERANDO_PACIENTE";
    case "COMPLETADA": return v.resultadoEnviadoEn ? "CERRADA" : "POR_ENVIAR";
    default: return "CERRADA"; // CANCELADA
  }
}
/** Posición en la barra de pasos: 0 enlace, 1 paciente, 2 valoración, 3 resultado, 4 todo listo. */
export const PASOS = ["Enlace enviado", "Paciente completa", "Valoración", "Resultado enviado"] as const;
export const pasoDeEtapa = (e: Etapa) => ({ SIN_ABRIR: 0, COMPLETANDO: 1, ESPERANDO_PACIENTE: 1, VENCIDA: 1, POR_VALORAR: 2, EN_REVISION: 2, POR_ENVIAR: 3, CERRADA: 4 })[e];

export const PESTANAS = ["atender", "esperando", "vencidas", "cerradas", "todas"] as const;
export type Pestana = (typeof PESTANAS)[number];
export const ETIQUETA_PESTANA: Record<Pestana, string> = { atender: "Por atender", esperando: "Esperando al paciente", vencidas: "Vencidas", cerradas: "Cerradas", todas: "Todas" };
/** "Por atender" depende de quién mira: quien valora ve lo que debe valorar o enviar; los demás, lo que hay que recordar o reenviar. */
export function enPestana(p: Pestana, e: Etapa, puedeValorar: boolean): boolean {
  switch (p) {
    case "atender": return puedeValorar ? e === "POR_VALORAR" || e === "EN_REVISION" || e === "POR_ENVIAR" : e === "SIN_ABRIR" || e === "VENCIDA";
    case "esperando": return e === "SIN_ABRIR" || e === "COMPLETANDO" || e === "ESPERANDO_PACIENTE";
    case "vencidas": return e === "VENCIDA";
    case "cerradas": return e === "CERRADA";
    default: return true;
  }
}

export type DestinoAccion = "paciente" | "responder" | "reenviar" | "enviar" | "ninguno";
/** Qué sigue en esta etapa según quien mira (el destino es la pestaña o botón del detalle donde se hace). */
export function siguienteAccion(e: Etapa, puedeValorar: boolean): { titulo: string; detalle: string; destino: DestinoAccion } {
  switch (e) {
    case "SIN_ABRIR": return { titulo: "Recordar al paciente", detalle: "Aún no abre el enlace. Reenvíalo por WhatsApp o correo.", destino: "reenviar" };
    case "COMPLETANDO": return { titulo: "Esperar al paciente", detalle: "Ya abrió el enlace y está subiendo sus fotos.", destino: "ninguno" };
    case "POR_VALORAR": return puedeValorar
      ? { titulo: "Revisar fotos y valorar", detalle: "El paciente ya envió todo. Revisa sus fotos y escribe la valoración.", destino: "paciente" }
      : { titulo: "Esperar al odontólogo", detalle: "El paciente ya envió todo; el odontólogo debe valorar.", destino: "ninguno" };
    case "EN_REVISION": return puedeValorar
      ? { titulo: "Completar la valoración", detalle: "Escribe el diagnóstico preliminar y las recomendaciones.", destino: "responder" }
      : { titulo: "Esperar al odontólogo", detalle: "El odontólogo está valorando.", destino: "ninguno" };
    case "ESPERANDO_PACIENTE": return { titulo: "Esperar la respuesta del paciente", detalle: "Se le pidió más información; si no responde, reenvía el acceso.", destino: "reenviar" };
    case "POR_ENVIAR": return puedeValorar
      ? { titulo: "Enviar el resultado", detalle: "La valoración está lista; envíala al paciente.", destino: "enviar" }
      : { titulo: "Esperar al odontólogo", detalle: "La valoración está lista; el odontólogo debe enviarla.", destino: "ninguno" };
    case "VENCIDA": return { titulo: "Enviar un enlace nuevo", detalle: "El enlace venció. Reenvíalo para reactivar la solicitud.", destino: "reenviar" };
    default: return { titulo: "Sin pendientes", detalle: "Esta valoración está cerrada.", destino: "ninguno" };
  }
}

/** Qué falta para pasar a la siguiente etapa; solo conteos y estados (no revela qué tomas se pidieron). */
export function faltantes(v: { etapa: Etapa; consentimientoEn: Date | null; fotos: number; valoracionEscrita: boolean }): string[] {
  switch (v.etapa) {
    case "SIN_ABRIR": case "COMPLETANDO": case "VENCIDA":
      return [...(v.consentimientoEn ? [] : ["Consentimiento"]), ...(v.fotos < MIN_FOTOS ? [`${MIN_FOTOS - v.fotos} ${MIN_FOTOS - v.fotos === 1 ? "foto" : "fotos"} más`] : [])];
    case "POR_VALORAR": case "EN_REVISION": return v.valoracionEscrita ? [] : ["Valoración escrita"];
    case "ESPERANDO_PACIENTE": return ["Respuesta del paciente"];
    case "POR_ENVIAR": return ["Enviar el resultado"];
    default: return [];
  }
}

export type FilaMetrica = FilaEtapa & { recibidaEn: Date | null; completadaEn: Date | null };
export const HORAS_POR_VENCER = 48;
/** Indicadores del tablero a partir de las marcas de cada fila (sin recorrer eventos). */
export function metricasValoraciones(filas: readonly FilaMetrica[], ahora = new Date()) {
  let porRevisar = 0, esperando = 0, porVencer = 0;
  const desde = ahora.getTime() - 90 * 86_400_000, limite = ahora.getTime() + HORAS_POR_VENCER * 3_600_000;
  for (const f of filas) {
    const e = etapaValoracion(f, ahora);
    if (e === "POR_VALORAR" || e === "EN_REVISION") porRevisar++;
    if (e === "SIN_ABRIR" || e === "COMPLETANDO" || e === "ESPERANDO_PACIENTE") { esperando++; if (f.expiraEn.getTime() <= limite) porVencer++; }
  }
  const pares = filas.flatMap((f) => (f.estado === "COMPLETADA" && f.recibidaEn && f.completadaEn && f.completadaEn.getTime() >= desde ? [{ desde: f.recibidaEn, hasta: f.completadaEn }] : []));
  return { porRevisar, esperando, porVencer, tiempoMedioMs: promedioRespuestaMs(pares) };
}
