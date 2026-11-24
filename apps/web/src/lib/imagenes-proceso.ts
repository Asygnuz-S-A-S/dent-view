// Re-codificación de imágenes subidas (solo servidor): copia web JPEG y miniatura, sin EXIF/GPS (sharp no copia metadatos).
import decodificarHeic from "heic-decode";
import sharp, { type Sharp } from "sharp";
import type { TipoImagen } from "./imagenes";

export type Procesada = { web: Buffer; thumb: Buffer; ancho: number; alto: number };

// Una imagen pequeña en bytes puede declarar dimensiones enormes (bomba de descompresión): se rechaza antes de decodificar.
export const IMG_MAX_PIXELES = 50_000_000;
export const IMG_MAX_LADO = 12_000;
/** Error con mensaje apto para mostrar al usuario. */
export class ImagenInvalida extends Error {}

export function validarDimensiones(ancho: number | undefined, alto: number | undefined) {
  if (!ancho || !alto) throw new ImagenInvalida("No se pudo leer el tamaño de la imagen");
  if (ancho > IMG_MAX_LADO || alto > IMG_MAX_LADO || ancho * alto > IMG_MAX_PIXELES) throw new ImagenInvalida("La imagen es demasiado grande (máximo 50 megapíxeles y 12000 px por lado)");
}

const OPCIONES = { limitInputPixels: IMG_MAX_PIXELES };

export async function procesarImagen(bytes: Uint8Array, mime: TipoImagen): Promise<Procesada> {
  // sharp prebuilt no decodifica HEVC: el HEIC se decodifica con libheif (WASM) a RGBA y sharp lo codifica a JPEG.
  let img: Sharp;
  if (mime === "image/heic") {
    const imagenes = await decodificarHeic.all({ buffer: Buffer.from(bytes) });
    try {
      const primera = imagenes[0];
      if (!primera) throw new ImagenInvalida("No se encontró ninguna imagen en el archivo HEIC");
      validarDimensiones(primera.width, primera.height);
      const { width, height, data } = await primera.decode();
      img = sharp(Buffer.from(data), { ...OPCIONES, raw: { width, height, channels: 4 } });
    } finally {
      imagenes.dispose();
    }
  } else {
    // Solo lee la cabecera (sin límite para que el rechazo salga con nuestro mensaje); el decode sí va con límite.
    const m = await sharp(bytes, { limitInputPixels: false }).metadata();
    validarDimensiones(m.width, m.height);
    img = sharp(bytes, OPCIONES);
  }
  const web = await img.clone().rotate().flatten({ background: "#ffffff" }).resize(2400, 2400, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer({ resolveWithObject: true });
  const thumb = await sharp(web.data, OPCIONES).resize(360, 360, { fit: "inside" }).jpeg({ quality: 75 }).toBuffer();
  return { web: web.data, thumb, ancho: web.info.width, alto: web.info.height };
}
