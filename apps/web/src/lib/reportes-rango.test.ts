import { describe, expect, it } from "vitest";
import { diasDelRango, rangoReporte } from "./reportes-rango";

const ahora = new Date("2026-11-19T15:00:00Z");

describe("rangoReporte", () => {
  it("por defecto es el mes actual en Bogotá", () => {
    const r = rangoReporte(undefined, undefined, ahora);
    expect([r.desde, r.hasta]).toEqual(["2026-11-01", "2026-11-19"]);
    expect(r.ini.toISOString()).toBe("2026-11-01T05:00:00.000Z");
    expect(r.fin.toISOString()).toBe("2026-11-20T05:00:00.000Z");
  });
  it("corrige fechas inválidas o invertidas", () => {
    expect(rangoReporte("basura", "2026-11-05", ahora).desde).toBe("2026-11-01");
    expect(rangoReporte("2026-11-10", "2026-11-05", ahora).hasta).toBe("2026-11-10");
  });
  it("diasDelRango lista cada día", () => {
    expect(diasDelRango(rangoReporte("2026-11-28", "2026-12-01", ahora))).toEqual(["2026-11-28", "2026-11-29", "2026-11-30", "2026-12-01"]);
  });
});
