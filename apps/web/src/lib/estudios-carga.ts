// Lógica pura de "Cargar estudios": reconocer el tipo real de un archivo por su firma, validar límites por categoría y
// decidir el destino (imagen/documento por /api/imagenes, DICOM/ZIP por /api/estudios/cargar). Sin I/O: la usan cliente, servidor y pruebas.
import { IMG_MAX_BYTES, IMG_MAX_POR_SUBIDA, tipoDeImagenEstudio, type TipoImagen } from "./imagenes";

export const CATEGORIAS = ["foto", "radiografia", "orden", "documento"] as const;
export type Categoria = (typeof CATEGORIAS)[number];
export const ETIQUETA_CATEGORIA: Record<Categoria, string> = { foto: "Fotografía", radiografia: "Radiografía", orden: "Orden médica / remisión", documento: "Otro documento" };

export const PDF_MAX_BYTES = 20 * 1024 * 1024;
export const DICOM_MAX_BYTES = 1024 * 1024 * 1024;
export const MAX_ARCHIVOS_IMAGEN = IMG_MAX_POR_SUBIDA;
/** Bytes que bastan para reconocer cualquier firma soportada (DICOM necesita 132; el PDF admite su cabecera hasta el byte 1024). */
export const BYTES_FIRMA = 1024;
export const ESTADOS_ORDEN_CARGA = ["SOLICITADA", "AGENDADA", "TOMADA"] as const;

export type TipoArchivo = { tipo: "imagen"; mime: TipoImagen } | { tipo: "pdf" } | { tipo: "dicom" } | { tipo: "zip" };
export type Destino = "imagen" | "documento" | "dicom";

const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

/** Tipo real según los primeros bytes; ignora extensión y Content-Type del cliente. */
export function tipoDeArchivo(b: Uint8Array): TipoArchivo | null {
  const mime = tipoDeImagenEstudio(b);
  if (mime) return { tipo: "imagen", mime };
  if (b.length >= 132 && ascii(b, 128, 4) === "DICM") return { tipo: "dicom" };
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return { tipo: "zip" };
  if (ascii(b, 0, BYTES_FIRMA).includes("%PDF-")) return { tipo: "pdf" };
  return null;
}

export type ResultadoValidacion = { ok: true; destino: Destino; tipo: TipoArchivo } | { ok: false; error: string };

/** Valida un archivo para la categoría elegida: firma real, tipo permitido y tope de tamaño. `cabeza` son sus primeros bytes. */
export function validarCarga(categoria: Categoria, cabeza: Uint8Array, bytes: number): ResultadoValidacion {
  if (bytes === 0) return { ok: false, error: "El archivo está vacío" };
  const t = tipoDeArchivo(cabeza);
  if (!t) return { ok: false, error: "Formato no reconocido: el contenido no corresponde a una imagen, PDF o DICOM" };
  const destino: Destino | null =
    t.tipo === "imagen" ? "imagen"
    : t.tipo === "pdf" ? (categoria === "orden" || categoria === "documento" ? "documento" : null)
    : categoria === "radiografia" ? "dicom" : null;
  if (!destino) {
    const permitido = { foto: "imágenes JPG, PNG, WebP o HEIC", radiografia: "imágenes JPG, PNG, WebP o HEIC, DICOM (.dcm) o ZIP de DICOM", orden: "PDF o imagen", documento: "PDF" }[categoria];
    return { ok: false, error: `En «${ETIQUETA_CATEGORIA[categoria]}» solo se aceptan ${permitido}` };
  }
  if (categoria === "documento" && t.tipo !== "pdf") return { ok: false, error: "En «Otro documento» solo se aceptan archivos PDF" };
  const max = destino === "dicom" ? DICOM_MAX_BYTES : destino === "documento" ? PDF_MAX_BYTES : IMG_MAX_BYTES;
  if (bytes > max) return { ok: false, error: `El archivo supera el máximo de ${max / 1024 ** (destino === "dicom" ? 3 : 2)} ${destino === "dicom" ? "GB" : "MB"}` };
  return { ok: true, destino, tipo: t };
}

/** Categoría sugerida por tipo y nombre; el usuario siempre puede cambiarla. */
export function sugerirCategoria(nombre: string, t: TipoArchivo | null): Categoria {
  if (!t) return "foto";
  if (t.tipo === "pdf") return /orden|remisi|formula|fórmula/i.test(nombre) ? "orden" : "documento";
  if (t.tipo === "dicom" || t.tipo === "zip") return "radiografia";
  return /rx|radio|pano|cefal|periapical|bitewing|cbct/i.test(nombre) ? "radiografia" : /orden|remisi/i.test(nombre) ? "orden" : "foto";
}

// ---- Convención de categoría en ImagenEstudio (sin campo propio en el esquema): nombre del archivo dentro de la clave S3. ----
// tenants/<org>/imagenes/<id>/<raiz>.<ext>. "original" es lo histórico (Radiografías e imágenes); las copias web/miniatura viven al lado.
const RAIZ: Record<Categoria, string> = { foto: "foto", radiografia: "original", orden: "orden", documento: "documento" };
export const claveCarga = (organizationId: string, id: string, categoria: Categoria, ext: string) => `tenants/${organizationId}/imagenes/${id}/${RAIZ[categoria]}.${ext}`;
export function categoriaDeClave(claveS3: string): Categoria {
  const raiz = claveS3.slice(claveS3.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "");
  return (CATEGORIAS.find((c) => RAIZ[c] === raiz) ?? "radiografia");
}
export const esDocumento = (c: Categoria) => c === "orden" || c === "documento";

/** PatientID DICOM (VR LO: máx. 64, sin "\" ni caracteres de control) a partir del documento del paciente; null si queda vacío. */
export function normalizarPatientId(documento: string): string | null {
  const v = documento.replace(/[\\\u0000-\u001f\u007f]/g, "").trim().slice(0, 64);
  return v || null;
}
