// Marca del centro (white-label): deriva las variables CSS del tema a partir de un color hex validado.
import { z } from "zod";

const HEX = /^#[0-9a-f]{6}$/;
const BLANCO = "#ffffff";
const OSCURO = "#171717"; // texto oscuro del tema (≈ neutral-900)
const FONDO_OSCURO = "#0a0a0a"; // --background del modo oscuro (oklch 0.145)

/** Logo del centro: data URL PNG/JPEG pequeño (misma regla que el membrete de informes). */
export const esquemaLogo = z
  .string()
  .max(300_000, "El logo es muy pesado")
  .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/, "El logo debe ser PNG o JPEG");

/** "#0E6B8A" → "#0e6b8a"; cualquier otra cosa (incluidos intentos de inyectar CSS) → null. */
export function normalizarHex(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const v = valor.trim().toLowerCase();
  return HEX.test(v) ? v : null;
}

const canales = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const aHex = (rgb: number[]) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;

/** Luminancia relativa WCAG 2.x. */
function luminancia(hex: string) {
  const [r, g, b] = canales(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** Razón de contraste WCAG (1 a 21). */
export function contraste(a: string, b: string) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
}

const mezclar = (hex: string, destino: string, t: number) => {
  const d = canales(destino);
  return aHex(canales(hex).map((c, i) => c + (d[i]! - c) * t));
};

/** Texto sobre el color: blanco si cumple AA (4.5:1); si no, oscuro (siempre cumple porque el blanco no). */
export function textoSobre(hex: string) {
  if (contraste(hex, BLANCO) >= 4.5) return BLANCO;
  return contraste(hex, OSCURO) >= 4.5 ? OSCURO : "#000000";
}

/** Aclara u oscurece el color en pasos de 5 % hasta lograr `minimo` contra `fondo`. */
export function ajustarContraste(hex: string, fondo: string, minimo: number) {
  const destino = luminancia(fondo) < 0.5 ? BLANCO : "#000000";
  let c = hex;
  for (let t = 0.05; contraste(c, fondo) < minimo && t <= 1; t += 0.05) c = mezclar(hex, destino, t);
  return c;
}

export type TemaMarca = {
  claro: { primario: string; texto: string };
  oscuro: { primario: string; texto: string };
  /** Contraste del texto sobre el botón (claro) y del color sobre fondo blanco (enlaces, bordes). */
  contrasteTexto: number;
  contrasteFondo: number;
  aviso: string | null;
};

/** Paleta claro/oscuro del centro. El texto siempre cumple AA; en oscuro el color se aclara para leerse sobre el fondo. */
export function temaMarca(hex: string): TemaMarca {
  const texto = textoSobre(hex);
  const primarioOscuro = ajustarContraste(hex, FONDO_OSCURO, 4.5);
  const contrasteFondo = contraste(hex, BLANCO);
  return {
    claro: { primario: hex, texto },
    oscuro: { primario: primarioOscuro, texto: textoSobre(primarioOscuro) },
    contrasteTexto: contraste(hex, texto),
    contrasteFondo,
    aviso: contrasteFondo < 3 ? "Es un color muy claro: sobre fondo blanco los enlaces y bordes se verán poco. Prefiere un tono más oscuro." : null,
  };
}

/** Reglas CSS que sobrescriben el tema de dent-view; null si el color no es un hex válido. */
export function cssMarca(color: unknown): string | null {
  const hex = normalizarHex(color);
  if (!hex) return null;
  const { claro, oscuro } = temaMarca(hex);
  const vars = ({ primario, texto }: { primario: string; texto: string }) =>
    `--primary:${primario};--primary-foreground:${texto};--ring:${primario};--sidebar-primary:${primario};--sidebar-primary-foreground:${texto};--sidebar-ring:${primario};`;
  // .dark va después para ganarle a :root con la misma especificidad.
  return `:root{${vars(claro)}}.dark{${vars(oscuro)}}`;
}
