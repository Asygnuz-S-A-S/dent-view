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

// ---- Valoración virtual: una imagen estilizada por toma (retratos, perfiles, intraorales, oclusales, zona inflamada, radiografía). Nada es una persona real. ----
const marca = (w: number, h: number, claro = true) => `<text x="${w / 2}" y="${h - 22}" font-family="${FUENTE}" font-size="22" fill="${claro ? "#ffffff" : "#222222"}" fill-opacity="0.7" text-anchor="middle">DEMO · imagen sintética</text>`;
const dientesArco = (cx: number, cy: number, rx: number, ry: number, n: number, ancho: number, caries = -1) =>
  Array.from({ length: n }, (_, i) => {
    const a = Math.PI * (0.08 + (0.84 * i) / (n - 1));
    const x = cx + rx * Math.cos(a), y = cy + ry * Math.sin(a);
    return `<rect x="${(x - ancho / 2).toFixed(1)}" y="${(y - ancho / 2).toFixed(1)}" width="${ancho}" height="${ancho + 8}" rx="${ancho / 3}" fill="#f7f3ea" stroke="#d9d2c0" stroke-width="2" transform="rotate(${((a * 180) / Math.PI - 90).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})"/>${i === caries ? `<circle cx="${x.toFixed(1)}" cy="${(y + 4).toFixed(1)}" r="7" fill="#6b4a2b" fill-opacity="0.85"/>` : ""}`;
  }).join("");

/** JPEG sintético de una toma de valoración (`angulo` = AnguloMedia); `variante` cambia el tono y el detalle para que no se repitan. */
export function fotoValoracionJpeg(angulo: string, variante = 0) {
  const tono = (variante * 29) % 40; // tonos de piel ficticios
  const piel = `hsl(${22 + (tono % 12)},${42 + (tono % 10)}%,${62 - (tono % 18)}%)`;
  let w = 640, h = 800, cuerpo = "", fondo = "#dfe7ee", claro = false;
  const retrato = (sonrisa: boolean) => `<ellipse cx="320" cy="400" rx="170" ry="215" fill="${piel}"/><path d="M150 360 Q320 100 490 360 Q470 190 320 170 Q170 190 150 360Z" fill="#3b2a22"/>
    <ellipse cx="255" cy="360" rx="20" ry="11" fill="#fff"/><ellipse cx="385" cy="360" rx="20" ry="11" fill="#fff"/><circle cx="255" cy="360" r="7" fill="#3b2a22"/><circle cx="385" cy="360" r="7" fill="#3b2a22"/>
    <path d="M320 380 L305 450 Q320 460 335 450Z" fill="#000" fill-opacity="0.12"/>
    ${sonrisa ? `<path d="M240 505 Q320 580 400 505 Q320 530 240 505Z" fill="#f7f3ea" stroke="#a8454d" stroke-width="6"/>` : `<path d="M260 520 Q320 535 380 520" fill="none" stroke="#a8454d" stroke-width="8" stroke-linecap="round"/>`}
    <rect x="200" y="590" width="240" height="210" fill="#4b6584"/>`;
  const perfil = (izq: boolean) => `<g transform="${izq ? "translate(640 0) scale(-1 1)" : ""}"><path d="M200 120 Q420 90 470 300 L520 400 L480 420 L495 470 Q470 520 430 520 L420 600 Q380 700 250 690 Q150 560 200 120Z" fill="${piel}"/><path d="M200 120 Q330 60 440 200 Q300 160 200 300Z" fill="#3b2a22"/><circle cx="400" cy="330" r="9" fill="#3b2a22"/></g>`;
  const intra = (lado: number) => {
    w = 800; h = 600; fondo = "#3a2b2b"; claro = true;
    return `<path d="M40 190 Q400 70 760 190 L760 420 Q400 520 40 420Z" fill="#a8454d"/><path d="M90 240 Q400 140 710 240 L710 380 Q400 460 90 380Z" fill="#7d2f37"/>
      ${Array.from({ length: 9 }, (_, i) => `<rect x="${150 + i * 58 + lado * (i - 4) * 4}" y="${235 + Math.abs(i - 4) * 8}" width="52" height="${96 - (i === 0 || i === 8 ? 12 : 0)}" rx="16" fill="#f7f3ea" stroke="#d9d2c0" stroke-width="2"/>`).join("")}`;
  };
  switch (angulo) {
    case "FRONTAL_REPOSO": cuerpo = retrato(false); break;
    case "SONRISA": cuerpo = retrato(true); break;
    case "LATERAL_DERECHA": cuerpo = perfil(false); break;
    case "LATERAL_IZQUIERDA": cuerpo = perfil(true); break;
    case "INTRAORAL_FRONTAL": cuerpo = intra(0); break;
    case "INTRAORAL_DERECHA": cuerpo = intra(1); break;
    case "INTRAORAL_IZQUIERDA": cuerpo = intra(-1); break;
    case "OCLUSAL_SUPERIOR": case "OCLUSAL_INFERIOR": {
      w = 800; h = 600; fondo = "#3a2b2b"; claro = true;
      const sup = angulo === "OCLUSAL_SUPERIOR";
      cuerpo = `<ellipse cx="400" cy="${sup ? 250 : 300}" rx="310" ry="${sup ? 230 : 210}" fill="#7d2f37"/>${dientesArco(400, sup ? 170 : 200, 250, sup ? 230 : 200, 14, 44, variante % 3 === 0 ? 9 : -1)}
        ${sup ? `<path d="M300 330 Q400 400 500 330 Q400 360 300 330Z" fill="#c0606a"/>` : `<ellipse cx="400" cy="400" rx="150" ry="70" fill="#c0606a"/>`}`;
      break;
    }
    case "ZONA_DOLOR":
      w = 800; h = 600; fondo = "#3a2b2b"; claro = true;
      cuerpo = `<path d="M0 200 Q400 120 800 200 L800 420 Q400 500 0 420Z" fill="#a8454d"/><circle cx="470" cy="300" r="95" fill="#d23c4a" fill-opacity="0.75"/><circle cx="470" cy="300" r="55" fill="#e8636f" fill-opacity="0.8"/>
        ${Array.from({ length: 6 }, (_, i) => `<rect x="${110 + i * 105}" y="230" width="92" height="140" rx="30" fill="#f7f3ea" stroke="#d9d2c0" stroke-width="2"/>`).join("")}<ellipse cx="520" cy="320" rx="14" ry="18" fill="#6b4a2b" fill-opacity="0.85"/>`;
      break;
    case "RADIOGRAFIA":
      w = 960; h = 480; fondo = "#101418"; claro = true;
      cuerpo = `<path d="M80 150 Q480 40 880 150 L880 330 Q480 450 80 330Z" fill="#2a3138"/><path d="M120 240 Q480 160 840 240" fill="none" stroke="#9aa5ae" stroke-width="10" stroke-opacity="0.5"/>
        ${Array.from({ length: 14 }, (_, i) => `<g transform="translate(${130 + i * 52} ${215 + Math.abs(i - 6.5) * 9})"><rect width="38" height="70" rx="12" fill="#d7dde2" fill-opacity="0.9"/><rect x="14" y="62" width="10" height="${50 + (i % 3) * 8}" rx="4" fill="#aeb8c0"/><rect x="12" y="14" width="14" height="30" rx="6" fill="#59636b"/></g>`).join("")}`;
      break;
    default: // OTRO y cualquier toma sin dibujo propio
      w = 800; h = 600; fondo = "#e8e2d6"; cuerpo = `<rect x="200" y="140" width="400" height="320" rx="40" fill="#d6cbb8"/><circle cx="400" cy="300" r="90" fill="#f7f3ea" stroke="#b9ae9a" stroke-width="6"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${fondo}"/>${cuerpo}${marca(w, h, claro)}</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 78 }).toBuffer();
}
