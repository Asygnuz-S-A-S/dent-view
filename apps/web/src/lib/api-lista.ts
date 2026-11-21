// Lista paginada genérica de /api/v1: filtros + cursor + actualizadoDesde → { datos, siguienteCursor }.
import { despuesDe, paginar } from "./api-paginacion";
import { parametrosLista, type RespuestaApi } from "./api-ruta";

export async function listarApi<T extends { id: string }>(url: URL, o: {
  /** Filtros propios del recurso; SIEMPRE incluye organizationId. */
  filtros: object;
  /** Campo de creación usado para el orden y el cursor (por defecto creadoEn). */
  campo?: string;
  /** Campo para `actualizadoDesde`; los modelos sin columna de actualización usan el de creación. */
  campoActualizado?: string;
  consulta: (a: { where: object; orderBy: object[]; take: number }) => Promise<T[]>;
  fecha: (fila: T) => Date;
  mapear: (fila: T) => unknown;
}): Promise<RespuestaApi> {
  const { limite, cursor, desde } = parametrosLista(url);
  const campo = o.campo ?? "creadoEn";
  const where = {
    AND: [o.filtros, ...(cursor ? [despuesDe(cursor, campo)] : []), ...(desde ? [{ [o.campoActualizado ?? campo]: { gte: desde } }] : [])],
  };
  const filas = await o.consulta({ where, orderBy: [{ [campo]: "asc" }, { id: "asc" }], take: limite + 1 });
  const { datos, siguiente } = paginar(filas, limite, o.fecha);
  return { status: 200, body: { datos: datos.map(o.mapear), siguienteCursor: siguiente } };
}
