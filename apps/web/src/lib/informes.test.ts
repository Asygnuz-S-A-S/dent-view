// Implementación independiente (sala limpia) a partir de docs/sala-limpia/01-documentos-e-informes.md
import { describe, expect, it } from "vitest";
import { generarCodigo, informeEditable, nombreArchivoInforme, puedeArchivar, puedeCorregir, puedeEmitir } from "./informes";

describe("estados del informe", () => {
  it("solo el borrador se edita; el emitido es inmutable", () => {
    expect(informeEditable("BORRADOR")).toBe(true);
    expect(informeEditable("EMITIDO")).toBe(false);
    expect(informeEditable("ARCHIVADO")).toBe(false);
  });
  it("emitir exige hallazgos e impresión", () => {
    expect(puedeEmitir({ estado: "BORRADOR", hallazgos: "x", impresion: " " })).toBe(false);
    expect(puedeEmitir({ estado: "BORRADOR", hallazgos: "x", impresion: "y" })).toBe(true);
    expect(puedeEmitir({ estado: "EMITIDO", hallazgos: "x", impresion: "y" })).toBe(false);
  });
  it("corregir solo la versión emitida vigente", () => {
    expect(puedeCorregir({ estado: "EMITIDO", vigente: true })).toBe(true);
    expect(puedeCorregir({ estado: "EMITIDO", vigente: false })).toBe(false);
    expect(puedeCorregir({ estado: "BORRADOR", vigente: true })).toBe(false);
  });
  it("archivar", () => {
    expect(puedeArchivar("ARCHIVADO")).toBe(false);
  });
});

describe("generarCodigo", () => {
  it("10 caracteres sin ambiguos y distinto entre llamadas", () => {
    const a = generarCodigo();
    expect(a).toMatch(/^[A-HJKMNP-Z2-9]{10}$/);
    expect(generarCodigo()).not.toBe(a);
  });
});

describe("nombreArchivoInforme", () => {
  it("sin acentos ni caracteres residuales", () => {
    const n = nombreArchivoInforme(7, "María José Peña\r\n", 2);
    expect(n).toBe("informe-7-Maria-Jose-Pena-v2.pdf");
    expect(nombreArchivoInforme(null, "", 1)).toBe("informe-sin-orden-paciente-v1.pdf");
  });
});
