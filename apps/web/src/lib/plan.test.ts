import { describe, expect, it } from "vitest";
import { totalesPorEstado } from "./plan";

describe("totalesPorEstado", () => {
  it("suma por estado y deja en 0 los vacíos", () => {
    const t = totalesPorEstado([
      { estado: "PLANEADO", valor: 100 }, { estado: "PLANEADO", valor: 50 }, { estado: "REALIZADO", valor: 30 },
    ]);
    expect(t).toEqual({ PLANEADO: 150, ACEPTADO: 0, REALIZADO: 30, RECHAZADO: 0 });
  });
});
