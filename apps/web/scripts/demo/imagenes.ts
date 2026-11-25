// Imágenes sintéticas con sharp (ya instalado): logos, fotos de perfil y fotos clínicas estilizadas. Nada es una persona real.
import sharp from "sharp";

const FUENTE = "DejaVu Sans, Helvetica, Arial, sans-serif";

export async function logoDataUrl(iniciales: string, color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    <rect width="128" height="128" rx="28" fill="${color}"/>
    <circle cx="64" cy="64" r="50" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="3"/>
    <text x="64" y="80" font-family="${FUENTE}" font-size="46" font-weight="700" fill="#ffffff" text-anchor="middle">${iniciales}</text></svg>`;
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

/** Foto de perfil ficticia (silueta con iniciales sobre degradado), JPEG 320x320. */
export function avatarJpeg(iniciales: string, tono: number) {
  const h = (tono * 47) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},55%,72%)"/><stop offset="1" stop-color="hsl(${(h + 40) % 360},50%,48%)"/></linearGradient></defs>
    <rect width="320" height="320" fill="url(#g)"/>
    <circle cx="160" cy="125" r="62" fill="#ffffff" fill-opacity="0.85"/>
    <ellipse cx="160" cy="330" rx="120" ry="110" fill="#ffffff" fill-opacity="0.85"/>
    <text x="160" y="146" font-family="${FUENTE}" font-size="52" font-weight="700" fill="hsl(${h},45%,30%)" text-anchor="middle">${iniciales}</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
}

/** Foto intraoral estilizada (no es una persona real): encía, dientes y marca "DEMO". */
export function fotoClinicaJpeg(variante: number, ancho = 960, alto = 720) {
  const dientes = Array.from({ length: 10 }, (_, i) => {
    const x = 170 + i * 62;
    const dy = Math.abs(i - 4.5) * 7;
    const caries = variante % 3 === 0 && i === 6 ? `<ellipse cx="${x + 28}" cy="${300 + dy + 40}" rx="9" ry="12" fill="#6b4a2b" fill-opacity="0.8"/>` : "";
    return `<rect x="${x}" y="${290 + dy}" width="56" height="${96 - (i === 0 || i === 9 ? 14 : 0)}" rx="18" fill="#f7f3ea" stroke="#d9d2c0" stroke-width="2"/>${caries}`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 960 720">
    <rect width="960" height="720" fill="#3a2b2b"/>
    <path d="M60 250 Q480 120 900 250 L900 470 Q480 560 60 470 Z" fill="#a8454d"/>
    <path d="M110 300 Q480 190 850 300 L850 420 Q480 500 110 420 Z" fill="#7d2f37"/>
    ${dientes}
    <path d="M60 250 Q480 120 900 250" fill="none" stroke="#c0606a" stroke-width="14"/>
    <text x="480" y="640" font-family="${FUENTE}" font-size="30" fill="#ffffff" fill-opacity="0.55" text-anchor="middle">DEMO · imagen sintética ${variante}</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
}

export const miniatura = (jpeg: Buffer, ancho = 240) => sharp(jpeg).resize({ width: ancho }).jpeg({ quality: 70 }).toBuffer();
