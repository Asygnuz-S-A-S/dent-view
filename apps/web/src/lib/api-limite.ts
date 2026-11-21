// Límite de peticiones por token (ventana fija de 1 minuto). Lógica pura sobre un mapa.
export const MAX_PETICIONES = 120;
export const VENTANA_MS = 60_000;

type Ventana = { inicio: number; cuenta: number };
export type ResultadoLimite = { permitido: boolean; limite: number; restantes: number; restablecerEnSeg: number };

/** Cuenta una petición para `clave`. Limpia ventanas vencidas cuando el mapa crece. */
export function contarPeticion(mapa: Map<string, Ventana>, clave: string, ahora: number, max = MAX_PETICIONES, ventana = VENTANA_MS): ResultadoLimite {
  if (mapa.size > 5000) for (const [k, v] of mapa) if (ahora - v.inicio >= ventana) mapa.delete(k);
  let v = mapa.get(clave);
  if (!v || ahora - v.inicio >= ventana) mapa.set(clave, (v = { inicio: ahora, cuenta: 0 }));
  v.cuenta++;
  return { permitido: v.cuenta <= max, limite: max, restantes: Math.max(0, max - v.cuenta), restablecerEnSeg: Math.max(1, Math.ceil((v.inicio + ventana - ahora) / 1000)) };
}

// shortcut: contadores en memoria del proceso; con varias réplicas el límite efectivo se multiplica. Pasar a Redis al escalar.
const global_ = new Map<string, Ventana>();
export const limitarToken = (tokenId: string, ahora = Date.now()) => contarPeticion(global_, tokenId, ahora);
