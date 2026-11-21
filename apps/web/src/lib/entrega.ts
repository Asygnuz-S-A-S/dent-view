// Lógica pura de la entrega de resultados por enlace + código (sin I/O, para poder probarla).
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const MAX_INTENTOS = 5;
export const DIAS_VENCIMIENTO = 30;
export const COOKIE_RESULTADOS = "dv_resultados";
export const SESION_RESULTADOS_MS = 2 * 60 * 60 * 1000;

/** Token de 256 bits para el enlace (base64url, 43 caracteres). */
export const generarToken = () => randomBytes(32).toString("base64url");
/** Código de 6 dígitos con ceros a la izquierda. */
export const generarCodigoAcceso = (aleatorio: (max: number) => number = (m) => randomInt(m)) => String(aleatorio(1_000_000)).padStart(6, "0");

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
/** El código tiene poca entropía: se liga al enlace y a un secreto del servidor para que un volcado de la BD no sirva para adivinarlo. */
export const hashCodigo = (tokenHash: string, codigo: string, secreto: string) => createHmac("sha256", secreto).update(`codigo:${tokenHash}:${codigo}`).digest("hex");

/** Comparación en tiempo constante de dos hashes hex. */
export function igualesSeguro(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export type EstadoEnlace = "ACTIVO" | "VENCIDO" | "REVOCADO" | "BLOQUEADO";
export function estadoEnlace(e: { venceEn: Date; revocadoEn: Date | null; intentosFallidos: number }, ahora = new Date()): EstadoEnlace {
  if (e.revocadoEn) return "REVOCADO";
  if (e.venceEn <= ahora) return "VENCIDO";
  if (e.intentosFallidos >= MAX_INTENTOS) return "BLOQUEADO";
  return "ACTIVO";
}

/** La sesión de resultados dura SESION_RESULTADOS_MS, sin pasar nunca del vencimiento del enlace. */
export const venceSesion = (ahora: Date, venceEnlace: Date) => new Date(Math.min(ahora.getTime() + SESION_RESULTADOS_MS, venceEnlace.getTime()));

/** Valor de la cookie: `enlaceId.expiraMs.firma` (HMAC con el secreto del servidor). */
export function firmarCookie(enlaceId: string, expira: Date, secreto: string) {
  const cuerpo = `${enlaceId}.${expira.getTime()}`;
  return `${cuerpo}.${createHmac("sha256", secreto).update(`cookie:${cuerpo}`).digest("base64url")}`;
}

/** Devuelve el id del enlace si la firma es válida y no ha vencido; null en cualquier otro caso. */
export function verificarCookie(valor: string | null | undefined, secreto: string, ahora = new Date()): string | null {
  const m = /^([A-Za-z0-9_-]{1,64})\.(\d{1,15})\.([A-Za-z0-9_-]{43})$/.exec(valor ?? "");
  if (!m) return null;
  const esperado = firmarCookie(m[1]!, new Date(Number(m[2])), secreto);
  return igualesSeguro(esperado, valor!) && Number(m[2]) > ahora.getTime() ? m[1]! : null;
}

/**
 * Límite por IP en ventana deslizante. shortcut: memoria del proceso (no se comparte entre réplicas),
 * migrar a Redis/BD si se escala a varias instancias.
 */
export function limitarIp(intentos: Map<string, number[]>, ip: string, ahora = Date.now(), max = 20, ventanaMs = 10 * 60_000) {
  const recientes = (intentos.get(ip) ?? []).filter((t) => ahora - t < ventanaMs);
  if (recientes.length >= max) { intentos.set(ip, recientes); return false; }
  intentos.set(ip, [...recientes, ahora]);
  if (intentos.size > 5000) for (const [k, v] of intentos) if (v.every((t) => ahora - t >= ventanaMs)) intentos.delete(k);
  return true;
}

export const MENSAJE_INVALIDO = "El enlace o el código no son válidos, o ya vencieron.";
