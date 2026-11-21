// Paginación por cursor de la API pública: orden estable por (creadoEn, id), cursor opaco en base64url.
export const LIMITE_POR_DEFECTO = 50;
export const LIMITE_MAXIMO = 100;

export type Cursor = { creadoEn: Date; id: string };

export const codificarCursor = (c: Cursor) => Buffer.from(JSON.stringify([c.creadoEn.toISOString(), c.id])).toString("base64url");

/** null si el cursor no es uno que emitimos nosotros (el cliente no debe fabricarlos). */
export function decodificarCursor(texto: string): Cursor | null {
  try {
    const [fecha, id] = JSON.parse(Buffer.from(texto, "base64url").toString("utf8")) as unknown[];
    if (typeof fecha !== "string" || typeof id !== "string" || !id || id.length > 60) return null;
    const creadoEn = new Date(fecha);
    return Number.isNaN(creadoEn.getTime()) ? null : { creadoEn, id };
  } catch {
    return null;
  }
}

/** `limite` fuera de 1..100 o no entero → null. Ausente → 50. */
export function limiteValido(texto: string | null): number | null {
  if (texto === null || texto === "") return LIMITE_POR_DEFECTO;
  const n = Number(texto);
  return Number.isInteger(n) && n >= 1 && n <= LIMITE_MAXIMO ? n : null;
}

/** Filtro Prisma "después de este cursor" para el orden (campo asc, id asc). */
export const despuesDe = (c: Cursor, campo = "creadoEn") => ({
  OR: [{ [campo]: { gt: c.creadoEn } }, { [campo]: c.creadoEn, id: { gt: c.id } }],
});

/** Recibe hasta `limite + 1` filas ordenadas; devuelve la página y el cursor de la siguiente (null si no hay más). */
export function paginar<T extends { id: string }>(filas: T[], limite: number, fecha: (f: T) => Date): { datos: T[]; siguiente: string | null } {
  const datos = filas.slice(0, limite);
  const ultimo = datos.at(-1);
  return { datos, siguiente: filas.length > limite && ultimo ? codificarCursor({ creadoEn: fecha(ultimo), id: ultimo.id }) : null };
}
