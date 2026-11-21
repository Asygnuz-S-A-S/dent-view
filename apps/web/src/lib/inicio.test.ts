import { describe, expect, it } from "vitest";
import { diaBogota, serieDiaria } from "./inicio";

describe("serieDiaria", () => {
  const hoy = new Date("2026-11-18T15:00:00Z"); // 10:00 en Bogotá
  it("rellena ceros y cuenta por día de Bogotá", () => {
    const s = serieDiaria(
      [new Date("2026-11-18T14:00:00Z"), new Date("2026-11-19T03:00:00Z"), new Date("2026-11-16T20:00:00Z")],
      3,
      hoy,
    );
    expect(s).toEqual([
      { dia: "2026-11-16", total: 1 },
      { dia: "2026-11-17", total: 0 },
      { dia: "2026-11-18", total: 2 }, // 03:00Z del 19 sigue siendo 18 en Bogotá
    ]);
  });
  it("diaBogota usa la zona local", () => {
    expect(diaBogota(new Date("2026-11-18T04:59:00Z"))).toBe("2026-11-17");
  });
});
