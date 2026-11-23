// Compresión en el cliente antes de subir: lado máximo 1920 px y JPEG ~0.8 (también quita EXIF/GPS al redibujar en canvas).
export const LADO_MAX = 1920;
export const CALIDAD_JPEG = 0.8;

/** Tamaño final conservando la proporción; nunca agranda. */
export function dimensionesFinales(ancho: number, alto: number, max = LADO_MAX) {
  const k = Math.min(1, max / Math.max(ancho, alto));
  return { ancho: Math.max(1, Math.round(ancho * k)), alto: Math.max(1, Math.round(alto * k)) };
}

/** Devuelve un JPEG comprimido; si el navegador no puede decodificar la imagen (p. ej. HEIC en Chrome) devuelve el archivo tal cual y el servidor lo procesa. */
export async function comprimirImagen(archivo: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(archivo, { imageOrientation: "from-image" });
    const { ancho, alto } = dimensionesFinales(bmp.width, bmp.height);
    const canvas = document.createElement("canvas");
    canvas.width = ancho; canvas.height = alto;
    const c2d = canvas.getContext("2d");
    if (!c2d) return archivo;
    c2d.fillStyle = "#fff"; c2d.fillRect(0, 0, ancho, alto);
    c2d.drawImage(bmp, 0, 0, ancho, alto);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", CALIDAD_JPEG));
    return blob ?? archivo;
  } catch {
    return archivo;
  }
}

/** Duración en segundos de un video local; null si el navegador no puede leer los metadatos (p. ej. HEVC en Chrome). */
export function duracionVideo(archivo: File): Promise<number | null> {
  return new Promise((resolver) => {
    const url = URL.createObjectURL(archivo);
    const v = document.createElement("video");
    const fin = (d: number | null) => { URL.revokeObjectURL(url); resolver(d); };
    v.preload = "metadata";
    v.onloadedmetadata = () => fin(Number.isFinite(v.duration) ? v.duration : null);
    v.onerror = () => fin(null);
    setTimeout(() => fin(null), 8000);
    v.src = url;
  });
}
