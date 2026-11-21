// Autenticación del servidor MCP: los mismos tokens `dvk_…` de la API pública. El centro sale SIEMPRE del token, nunca del cliente.
import { prisma } from "@dent-view/db";
import { estadoToken, hashTokenApi, permisosValidos, tokenDeCabecera, type Permiso } from "../api-token";

export type ContextoMcp = { tokenId: string; prefijo: string; organizationId: string; permisos: Permiso[] };
export type ResultadoAuth = { ok: true; ctx: ContextoMcp } | { ok: false; estado: 401 | 429 };

type Db = { tokenApi: Pick<typeof prisma.tokenApi, "findUnique" | "update"> };

// shortcut: límite en memoria por proceso (no se comparte entre réplicas), pasar a Redis/BD si se escala a varias instancias.
const VENTANA_MS = 60_000;
export const LIMITE_POR_MINUTO = 60;
const ventanas = new Map<string, number[]>();

/** Ventana deslizante por token. Devuelve false si se excede el límite. */
export function dentroDelLimite(tokenId: string, ahora = Date.now()) {
  const recientes = (ventanas.get(tokenId) ?? []).filter((t) => ahora - t < VENTANA_MS);
  if (recientes.length >= LIMITE_POR_MINUTO) {
    ventanas.set(tokenId, recientes);
    return false;
  }
  recientes.push(ahora);
  ventanas.set(tokenId, recientes);
  if (ventanas.size > 5000) for (const [k, v] of ventanas) if (v.every((t) => ahora - t >= VENTANA_MS)) ventanas.delete(k);
  return true;
}

export async function autenticarMcp(cabeceraAuth: string | null, db: Db = prisma, ahora = new Date()): Promise<ResultadoAuth> {
  const token = tokenDeCabecera(cabeceraAuth);
  if (!token) return { ok: false, estado: 401 };
  const fila = await db.tokenApi.findUnique({ where: { tokenHash: hashTokenApi(token) } });
  if (!fila || estadoToken(fila, ahora) !== "ACTIVO") return { ok: false, estado: 401 };
  // Solo tokens creados como "servidor MCP": un token de la API REST no abre el MCP (ni al revés).
  if (!fila.permisos.includes("mcp")) return { ok: false, estado: 401 };
  if (!dentroDelLimite(fila.id, ahora.getTime())) return { ok: false, estado: 429 };
  // Mejor esfuerzo y a lo sumo una vez por minuto: no debe tumbar la petición.
  if (!fila.ultimoUso || ahora.getTime() - fila.ultimoUso.getTime() > VENTANA_MS) {
    void db.tokenApi.update({ where: { id: fila.id }, data: { ultimoUso: ahora } }).catch(() => {});
  }
  return { ok: true, ctx: { tokenId: fila.id, prefijo: fila.prefijo, organizationId: fila.organizationId, permisos: permisosValidos(fila.permisos) } };
}
