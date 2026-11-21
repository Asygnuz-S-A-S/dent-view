// Cifrado de secretos en reposo (credenciales de conectores, secretos de webhooks): AES-256-GCM.
// La clave se deriva con HKDF del secreto del servidor; cambiar CIFRADO_SECRETO (o BETTER_AUTH_SECRET si no está definido) invalida lo cifrado.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/** Secreto con el que se cifra en reposo: CIFRADO_SECRETO si existe; si no, BETTER_AUTH_SECRET (así no se invalida lo ya cifrado). */
export const secretoCifrado = () => process.env.CIFRADO_SECRETO || process.env.BETTER_AUTH_SECRET || undefined;

const clave = (secreto: string) => Buffer.from(hkdfSync("sha256", secreto, "dent-view", "secretos-en-reposo-v1", 32));

/** Devuelve `v1.<iv>.<etiqueta>.<texto>` en base64url. */
export function cifrar(texto: string, secreto: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", clave(secreto), iv);
  const cifrado = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return ["v1", iv, c.getAuthTag(), cifrado].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

/** Lanza si el valor fue alterado o la clave no coincide. */
export function descifrar(valor: string, secreto: string) {
  const [v, iv, tag, cifrado] = valor.split(".");
  if (v !== "v1" || !iv || !tag || !cifrado) throw new Error("Valor cifrado no válido");
  const d = createDecipheriv("aes-256-gcm", clave(secreto), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(cifrado, "base64url")), d.final()]).toString("utf8");
}
