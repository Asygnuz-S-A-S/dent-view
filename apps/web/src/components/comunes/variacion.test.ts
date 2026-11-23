import { describe, expect, it } from "vitest";
import { fraseVariacion, variacion } from "./variacion";

describe("variacion", () => {
  it("calcula diferencia y porcentaje", () => {
    expect(variacion(12, 9)).toEqual({ dif: 3, pct: 33, sentido: "sube" });
    expect(variacion(5, 10)).toEqual({ dif: -5, pct: -50, sentido: "baja" });
  });
  it("sin base anterior no inventa porcentaje", () => {
    expect(variacion(4, 0)).toEqual({ dif: 4, pct: null, sentido: "sube" });
    expect(variacion(0, 0).sentido).toBe("igual");
  });
  it("redacta la frase", () => {
    expect(fraseVariacion(12, 9, "estudios", "la semana anterior")).toBe("3 estudios más que la semana anterior");
    expect(fraseVariacion(2, 2)).toBe("Igual que el periodo anterior");
  });
});
