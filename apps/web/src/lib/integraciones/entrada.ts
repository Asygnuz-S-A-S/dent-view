// Webhook de entrada: firma HMAC-SHA256 de `${marcaDeTiempo}.${cuerpo}` con un secreto por integración.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const TOLERANCIA_S = 300; // 5 minutos
export const MAX_CUERPO = 256 * 1024;
export const CABECERA_FIRMA = "x-dentview-signature";
export const CABECERA_MARCA = "x-dentview-timestamp";

export const generarSecretoEntrada = () => `whsec_${randomBytes(32).toString("base64url")}`;

export const firmarEntrada = (secreto: string, marca: string, cuerpo: string) =>
  `sha256=${createHmac("sha256", secreto).update(`${marca}.${cuerpo}`).digest("hex")}`;

/** Marca de tiempo en segundos Unix dentro de la tolerancia + firma comparada en tiempo constante. */
export function verificarEntrada(o: { secreto: string; marca: string | null; firma: string | null; cuerpo: string; ahora?: number }) {
  const { secreto, marca, firma, cuerpo, ahora = Date.now() } = o;
  if (!marca || !firma || !/^\d{1,12}$/.test(marca)) return false;
  if (Math.abs(ahora / 1000 - Number(marca)) > TOLERANCIA_S) return false;
  const esperada = Buffer.from(firmarEntrada(secreto, marca, cuerpo));
  const recibida = Buffer.from(firma);
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}
