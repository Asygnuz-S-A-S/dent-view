import { describe, expect, it } from "vitest";
import { calcularEdad, normalizarDocumento } from "./pacientes";

describe("normalizarDocumento", () => {
  it("quita separadores y pasa a mayúsculas", () => {
    expect(normalizarDocumento(" 1.053-123 456 ")).toBe("1053123456");
    expect(normalizarDocumento("ab-12")).toBe("AB12");
  });
});

describe("calcularEdad", () => {
  const nac = new Date("1990-06-15T00:00:00Z");
  it("aún no cumple años", () => expect(calcularEdad(nac, new Date("2026-06-14T12:00:00Z"))).toBe(35));
  it("el día del cumpleaños", () => expect(calcularEdad(nac, new Date("2026-06-15T12:00:00Z"))).toBe(36));
  it("recién nacido", () => expect(calcularEdad(nac, nac)).toBe(0));
});
