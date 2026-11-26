// Búsqueda en catálogos embebidos (sin tildes ni mayúsculas). Los catálogos son JSON versionados: para actualizarlos basta
// reemplazar el archivo (mismo formato { version, fuente, items }) y subir `version`; no hay código que tocar.
import cie10 from "./cie10.json";
import cups from "./cups.json";

export type ItemCatalogo = { codigo: string; descripcion: string; tipoRips?: string };
type Catalogo = { version: string; fuente: string; items: ItemCatalogo[] };

export const CUPS: Catalogo = cups;
export const CIE10: Catalogo = cie10;
/** Aviso visible en la UI: los catálogos embebidos son parciales. */
export const AVISO_CATALOGOS = "Catálogo parcial embebido: valida cada código contra las tablas oficiales SISPRO antes de reportar.";

export const normalizar = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

export function buscarCodigos(items: readonly ItemCatalogo[], consulta: string, limite = 20): ItemCatalogo[] {
  const q = normalizar(consulta);
  if (!q) return items.slice(0, limite);
  const palabras = q.split(/\s+/);
  return items
    .filter((i) => normalizar(i.codigo).startsWith(q) || palabras.every((p) => normalizar(i.descripcion).includes(p) || normalizar(i.codigo).includes(p)))
    .slice(0, limite);
}

export const descripcionDe = (items: readonly ItemCatalogo[], codigo: string | null | undefined) => items.find((i) => i.codigo === codigo)?.descripcion ?? null;
export const existeCups = (codigo: string) => CUPS.items.some((i) => i.codigo === codigo);
