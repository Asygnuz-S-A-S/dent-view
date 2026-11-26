// Hashes de la aceptación de una cotización (solo servidor: usa node:crypto).
import { createHash } from "node:crypto";

export const hashTexto = (t: string) => createHash("sha256").update(t).digest("hex");
/** La IP se guarda truncada y con hash ligado al secreto del servidor: sirve de huella, no de dato personal legible. */
export const hashIp = (ipTruncada: string | null, secreto: string) => createHash("sha256").update(`${secreto}:ip:${ipTruncada ?? "desconocida"}`).digest("hex");
