// Lógica pura de descarga y envío de un estudio (sin I/O, para poder probarla).
import { createHash } from "node:crypto";

/** Ventana de idempotencia: reenviar lo mismo al mismo destino dentro de ella no genera otro envío. */
export const VENTANA_ENVIO_MS = 10 * 60_000;
export const MAX_ENVIOS = 10; // por usuario y hora
export const DIAS_ENLACE_ESTUDIO = 7;

/** Clave de idempotencia por estudio + destino (hash: el correo no queda en claro en la clave) + ventana de tiempo. */
export function claveEnvioEstudio(estudioId: string, destino: string, ahora: number) {
  const h = createHash("sha256").update(destino.trim().toLowerCase()).digest("hex").slice(0, 16);
  return `estudio-${estudioId}-${h}-${Math.floor(ahora / VENTANA_ENVIO_MS)}`;
}

/** Nombre del zip sin datos del paciente: fecha del estudio + id corto del estudio. */
export function nombreZip(estudio: { id: string; fechaEstudio: Date | null }) {
  const f = estudio.fechaEstudio ? estudio.fechaEstudio.toISOString().slice(0, 10).replaceAll("-", "") : "sinfecha";
  return `estudio-${f}-${estudio.id.slice(-6).replace(/[^A-Za-z0-9]/g, "")}.zip`;
}
