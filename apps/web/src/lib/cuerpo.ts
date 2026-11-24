// Tope de tamaño de peticiones con cuerpo multipart: se decide por Content-Length ANTES de llamar a formData() (que carga todo en memoria).
/** true si falta Content-Length, no es un número válido o supera el máximo (Caddy ya corta, pero la app no debe depender de eso). */
export function cuerpoExcede(req: Request, maxBytes: number): boolean {
  const h = req.headers.get("content-length");
  if (h === null || h.trim() === "") return true;
  const n = Number(h);
  return !Number.isFinite(n) || n < 0 || n > maxBytes;
}
