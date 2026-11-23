// Enlace de baja firmado (sin estado en la base): el token lleva centro, tipo (lead | paciente) e id, firmados con HMAC-SHA256.
// No caduca a propósito: un enlace de baja debe funcionar siempre. Solo sirve para dejar de recibir mensajes de seguimiento.
import { createHmac, timingSafeEqual } from "node:crypto";

export type SujetoBaja = { o: string; t: "l" | "p"; i: string };
const firma = (cuerpo: string, secreto: string) => createHmac("sha256", secreto).update(`baja:${cuerpo}`).digest("base64url");

export function firmarBaja(s: SujetoBaja, secreto: string) {
  const cuerpo = Buffer.from(JSON.stringify(s)).toString("base64url");
  return `${cuerpo}.${firma(cuerpo, secreto)}`;
}

export function verificarBaja(token: string, secreto: string): SujetoBaja | null {
  const [cuerpo, f, resto] = token.split(".");
  if (!cuerpo || !f || resto !== undefined || token.length > 400) return null;
  const esperada = Buffer.from(firma(cuerpo, secreto)), dada = Buffer.from(f);
  if (esperada.length !== dada.length || !timingSafeEqual(esperada, dada)) return null;
  try {
    const s = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8")) as Partial<SujetoBaja>;
    return typeof s.o === "string" && typeof s.i === "string" && (s.t === "l" || s.t === "p") ? { o: s.o, t: s.t, i: s.i } : null;
  } catch {
    return null;
  }
}

/** URL absoluta de baja (origen canónico de la app, BETTER_AUTH_URL). */
export const urlBaja = (token: string, origen = process.env.BETTER_AUTH_URL ?? "http://localhost:3000") => `${origen.replace(/\/+$/, "")}/baja/${token}`;
