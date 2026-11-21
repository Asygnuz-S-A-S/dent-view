// Tokens de la API pública (y del servidor MCP). Lógica pura: generación, hash, permisos y verificación de formato.
import { createHash, randomBytes } from "node:crypto";

/** Permisos disponibles. "leer" nunca implica "escribir". `pii` = ver datos personales sin enmascarar en el MCP. */
export const PERMISOS = {
  "pacientes:leer": "Ver pacientes",
  "pacientes:escribir": "Crear y actualizar pacientes",
  "ordenes:leer": "Ver órdenes",
  "ordenes:escribir": "Crear órdenes",
  "citas:leer": "Ver citas",
  "citas:escribir": "Crear citas",
  "estudios:leer": "Ver estudios",
  "informes:leer": "Ver informes emitidos",
  "doctores:leer": "Ver doctores remitentes",
  "catalogo:leer": "Ver catálogo y precios",
  mcp: "Token de servidor MCP: solo sirve en /api/mcp (la API REST lo rechaza)",
  pii: "Ver nombres y documentos sin enmascarar en el servidor MCP",
} as const;
export type Permiso = keyof typeof PERMISOS;
export const TODOS_LOS_PERMISOS = Object.keys(PERMISOS) as Permiso[];
/** Permisos que puede llevar un token de la API REST (sin los exclusivos del MCP). */
export const PERMISOS_API: Permiso[] = TODOS_LOS_PERMISOS.filter((p) => p !== "mcp" && p !== "pii");
export const SOLO_LECTURA: Permiso[] = TODOS_LOS_PERMISOS.filter((p) => p.endsWith(":leer"));

const PREFIJO = "dvk_";

/** `dvk_<8 visibles>_<secreto 256 bits>`. El valor completo se muestra una sola vez. */
export function generarTokenApi() {
  const visible = randomBytes(6).toString("base64url").slice(0, 8);
  const token = `${PREFIJO}${visible}_${randomBytes(32).toString("base64url")}`;
  return { token, prefijo: `${PREFIJO}${visible}`, tokenHash: hashTokenApi(token) };
}

/** Los tokens tienen 256 bits de entropía: basta SHA-256 (sin sal) para buscarlos por hash. */
export const hashTokenApi = (token: string) => createHash("sha256").update(token).digest("hex");

/** Rechaza rápido lo que no tiene forma de token antes de consultar la BD. */
export const formatoTokenValido = (t: string) => /^dvk_[A-Za-z0-9_-]{8}_[A-Za-z0-9_-]{43}$/.test(t);

/** Extrae el token de `Authorization: Bearer …`. */
export function tokenDeCabecera(auth: string | null | undefined) {
  const m = /^Bearer\s+(\S+)$/i.exec(auth ?? "");
  return m && formatoTokenValido(m[1]!) ? m[1]! : null;
}

export type FilaToken = { permisos: string[]; vence: Date | null; revocadoEn: Date | null };
export type EstadoToken = "ACTIVO" | "VENCIDO" | "REVOCADO";
export function estadoToken(t: Pick<FilaToken, "vence" | "revocadoEn">, ahora = new Date()): EstadoToken {
  if (t.revocadoEn) return "REVOCADO";
  if (t.vence && t.vence <= ahora) return "VENCIDO";
  return "ACTIVO";
}

export const tienePermiso = (t: Pick<FilaToken, "permisos">, p: Permiso) => t.permisos.includes(p);
/** Descarta permisos desconocidos (un cliente no puede inventar permisos al crear un token). */
export const permisosValidos = (pedidos: string[]): Permiso[] => [...new Set(pedidos)].filter((p): p is Permiso => p in PERMISOS);

/**
 * Un token es de la API REST o del servidor MCP, nunca de los dos: el MCP enmascara los datos personales y
 * la API REST no, así que un token MCP usado en la API saltaría esa protección. Devuelve el error o null.
 */
export function validarCombinacion(permisos: Permiso[]): string | null {
  const esMcp = permisos.includes("mcp");
  if (permisos.includes("pii") && !esMcp) return "«Datos sin enmascarar» solo aplica a tokens del servidor MCP.";
  if (esMcp && permisos.some((p) => p.endsWith(":escribir"))) return "Un token MCP es de solo lectura.";
  if (esMcp && !permisos.some((p) => p.endsWith(":leer"))) return "Elige qué puede leer el token MCP.";
  return null;
}
/** ¿Sirve para la API REST? (los tokens MCP no). */
export const esTokenMcp = (t: Pick<FilaToken, "permisos">) => t.permisos.includes("mcp");
