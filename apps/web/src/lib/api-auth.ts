// Autenticación de la API pública: Authorization: Bearer dvk_… → un token pertenece a UN solo centro.
import { prisma } from "@dent-view/db";
import { esTokenMcp, estadoToken, hashTokenApi, tienePermiso, tokenDeCabecera, type Permiso } from "./api-token";

/** Error con respuesta HTTP uniforme: { error: { codigo, mensaje } }. Nunca lleva detalles internos. */
export class ErrorApi extends Error {
  constructor(public status: number, public codigo: string, mensaje: string, public cabeceras?: Record<string, string>, public detalles?: unknown) {
    super(mensaje);
  }
}

export const MENSAJE_401 = "Token ausente, inválido o revocado.";
export const ULTIMO_USO_CADA_MS = 60_000;

type FilaAuth = { permisos: string[]; vence: Date | null; revocadoEn: Date | null };

/** Decide el resultado de usar un token (fila ya encontrada por hash) para un permiso. Inexistente, vencido y revocado dan el mismo 401. */
export function evaluarToken(fila: FilaAuth | null, permiso: Permiso, ahora = new Date()): ErrorApi | null {
  if (!fila || estadoToken(fila, ahora) !== "ACTIVO") return new ErrorApi(401, "no_autenticado", MENSAJE_401);
  // Un token del servidor MCP (datos enmascarados) no puede usarse en la API REST (datos completos).
  if (esTokenMcp(fila)) return new ErrorApi(401, "no_autenticado", MENSAJE_401);
  if (!tienePermiso(fila, permiso)) return new ErrorApi(403, "sin_permiso", `El token no tiene el permiso ${permiso}.`);
  return null;
}

export const debeActualizarUso = (ultimoUso: Date | null, ahora = new Date()) => !ultimoUso || ahora.getTime() - ultimoUso.getTime() >= ULTIMO_USO_CADA_MS;

export type ContextoApi = { organizationId: string; token: { id: string; prefijo: string; nombre: string; permisos: string[] } };

/** Valida el token de la petición y devuelve el centro al que da acceso. Lanza ErrorApi (401/403). */
export async function autenticarApi(req: Request, permiso: Permiso): Promise<ContextoApi> {
  const token = tokenDeCabecera(req.headers.get("authorization"));
  if (!token) throw new ErrorApi(401, "no_autenticado", MENSAJE_401);
  const fila = await prisma.tokenApi.findUnique({ where: { tokenHash: hashTokenApi(token) } });
  const ahora = new Date();
  const error = evaluarToken(fila, permiso, ahora);
  if (error || !fila) throw error ?? new ErrorApi(401, "no_autenticado", MENSAJE_401);
  if (debeActualizarUso(fila.ultimoUso, ahora)) {
    // Condicionado a la misma marca para que dos peticiones simultáneas no escriban dos veces.
    await prisma.tokenApi.updateMany({ where: { id: fila.id, ultimoUso: fila.ultimoUso }, data: { ultimoUso: ahora } }).catch(() => {});
  }
  return { organizationId: fila.organizationId, token: { id: fila.id, prefijo: fila.prefijo, nombre: fila.nombre, permisos: fila.permisos } };
}
