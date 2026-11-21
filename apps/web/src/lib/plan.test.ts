import { describe, expect, it } from "vitest";
import { puedeEditarNota, totalesPorEstado } from "./plan";

describe("totalesPorEstado", () => {
  it("suma por estado y deja en 0 los vacíos", () => {
    const t = totalesPorEstado([
      { estado: "PLANEADO", valor: 100 }, { estado: "PLANEADO", valor: 50 }, { estado: "REALIZADO", valor: 30 },
    ]);
    expect(t).toEqual({ PLANEADO: 150, ACEPTADO: 0, REALIZADO: 30, RECHAZADO: 0 });
  });
});

describe("puedeEditarNota", () => {
  const nota = { autorId: "u1", creadoEn: new Date("2026-11-19T15:00:00Z") }; // 10:00 Bogotá
  it("solo el autor el mismo día", () => {
    expect(puedeEditarNota(nota, "u1", new Date("2026-11-19T23:00:00Z"))).toBe(true);
    expect(puedeEditarNota(nota, "u2", new Date("2026-11-19T23:00:00Z"))).toBe(false);
    expect(puedeEditarNota(nota, "u1", new Date("2026-11-20T15:00:00Z"))).toBe(false);
  });
  it("usa el día de Bogotá, no UTC", () => {
    // 02:00Z del 20 = 21:00 del 19 en Bogotá: sigue siendo el mismo día
    expect(puedeEditarNota(nota, "u1", new Date("2026-11-20T02:00:00Z"))).toBe(true);
  });
});
