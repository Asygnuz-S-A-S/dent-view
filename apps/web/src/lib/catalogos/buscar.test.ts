import { describe, expect, it } from "vitest";
import { buscarCodigos, CIE10, CUPS, existeCups, normalizar } from "./buscar";

describe("catálogos", () => {
  it("normaliza tildes y mayúsculas", () => expect(normalizar("  Panorámica ÁÉ ")).toBe("panoramica ae"));
  it("busca por descripción sin tildes", () => expect(buscarCodigos(CUPS.items, "panoramica").map((i) => i.codigo)).toContain("870114"));
  it("busca por prefijo de código y por varias palabras", () => {
    expect(buscarCodigos(CIE10.items, "K02").every((i) => i.codigo.startsWith("K02"))).toBe(true);
    expect(buscarCodigos(CIE10.items, "caries dentina").map((i) => i.codigo)).toEqual(["K021"]);
  });
  it("respeta el límite y los códigos son únicos y válidos", () => {
    expect(buscarCodigos(CUPS.items, "", 5)).toHaveLength(5);
    expect(new Set(CUPS.items.map((i) => i.codigo)).size).toBe(CUPS.items.length);
    expect(CUPS.items.every((i) => /^\d{6}$/.test(i.codigo))).toBe(true);
    expect(CIE10.items.every((i) => /^[A-Z]\d{2}[0-9A-Z]$/.test(i.codigo))).toBe(true);
    expect(existeCups("870114")).toBe(true);
    expect(existeCups("000000")).toBe(false);
  });
});
