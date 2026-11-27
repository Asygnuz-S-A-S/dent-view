// Calidad de una foto de valoración en el celular del paciente: solo AVISA (nunca bloquea la subida).
// La función pura recibe píxeles RGBA ya reducidos (≈256 px) para poder probarla sin navegador.
export const LADO_ANALISIS = 256;
export const UMBRAL_OSCURA = 60; // luminancia media 0-255
export const UMBRAL_BORROSA = 25; // varianza del laplaciano en gris; por debajo, casi sin bordes

export type AvisoFoto = "OSCURA" | "BORROSA" | "ORIENTACION";
export const TEXTO_AVISO: Record<AvisoFoto, string> = {
  OSCURA: "Se ve oscura. Busca más luz, de frente.",
  BORROSA: "Se ve borrosa. Acerca o aleja un poco el celular y espera a que enfoque.",
  ORIENTACION: "Parece que el celular está girado. Prueba con la orientación que indica la guía.",
};

export type Pixeles = { data: ArrayLike<number>; ancho: number; alto: number };

/** Luminancia media (0-255) y varianza del laplaciano (más alta = más nítida). */
export function medirPixeles({ data, ancho, alto }: Pixeles) {
  const gris = new Float32Array(ancho * alto);
  let suma = 0;
  for (let i = 0; i < gris.length; i++) {
    gris[i] = 0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!;
    suma += gris[i]!;
  }
  let s = 0, s2 = 0, n = 0;
  for (let y = 1; y < alto - 1; y++) {
    for (let x = 1; x < ancho - 1; x++) {
      const i = y * ancho + x;
      const l = gris[i - 1]! + gris[i + 1]! + gris[i - ancho]! + gris[i + ancho]! - 4 * gris[i]!;
      s += l; s2 += l * l; n++;
    }
  }
  return { luminancia: suma / Math.max(1, gris.length), nitidez: n ? s2 / n - (s / n) ** 2 : 0 };
}

/** Avisos de una foto: `orientacion` es la esperada por la guía y `dims` el tamaño real (ya con la rotación EXIF aplicada). */
export function avisosDeFoto(px: Pixeles, orientacion: "vertical" | "horizontal", dims: { ancho: number; alto: number }): AvisoFoto[] {
  const { luminancia, nitidez } = medirPixeles(px);
  const avisos: AvisoFoto[] = [];
  if (luminancia < UMBRAL_OSCURA) avisos.push("OSCURA");
  if (nitidez < UMBRAL_BORROSA) avisos.push("BORROSA");
  const proporcion = dims.ancho / dims.alto;
  if ((orientacion === "vertical" && proporcion > 1.1) || (orientacion === "horizontal" && proporcion < 0.9)) avisos.push("ORIENTACION");
  return avisos;
}

/** Navegador: reduce una copia a 256 px y analiza. Si algo falla (HEIC sin decodificar, sin canvas) no avisa. */
export async function avisosDeArchivo(archivo: Blob, orientacion: "vertical" | "horizontal"): Promise<AvisoFoto[]> {
  try {
    const bmp = await createImageBitmap(archivo, { imageOrientation: "from-image" });
    const k = Math.min(1, LADO_ANALISIS / Math.max(bmp.width, bmp.height));
    const ancho = Math.max(3, Math.round(bmp.width * k)), alto = Math.max(3, Math.round(bmp.height * k));
    const canvas = document.createElement("canvas");
    canvas.width = ancho; canvas.height = alto;
    const c2d = canvas.getContext("2d", { willReadFrequently: true });
    if (!c2d) { bmp.close(); return []; }
    c2d.drawImage(bmp, 0, 0, ancho, alto);
    const dims = { ancho: bmp.width, alto: bmp.height };
    bmp.close();
    return avisosDeFoto({ data: c2d.getImageData(0, 0, ancho, alto).data, ancho, alto }, orientacion, dims);
  } catch {
    return [];
  }
}
