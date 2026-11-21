import { prisma } from "@dent-view/db";
import { hashToken, limitarIp } from "./entrega";
import { tokenDeCabecera } from "./ingesta";

const peticiones = new Map<string, number[]>();

/**
 * Autentica la estación por su token (nunca por sesión) y aplica el límite de peticiones por estación.
 * Devuelve la estación activa o la respuesta de error. Actualiza ultimoContacto.
 */
export async function autenticarEstacion(req: Request) {
  const token = tokenDeCabecera(req.headers.get("authorization"));
  const estacion = token
    ? await prisma.estacionIngesta.findUnique({ where: { tokenHash: hashToken(token) }, select: { id: true, organizationId: true, nombre: true, activa: true } })
    : null;
  if (!estacion?.activa) return { error: Response.json({ error: "Token inválido o estación desactivada" }, { status: 401 }) };
  // Un CBCT exportado como archivos sueltos son cientos de peticiones: el límite es holgado y solo frena abusos.
  if (!limitarIp(peticiones, estacion.id, Date.now(), 3000, 10 * 60_000)) {
    return { error: Response.json({ error: "Demasiadas peticiones" }, { status: 429, headers: { "Retry-After": "60" } }) };
  }
  await prisma.estacionIngesta.update({ where: { id: estacion.id }, data: { ultimoContacto: new Date() } });
  return { estacion };
}
