import { describe, expect, it } from "vitest";
import { calcularPagina } from "./paginacion";

describe("calcularPagina", () => {
  it("primera página y rango mostrado", () => {
    expect(calcularPagina(undefined, 120, 50)).toEqual({ pagina: 1, paginas: 3, skip: 0, take: 50, desde: 1, hasta: 50 });
  });
  it("última página parcial", () => {
    expect(calcularPagina("3", 120, 50)).toMatchObject({ pagina: 3, skip: 100, desde: 101, hasta: 120 });
  });
  it("acota valores inválidos o fuera de rango", () => {
    for (const x of ["0", "-2", "abc", "1.5", "", undefined]) expect(calcularPagina(x, 120, 50).pagina, String(x)).toBe(1);
    expect(calcularPagina("99", 120, 50).pagina).toBe(3);
    expect(calcularPagina(["2", "3"], 120, 50).pagina).toBe(2);
  });
  it("sin resultados", () => {
    expect(calcularPagina("5", 0, 50)).toEqual({ pagina: 1, paginas: 1, skip: 0, take: 50, desde: 0, hasta: 0 });
  });
  it("exactamente un múltiplo no crea una página vacía", () => expect(calcularPagina("2", 100, 50).paginas).toBe(2));
});
