import { timingSafeEqual } from "node:crypto";

/** Autoriza las rutas /api/cron/*: secreto Bearer comparado en tiempo constante (sin filtrar la longitud por tiempo de respuesta). Sin CRON_SECRET siempre falla. */
export function cronAutorizado(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  const dado = Buffer.from(req.headers.get("authorization") ?? ""), esperado = Buffer.from(`Bearer ${secreto}`);
  return dado.length === esperado.length && timingSafeEqual(dado, esperado);
}
