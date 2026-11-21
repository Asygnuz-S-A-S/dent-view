// Re-codificación de imágenes subidas (solo servidor): copia web JPEG y miniatura, sin EXIF/GPS (sharp no copia metadatos).
import decodificarHeic from "heic-decode";
import sharp, { type Sharp } from "sharp";
import type { TipoImagen } from "./imagenes";

export type Procesada = { web: Buffer; thumb: Buffer; ancho: number; alto: number };

export async function procesarImagen(bytes: Uint8Array, mime: TipoImagen): Promise<Procesada> {
  // sharp prebuilt no decodifica HEVC: el HEIC se decodifica con libheif (WASM) a RGBA y sharp lo codifica a JPEG.
  let img: Sharp;
  if (mime === "image/heic") {
    const { width, height, data } = await decodificarHeic({ buffer: Buffer.from(bytes) });
    img = sharp(Buffer.from(data), { raw: { width, height, channels: 4 } });
  } else {
    img = sharp(bytes);
  }
  const web = await img.clone().rotate().flatten({ background: "#ffffff" }).resize(2400, 2400, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer({ resolveWithObject: true });
  const thumb = await sharp(web.data).resize(360, 360, { fit: "inside" }).jpeg({ quality: 75 }).toBuffer();
  return { web: web.data, thumb, ancho: web.info.width, alto: web.info.height };
}
