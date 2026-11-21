import { describe, expect, it } from "vitest";
import {
  centroDeEtiquetas, CuerpoDemasiadoGrande, decidirEstudio, detectarTipo, estadoEstacion, etiquetaCentro, inspeccionarCuerpo,
  tipoDeclarado, tokenDeCabecera,
} from "./ingesta";
import { generarToken } from "./entrega";

const dicom = () => {
  const b = new Uint8Array(200);
  b.set([0x44, 0x49, 0x43, 0x4d], 128);
  return b;
};
const zip = () => new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
const flujo = (...partes: Uint8Array[]) =>
  new ReadableStream<Uint8Array>({ start(c) { partes.forEach((p) => c.enqueue(p)); c.close(); } });
const leer = async (s: ReadableStream<Uint8Array>) => new Uint8Array(await new Response(s).arrayBuffer());

describe("detectarTipo", () => {
  it("reconoce DICOM por DICM en el byte 128 y ZIP por PK\\x03\\x04", () => {
    expect(detectarTipo(dicom())).toBe("dicom");
    expect(detectarTipo(zip())).toBe("zip");
  });
  it("rechaza ejecutables, texto y archivos cortos", () => {
    expect(detectarTipo(new TextEncoder().encode("MZ\x90\x00 programa"))).toBeNull();
    expect(detectarTipo(new Uint8Array(131).fill(0x44))).toBeNull();
    expect(detectarTipo(new Uint8Array([0x50, 0x4b, 0x05, 0x06]))).toBeNull(); // ZIP vacío: sin entradas
  });
});

describe("tipoDeclarado", () => {
  it("solo acepta application/dicom y application/zip", () => {
    expect(tipoDeclarado("application/dicom")).toBe("dicom");
    expect(tipoDeclarado("Application/ZIP; charset=binary")).toBe("zip");
    expect(tipoDeclarado("application/octet-stream")).toBeNull();
    expect(tipoDeclarado(null)).toBeNull();
  });
});

describe("tokenDeCabecera", () => {
  it("extrae un token Bearer con el formato de generarToken", () => {
    const t = generarToken();
    expect(tokenDeCabecera(`Bearer ${t}`)).toBe(t);
  });
  it("rechaza cabeceras ausentes, otros esquemas o tokens mal formados", () => {
    const t = generarToken();
    expect(tokenDeCabecera(null)).toBeNull();
    expect(tokenDeCabecera(`Basic ${t}`)).toBeNull();
    expect(tokenDeCabecera(`Bearer ${t}x`)).toBeNull();
    expect(tokenDeCabecera(`Bearer ${t.slice(0, 40)}`)).toBeNull();
    expect(tokenDeCabecera(`Bearer ${t} `)).toBeNull();
  });
});

describe("etiquetas de centro en Orthanc", () => {
  const org = "4b0e3c1a-5f6e-4c1b-9a2d-0c8e7f6a5b4c";
  it("genera una etiqueta válida para Orthanc y la lee de vuelta", () => {
    expect(etiquetaCentro(org)).toBe(`tenant-${org}`);
    expect(centroDeEtiquetas(["otra", etiquetaCentro(org)])).toBe(org);
    expect(centroDeEtiquetas(undefined)).toBeNull();
  });
  it("no acepta ids con caracteres que Orthanc rechaza", () => {
    expect(() => etiquetaCentro("a:b")).toThrow();
    expect(() => etiquetaCentro("x".repeat(80))).toThrow();
  });
  it("con dos centros no hay dueño único", () => {
    expect(centroDeEtiquetas(["tenant-a", "tenant-b"])).toBe("varios");
  });
  it("no etiqueta un estudio que ya es de otro centro (etiqueta o BD)", () => {
    expect(decidirEstudio({ etiquetas: [], organizationIdBd: null, organizationId: "a" })).toBe("etiquetar");
    expect(decidirEstudio({ etiquetas: ["tenant-a"], organizationIdBd: "a", organizationId: "a" })).toBe("etiquetar");
    expect(decidirEstudio({ etiquetas: ["tenant-b"], organizationIdBd: null, organizationId: "a" })).toBe("conflicto");
    expect(decidirEstudio({ etiquetas: [], organizationIdBd: "b", organizationId: "a" })).toBe("conflicto");
    expect(decidirEstudio({ etiquetas: ["tenant-a", "tenant-b"], organizationIdBd: null, organizationId: "a" })).toBe("conflicto");
  });
});

describe("estadoEstacion", () => {
  const ahora = new Date("2026-11-20T12:00:00Z");
  it("en línea si reportó hace poco; inactiva manda", () => {
    expect(estadoEstacion({ activa: true, ultimoContacto: new Date("2026-11-20T11:55:00Z") }, ahora)).toBe("EN_LINEA");
    expect(estadoEstacion({ activa: true, ultimoContacto: new Date("2026-11-20T10:00:00Z") }, ahora)).toBe("SIN_CONTACTO");
    expect(estadoEstacion({ activa: true, ultimoContacto: null }, ahora)).toBe("SIN_CONTACTO");
    expect(estadoEstacion({ activa: false, ultimoContacto: ahora }, ahora)).toBe("INACTIVA");
  });
});

describe("inspeccionarCuerpo", () => {
  it("detecta el tipo aunque la cabecera llegue partida y reenvía los bytes intactos", async () => {
    const d = dicom();
    const { tipo, flujo: f } = await inspeccionarCuerpo(flujo(d.subarray(0, 50), d.subarray(50, 130), d.subarray(130)), 1000);
    expect(tipo).toBe("dicom");
    expect(await leer(f)).toEqual(d);
  });
  it("falla al pasar del límite de tamaño", async () => {
    const { tipo, flujo: f } = await inspeccionarCuerpo(flujo(zip(), new Uint8Array(100), new Uint8Array(100)), 150);
    expect(tipo).toBe("zip");
    await expect(leer(f)).rejects.toBeInstanceOf(CuerpoDemasiadoGrande);
  });
  it("un cuerpo vacío no tiene tipo", async () => {
    expect((await inspeccionarCuerpo(flujo(), 10)).tipo).toBeNull();
  });
});
