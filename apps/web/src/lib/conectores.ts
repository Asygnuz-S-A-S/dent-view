// Implementación independiente (sala limpia) a partir de docs/sala-limpia/04-notificaciones.md
// Conectores de envío. Correo: SMTP por variables de entorno (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE).
// Sin SMTP configurado, el correo se registra como simulado. SMS y WhatsApp: solo conector simulado (sin proveedor real).
import nodemailer from "nodemailer";
import { correoValido, MARCA_PLATAFORMA, renderCorreo, type Marca, type Vista } from "./correo/plantilla";
import type { Canal } from "./notificaciones";

/** `cuerpo` es el texto plano; `marca` y `vista` (opcionales) dan el diseño del correo HTML. */
export type Saliente = { para: string; asunto: string; cuerpo: string; adjuntos?: { nombre: string; contenido: Buffer }[]; marca?: Marca; vista?: Vista };
export type ResultadoEnvio = { proveedor: string; simulado: boolean };
export interface Conector {
  canal: Canal;
  enviar(m: Saliente): Promise<ResultadoEnvio>;
}

export const smtpConfigurado = () => !!process.env.SMTP_HOST;

const correo: Conector = {
  canal: "CORREO",
  async enviar(m) {
    if (!smtpConfigurado()) return { proveedor: "simulado", simulado: true };
    const puerto = Number(process.env.SMTP_PORT ?? 587);
    const transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port: puerto, secure: process.env.SMTP_SECURE === "true" || puerto === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    const marca = m.marca ?? MARCA_PLATAFORMA;
    const { html, texto, logo } = renderCorreo({ cuerpo: m.cuerpo, vista: m.vista, marca, asunto: m.asunto });
    // SMTP_FROM conserva solo la dirección; el nombre visible es el de la marca (sin saltos de línea).
    const direccion = /<([^<>]+)>/.exec(process.env.SMTP_FROM ?? "")?.[1] ?? process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "";
    await transporte.sendMail({
      from: { name: marca.nombre.replace(/[\r\n]+/g, " ").trim(), address: direccion }, to: m.para, subject: m.asunto.replace(/[\r\n]+/g, " "),
      replyTo: correoValido(marca.correo) ? marca.correo : undefined, text: texto, html,
      attachments: [
        ...(logo ? [{ filename: "logo", cid: logo.cid, content: logo.datos, contentType: logo.contentType, contentDisposition: "inline" as const }] : []),
        ...(m.adjuntos ?? []).map((a) => ({ filename: a.nombre, content: a.contenido, contentType: "application/pdf" })),
      ],
    });
    return { proveedor: "smtp", simulado: false };
  },
};

/** Conector sin proveedor real: no envía nada y el mensaje queda marcado como simulado. */
const simulado = (canal: Canal): Conector => ({ canal, enviar: async () => ({ proveedor: "simulado", simulado: true }) });

export const conectores: Record<Canal, Conector> = { CORREO: correo, SMS: simulado("SMS"), WHATSAPP: simulado("WHATSAPP") };
