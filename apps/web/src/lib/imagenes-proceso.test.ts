import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { generarPdfInforme } from "./informe-pdf";
import { procesarImagen } from "./imagenes-proceso";

describe("procesarImagen", () => {
  it("re-codifica a JPEG sin EXIF/GPS y genera miniatura", async () => {
    const original = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#336699" } }).jpeg().withExif({ IFD0: { Copyright: "secreto-gps" } }).toBuffer();
    expect((await sharp(original).metadata()).exif).toBeDefined();
    const p = await procesarImagen(original, "image/jpeg");
    expect(p.ancho).toBe(2400);
    expect(p.alto).toBe(1600);
    expect((await sharp(p.web).metadata()).exif).toBeUndefined();
    expect(p.web.includes(Buffer.from("secreto-gps"))).toBe(false);
    expect((await sharp(p.thumb).metadata()).width).toBeLessThanOrEqual(360);
  });
  it("rechaza datos que no son imagen", async () => {
    await expect(procesarImagen(Uint8Array.from([0xff, 0xd8, 0xff, 1, 2, 3]), "image/jpeg")).rejects.toThrow();
  });
});

describe("PDF del informe con capturas", () => {
  it("es un PDF válido con el nombre del centro y la grilla de capturas", async () => {
    const jpg = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#aa5500" } }).jpeg().toBuffer();
    const pdf = await generarPdfInforme({
      membrete: { nombre: "Centro Prueba Radiología" }, paciente: { nombre: "Paciente Ficticio", documento: "CC 1", nacimiento: "1/1/1990", edad: 36 },
      orden: "OS-1", remitente: "Dr. Remitente", estudioFecha: null, motivo: null, tecnica: null, hallazgos: "Sin hallazgos", impresion: "Normal", recomendaciones: null,
      alertas: [], capturas: [{ data: jpg, leyenda: "Panorámica" }, { data: jpg, leyenda: null }], colorPrimario: "#0e6b8a",
      firmante: { nombre: "Dra. Firma", tarjeta: "123" }, emitidoEn: "hoy", version: 1, codigo: "ABCDEFGHJK", urlVerificacion: "http://x/verificar/ABCDEFGHJK",
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    // El autor del PDF (Info) es el nombre del centro, guardado como UTF-16BE.
    expect(pdf.includes(Buffer.from("Centro Prueba Radiología", "utf16le").swap16())).toBe(true);
    expect(pdf.length).toBeGreaterThan(2000);
  });
});
