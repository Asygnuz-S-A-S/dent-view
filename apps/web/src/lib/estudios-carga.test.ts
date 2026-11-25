import { describe, expect, it } from "vitest";
import { categoriaDeClave, claveCarga, DICOM_MAX_BYTES, normalizarPatientId, PDF_MAX_BYTES, sugerirCategoria, tipoDeArchivo, validarCarga } from "./estudios-carga";
import { IMG_MAX_BYTES } from "./imagenes";

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(20).fill(0)]);
const PDF = Uint8Array.from(ascii("%PDF-1.7\n%âãÏÓ\n"));
const DCM = Uint8Array.from([...new Array(128).fill(0), ...ascii("DICM"), 2, 0]);
const ZIP = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, ...new Array(20).fill(0)]);
const TXT = Uint8Array.from(ascii("esto no es una imagen, aunque se llame falso.jpg"));

describe("tipoDeArchivo (firma real)", () => {
  it("reconoce imagen, PDF, DICOM y ZIP", () => {
    expect(tipoDeArchivo(JPG)).toEqual({ tipo: "imagen", mime: "image/jpeg" });
    expect(tipoDeArchivo(PDF)).toEqual({ tipo: "pdf" });
    expect(tipoDeArchivo(DCM)).toEqual({ tipo: "dicom" });
    expect(tipoDeArchivo(ZIP)).toEqual({ tipo: "zip" });
  });
  it("texto, vacío o solo extensión engañosa no son nada", () => {
    expect(tipoDeArchivo(TXT)).toBeNull();
    expect(tipoDeArchivo(new Uint8Array(0))).toBeNull();
  });
});

describe("validarCarga por categoría y límites", () => {
  it("foto: solo imágenes; un archivo falso .jpg se rechaza", () => {
    expect(validarCarga("foto", JPG, 1000)).toMatchObject({ ok: true, destino: "imagen" });
    expect(validarCarga("foto", TXT, 1000)).toMatchObject({ ok: false });
    expect(validarCarga("foto", PDF, 1000)).toMatchObject({ ok: false, error: expect.stringContaining("Fotografía") });
    expect(validarCarga("foto", DCM, 1000)).toMatchObject({ ok: false });
  });
  it("radiografía: imagen, DICOM o ZIP (destino dicom); PDF no", () => {
    expect(validarCarga("radiografia", DCM, 1000)).toMatchObject({ ok: true, destino: "dicom" });
    expect(validarCarga("radiografia", ZIP, 1000)).toMatchObject({ ok: true, destino: "dicom" });
    expect(validarCarga("radiografia", JPG, 1000)).toMatchObject({ ok: true, destino: "imagen" });
    expect(validarCarga("radiografia", PDF, 1000)).toMatchObject({ ok: false });
  });
  it("orden médica: PDF o imagen; otro documento: solo PDF", () => {
    expect(validarCarga("orden", PDF, 1000)).toMatchObject({ ok: true, destino: "documento" });
    expect(validarCarga("orden", JPG, 1000)).toMatchObject({ ok: true, destino: "imagen" });
    expect(validarCarga("orden", DCM, 1000)).toMatchObject({ ok: false });
    expect(validarCarga("documento", PDF, 1000)).toMatchObject({ ok: true });
    expect(validarCarga("documento", JPG, 1000)).toMatchObject({ ok: false, error: expect.stringContaining("PDF") });
  });
  it("tamaños: imagen 25 MB, PDF 20 MB, DICOM/ZIP 1 GB, vacío", () => {
    expect(validarCarga("foto", JPG, IMG_MAX_BYTES)).toMatchObject({ ok: true });
    expect(validarCarga("foto", JPG, 26 * 1024 * 1024)).toMatchObject({ ok: false, error: expect.stringContaining("25 MB") });
    expect(validarCarga("orden", PDF, PDF_MAX_BYTES + 1)).toMatchObject({ ok: false, error: expect.stringContaining("20 MB") });
    expect(validarCarga("radiografia", ZIP, DICOM_MAX_BYTES)).toMatchObject({ ok: true });
    expect(validarCarga("radiografia", ZIP, DICOM_MAX_BYTES + 1)).toMatchObject({ ok: false, error: expect.stringContaining("1 GB") });
    expect(validarCarga("foto", JPG, 0)).toMatchObject({ ok: false, error: expect.stringContaining("vacío") });
  });
});

describe("clasificación y convención de categoría", () => {
  it("sugiere por tipo y nombre", () => {
    expect(sugerirCategoria("remision-juan.pdf", { tipo: "pdf" })).toBe("orden");
    expect(sugerirCategoria("consentimiento.pdf", { tipo: "pdf" })).toBe("documento");
    expect(sugerirCategoria("estudio.zip", { tipo: "zip" })).toBe("radiografia");
    expect(sugerirCategoria("panoramica-rx.jpg", { tipo: "imagen", mime: "image/jpeg" })).toBe("radiografia");
    expect(sugerirCategoria("IMG_2031.heic", { tipo: "imagen", mime: "image/heic" })).toBe("foto");
  });
  it("la categoría viaja en la clave S3 y las claves históricas son radiografías", () => {
    for (const c of ["foto", "radiografia", "orden", "documento"] as const) expect(categoriaDeClave(claveCarga("O1", "I1", c, "jpg"))).toBe(c);
    expect(categoriaDeClave("tenants/O1/imagenes/I1/original.png")).toBe("radiografia");
    expect(claveCarga("O1", "I1", "orden", "pdf")).toBe("tenants/O1/imagenes/I1/orden.pdf");
  });
});

describe("normalizarPatientId", () => {
  it("deja el documento válido para DICOM (sin barra invertida ni control, máx. 64)", () => {
    expect(normalizarPatientId(" 1020304050 ")).toBe("1020304050");
    expect(normalizarPatientId("AB\\12\n3")).toBe("AB123");
    expect(normalizarPatientId("9".repeat(100))).toHaveLength(64);
    expect(normalizarPatientId("  \\ ")).toBeNull();
  });
});
