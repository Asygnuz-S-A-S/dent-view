// Implementación independiente (sala limpia) a partir de docs/sala-limpia/04-notificaciones.md
// Conectores de envío. Correo: SMTP por variables de entorno (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE).
// Sin SMTP configurado, el correo se registra como simulado. SMS y WhatsApp: solo conector simulado (sin proveedor real).
import nodemailer from "nodemailer";
import { escaparHtml, type Canal } from "./notificaciones";

export type Saliente = { para: string; asunto: string; cuerpo: string; adjuntos?: { nombre: string; contenido: Buffer }[] };
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
    await transporte.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER, to: m.para, subject: m.asunto, text: m.cuerpo,
      html: `<div style="font-family:sans-serif;white-space:normal">${escaparHtml(m.cuerpo).replace(/\n/g, "<br>")}</div>`,
      attachments: m.adjuntos?.map((a) => ({ filename: a.nombre, content: a.contenido, contentType: "application/pdf" })),
    });
    return { proveedor: "smtp", simulado: false };
  },
};

/** Conector sin proveedor real: no envía nada y el mensaje queda marcado como simulado. */
const simulado = (canal: Canal): Conector => ({ canal, enviar: async () => ({ proveedor: "simulado", simulado: true }) });

export const conectores: Record<Canal, Conector> = { CORREO: correo, SMS: simulado("SMS"), WHATSAPP: simulado("WHATSAPP") };
