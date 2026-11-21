// Layout único de los correos: tablas + CSS inline (Gmail/Outlook/Apple Mail), 600 px, modo oscuro con prefers-color-scheme.
// Puro (sin red ni Prisma). Todo valor dinámico se escapa y los colores solo entran si pasan la validación hex de marca.ts.
import { ajustarContraste, normalizarHex, temaMarca } from "../marca";
import { escaparHtml as esc } from "../notificaciones";

export type Marca = {
  nombre: string;
  /** Hex ya validado (se vuelve a validar al renderizar). */
  color: string;
  logo?: { contentType: string; datos: Buffer } | null;
  direccion?: string | null;
  telefono?: string | null;
  correo?: string | null;
  /** true = marca neutra de la plataforma (sin centro). */
  plataforma?: boolean;
};

/** Marca por defecto (correos sin centro o usuarios de varios centros). Único lugar donde se define. */
export const MARCA_PLATAFORMA: Marca = { nombre: "dent-view", color: "#0e6b8a", plataforma: true };

export type Vista = {
  titulo?: string;
  /** Texto oculto que muestran las bandejas junto al asunto. */
  preheader?: string;
  boton?: { texto: string; url: string };
  /** Valor destacado en caja (p. ej. código de acceso). */
  destacado?: string;
  aviso?: string;
};

export const CID_LOGO = "logo-centro@dent-view";
const MAX_LOGO = 300_000;
const LOGO_RE = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/;

/** Decodifica un data URL de logo (solo png/jpeg/webp y tamaño acotado; nunca SVG). */
export function decodificarLogo(dataUrl: string | null | undefined): Marca["logo"] {
  const m = dataUrl && dataUrl.length <= MAX_LOGO * 1.4 ? LOGO_RE.exec(dataUrl) : null;
  if (!m) return null;
  const datos = Buffer.from(m[2]!, "base64");
  return datos.length && datos.length <= MAX_LOGO ? { contentType: m[1]!, datos } : null;
}

const SEGURA = /^https?:\/\/[^\s<>"']+$/i;
export const urlSegura = (u: string) => SEGURA.test(u);
const URL_RE = /https?:\/\/[^\s<>"']+/i;
export const primerUrl = (t: string) => URL_RE.exec(t)?.[0] ?? null;

/** Mismas reglas que un correo mínimo: sin espacios, comas ni ángulos (evita inyectar cabeceras o varios destinatarios). */
export const correoValido = (c: string | null | undefined): c is string => !!c && /^[^\s<>,;"']+@[^\s<>,;"']+\.[^\s<>,;"']+$/.test(c);

const PRIVACIDAD =
  "Este mensaje es confidencial y va dirigido solo a su destinatario. Tratamos tus datos personales conforme a la Ley 1581 de 2012 (Habeas Data); para ejercer tus derechos, escríbenos al correo del centro.";

const FUENTE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Quita la URL de la línea; una etiqueta que terminaba en ":" ("Ábralo en: URL") se descarta entera. */
function sinUrl(linea: string, url: string) {
  const resto = linea.replace(url, "").trim();
  if (!resto || /[:：]$/.test(resto)) return "";
  return resto.replace(/\s+en(?: este enlace)?$/i, "").replace(/[.\s]+$/, "") + ".";
}

export function renderCorreo(e: { cuerpo: string; vista?: Vista; marca?: Marca; asunto: string }) {
  const marca = e.marca ?? MARCA_PLATAFORMA;
  const v = e.vista ?? {};
  const hex = normalizarHex(marca.color) ?? MARCA_PLATAFORMA.color;
  const t = temaMarca(hex);
  const enlaceClaro = ajustarContraste(hex, "#ffffff", 4.5);
  const boton = v.boton && urlSegura(v.boton.url) ? v.boton : null;
  const lineas = e.cuerpo.split("\n").map((l) => l.trim()).filter(Boolean);
  const parrafos = boton ? lineas.map((l) => (l.includes(boton.url) ? sinUrl(l, boton.url) : l)).filter(Boolean) : lineas;
  const nombre = marca.nombre.replace(/[\r\n]+/g, " ").trim() || MARCA_PLATAFORMA.nombre;
  const contacto = [marca.direccion, marca.telefono, marca.correo].map((c) => c?.trim()).filter(Boolean) as string[];

  const logo = marca.logo ? { cid: CID_LOGO, ...marca.logo } : null;
  const cabecera = logo
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="chip" bgcolor="#ffffff" style="background:#ffffff;border-radius:8px;padding:8px 12px;"><img src="cid:${CID_LOGO}" alt="${esc(nombre)}" height="44" style="display:block;height:44px;max-width:200px;width:auto;border:0;"></td></tr></table>`
    : `<span class="tx" style="font:700 22px/1.2 ${FUENTE};color:#1f2933;letter-spacing:-0.2px;">${esc(nombre)}</span>`;

  const html = `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${esc(e.asunto)}</title>
<style>
:root{color-scheme:light dark;supported-color-schemes:light dark}
a{color:${enlaceClaro}}
@media (max-width:620px){.ctn{width:100%!important}.px{padding-left:20px!important;padding-right:20px!important}.btn-td{display:block!important;width:100%!important}.btn-td a{display:block!important;text-align:center!important}}
@media (prefers-color-scheme:dark){
.bg-page{background:#0f1214!important}.bg-card{background:#1a1d21!important}.bg-soft{background:#23272c!important}
.tx{color:#eceff1!important}.tx2{color:#a8b0b8!important}.bd{border-color:#2d3238!important}
.acento{color:${t.oscuro.primario}!important}a.lnk{color:${t.oscuro.primario}!important}
.bar{background:${t.oscuro.primario}!important}
.btn-td{background:${t.oscuro.primario}!important}.btn-td a{color:${t.oscuro.texto}!important}
}
</style>
</head>
<body class="bg-page" style="margin:0;padding:0;background:#f4f5f7;">
${v.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:#f4f5f7;">${esc(v.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>` : ""}
<table role="presentation" class="bg-page" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f5f7" style="background:#f4f5f7;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" class="ctn" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
<tr><td class="bar" height="4" bgcolor="${hex}" style="height:4px;line-height:4px;font-size:4px;background:${hex};border-radius:12px 12px 0 0;">&nbsp;</td></tr>
<tr><td class="bg-card px" bgcolor="#ffffff" style="background:#ffffff;padding:28px 36px 8px;font-family:${FUENTE};">${cabecera}</td></tr>
<tr><td class="bg-card px" bgcolor="#ffffff" style="background:#ffffff;padding:8px 36px 32px;font-family:${FUENTE};color:#1f2933;">
${v.titulo ? `<h1 class="tx" style="margin:16px 0 12px;font:700 24px/1.3 ${FUENTE};color:#1f2933;">${esc(v.titulo)}</h1>` : ""}
${parrafos.map((p) => `<p class="tx" style="margin:0 0 14px;font:400 16px/1.6 ${FUENTE};color:#1f2933;">${esc(p)}</p>`).join("\n")}
${v.destacado ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 18px;"><tr><td class="bg-soft bd" bgcolor="#f1f5f8" style="background:#f1f5f8;border:1px solid #e4e7eb;border-radius:10px;padding:14px 24px;"><span class="tx" style="font:700 28px/1.2 'SFMono-Regular',Consolas,'Courier New',monospace;letter-spacing:6px;color:#1f2933;">${esc(v.destacado)}</span></td></tr></table>` : ""}
${boton ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;"><tr><td class="btn-td" align="center" bgcolor="${hex}" style="background:${hex};border-radius:8px;"><a href="${esc(boton.url)}" target="_blank" style="display:inline-block;padding:14px 28px;font:700 16px/1 ${FUENTE};color:${t.claro.texto};text-decoration:none;border-radius:8px;">${esc(boton.texto)}</a></td></tr></table>
<p class="tx2" style="margin:0 0 14px;font:400 13px/1.6 ${FUENTE};color:#5b6672;">Si el botón no funciona, copia y pega este enlace en tu navegador:<br><a class="lnk" href="${esc(boton.url)}" style="color:${enlaceClaro};word-break:break-all;">${esc(boton.url)}</a></p>` : ""}
${v.aviso ? `<p class="tx2 bd" style="margin:18px 0 0;padding-top:14px;border-top:1px solid #e4e7eb;font:400 13px/1.6 ${FUENTE};color:#5b6672;">${esc(v.aviso)}</p>` : ""}
</td></tr>
<tr><td class="bg-card bd px" bgcolor="#ffffff" style="background:#ffffff;padding:20px 36px 28px;border-top:1px solid #e4e7eb;border-radius:0 0 12px 12px;font-family:${FUENTE};">
<p class="tx" style="margin:0 0 4px;font:700 13px/1.5 ${FUENTE};color:#1f2933;">${esc(nombre)}</p>
${contacto.length ? `<p class="tx2" style="margin:0 0 10px;font:400 12px/1.6 ${FUENTE};color:#5b6672;">${contacto.map(esc).join(" &middot; ")}</p>` : ""}
<p class="tx2" style="margin:0;font:400 11px/1.6 ${FUENTE};color:#5b6672;">${esc(PRIVACIDAD)}${marca.plataforma ? "" : " Enviado con dent-view."}</p>
</td></tr>
</table>
</td></tr></table>
</body>
</html>`;

  const texto = [
    v.titulo, e.cuerpo, v.destacado && `Código: ${v.destacado}`, v.aviso,
    "--", nombre, contacto.join(" · "), PRIVACIDAD,
  ].filter(Boolean).join("\n\n");

  return { html, texto, logo };
}
