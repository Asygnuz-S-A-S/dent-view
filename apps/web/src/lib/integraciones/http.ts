// Cliente HTTP de los adaptadores: tiempo de espera y reintentos con espera creciente. Solo recibe URLs fijas del adaptador.
import { ErrorConector } from "./tipos.ts";

export type OpcionesHttp = { intentos?: number; timeoutMs?: number; esperaMs?: number; fetch?: typeof fetch };

const reintentable = (estado: number) => estado === 429 || estado >= 500;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET JSON. Lanza ErrorConector con mensaje seguro (sin URL con parámetros ni cuerpo de la respuesta). */
export async function obtenerJson(url: string, cabeceras: Record<string, string>, o: OpcionesHttp = {}): Promise<unknown> {
  const { intentos = 3, timeoutMs = 15_000, esperaMs = 500, fetch: f = fetch } = o;
  let ultimo = "No se pudo conectar con el proveedor";
  for (let i = 0; i < intentos; i++) {
    if (i > 0) await dormir(esperaMs * 2 ** (i - 1));
    try {
      const r = await f(url, { headers: { Accept: "application/json", ...cabeceras }, signal: AbortSignal.timeout(timeoutMs), redirect: "error" });
      if (r.ok) return await r.json();
      ultimo = `El proveedor respondió ${r.status}`;
      if (!reintentable(r.status)) throw new ErrorConector(ultimo);
    } catch (e) {
      if (e instanceof ErrorConector) throw e;
      ultimo = e instanceof Error && e.name === "TimeoutError" ? "El proveedor no respondió a tiempo" : "No se pudo conectar con el proveedor";
    }
  }
  throw new ErrorConector(ultimo);
}
