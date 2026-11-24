// Lógica pura de las imágenes no DICOM (JPG/PNG/WebP/HEIC) y de las capturas del informe. Sin I/O para poder probarla.
import { z } from "zod";

export const IMG_MAX_BYTES = 25 * 1024 * 1024;
export const IMG_MAX_POR_SUBIDA = 20;
/** Tope del cuerpo completo de una subida (Caddy aplica el mismo): 150 MB aunque 20 x 25 MB sumarían más. */
export const IMG_MAX_PETICION = 150 * 1024 * 1024;
export const MAX_CAPTURAS = 12;
export const MAX_LEYENDA = 200;
export const IMG_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";
export type TipoImagen = "image/jpeg" | "image/png" | "image/webp" | "image/heic";
export const EXTENSION: Record<TipoImagen, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" };
// Marcas ISO-BMFF de HEIC/HEIF con HEVC. "avif" y otras quedan fuera a propósito.
const MARCAS_HEIC = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"]);

/** Tipo real según los primeros bytes (no según extensión ni Content-Type del cliente); null si no es soportado. */
export function tipoDeImagenEstudio(b: Uint8Array): TipoImagen | null {
  const ascii = (i: number, n: number) => String.fromCharCode(...b.slice(i, i + n));
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && ascii(1, 3) === "PNG") return "image/png";
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  if (b.length >= 12 && ascii(4, 4) === "ftyp" && MARCAS_HEIC.has(ascii(8, 4))) return "image/heic";
  return null;
}

/** Mensaje de error si el archivo no es aceptable; null si sirve. */
export function validarImagenEstudio(b: Uint8Array): string | null {
  if (b.length === 0) return "El archivo está vacío";
  if (b.length > IMG_MAX_BYTES) return "El archivo supera los 25 MB";
  return tipoDeImagenEstudio(b) ? null : "Solo se aceptan imágenes JPG, PNG, WebP o HEIC";
}

export const validarCantidad = (n: number) => (n < 1 ? "Elige al menos una imagen" : n > IMG_MAX_POR_SUBIDA ? `Máximo ${IMG_MAX_POR_SUBIDA} imágenes por subida` : null);

const base = (organizationId: string, id: string) => `tenants/${organizationId}/imagenes/${id}`;
/** Clave S3 del original; la copia web y la miniatura viven al lado (ver claveVariante). */
export const claveOriginal = (organizationId: string, id: string, mime: TipoImagen) => `${base(organizationId, id)}/original.${EXTENSION[mime]}`;
export const claveVariante = (claveS3: string, v: "web" | "thumb") => `${claveS3.slice(0, claveS3.lastIndexOf("/"))}/${v}.jpg`;
/** La clave guardada debe pertenecer al centro y a la imagen antes de leerla o borrarla. */
export const claveImagenValida = (key: string, organizationId: string, id: string) => key.startsWith(`${base(organizationId, id)}/`) && !key.includes("..");

/** Filtro Prisma de imágenes visibles: el doctor remitente solo ve las de sus estudios u órdenes (misma regla que filtroEstudios). */
export function filtroImagenes(organizationId: string, usuarioId: string, rol: string) {
  return rol === "doctor_remitente"
    ? { organizationId, OR: [{ estudio: { doctorRemitenteId: usuarioId } }, { orden: { doctorRemitenteId: usuarioId } }] }
    : { organizationId };
}

export const nombreDescarga = (titulo: string | null, original: string, ext: string) => {
  const limpio = (titulo || original).replace(/\.[A-Za-z0-9]{1,5}$/, "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${limpio || "imagen"}.${ext}`;
};

// ---- Capturas del informe ----
const UID = /^[0-9]+(\.[0-9]+)*$/;
export const esquemaCaptura = z.discriminatedUnion("origen", [
  z.object({ origen: z.literal("IMAGEN"), imagenId: z.string().min(1).max(40), leyenda: z.string().trim().max(MAX_LEYENDA).optional() }),
  z.object({ origen: z.literal("DICOM"), estudioUid: z.string().max(64).regex(UID), serieUid: z.string().max(64).regex(UID).nullish(), leyenda: z.string().trim().max(MAX_LEYENDA).optional() }),
]);
export type CapturaEntrada = z.infer<typeof esquemaCaptura>;
export type CapturaFila = { origen: "IMAGEN" | "DICOM"; imagenId: string | null; estudioUid: string | null; serieUid: string | null; orden: number; leyenda: string | null };

const clave = (c: CapturaEntrada) => (c.origen === "IMAGEN" ? `i:${c.imagenId}` : `d:${c.estudioUid}:${c.serieUid ?? ""}`);

/** Valida la selección, descarta repetidas, respeta el orden recibido y lo numera 0..n-1. */
export function normalizarCapturas(entrada: unknown): { capturas: CapturaFila[] } | { error: string } {
  const r = z.array(esquemaCaptura).safeParse(entrada);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Capturas inválidas" };
  const vistas = new Set<string>();
  const unicas = r.data.filter((c) => !vistas.has(clave(c)) && !!vistas.add(clave(c)));
  if (unicas.length > MAX_CAPTURAS) return { error: `Máximo ${MAX_CAPTURAS} capturas por informe` };
  return {
    capturas: unicas.map((c, orden) => ({
      origen: c.origen, imagenId: c.origen === "IMAGEN" ? c.imagenId : null, estudioUid: c.origen === "DICOM" ? c.estudioUid : null,
      serieUid: c.origen === "DICOM" ? (c.serieUid ?? null) : null, orden, leyenda: c.leyenda || null,
    })),
  };
}

/** Mueve el elemento i una posición (-1 arriba, +1 abajo); fuera de rango devuelve la misma lista. */
export function moverCaptura<T>(lista: T[], i: number, delta: -1 | 1): T[] {
  const j = i + delta;
  if (i < 0 || i >= lista.length || j < 0 || j >= lista.length) return lista;
  const copia = [...lista];
  [copia[i], copia[j]] = [copia[j]!, copia[i]!];
  return copia;
}

/** Instancia central de una serie (la axial del medio en un CBCT). Ordena por IndexInSeries; sin índice conserva el orden dado. */
export function instanciaCentral<T extends { ID: string; IndexInSeries?: number }>(instancias: T[]): T | null {
  if (instancias.length === 0) return null;
  const orden = [...instancias].sort((a, b) => (a.IndexInSeries ?? 0) - (b.IndexInSeries ?? 0));
  return orden[Math.floor((orden.length - 1) / 2)]!;
}
