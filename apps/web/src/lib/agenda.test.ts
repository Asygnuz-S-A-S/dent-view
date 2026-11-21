import { describe, expect, it } from "vitest";
import { bogotaAUtc, hayCruce, hoyBogota, utcABogota } from "./agenda";

describe("zona Bogotá", () => {
  it("08:00 local = 13:00 UTC", () => {
    expect(bogotaAUtc("2026-11-19", 8 * 60).toISOString()).toBe("2026-11-19T13:00:00.000Z");
  });
  it("19:00 local cruza la medianoche UTC", () => {
    expect(bogotaAUtc("2026-11-19", 19 * 60).toISOString()).toBe("2026-11-20T00:00:00.000Z");
  });
  it("ida y vuelta", () => {
    expect(utcABogota(new Date("2026-11-20T00:15:00Z"))).toEqual({ fecha: "2026-11-19", minutos: 19 * 60 + 15 });
  });
  it("hoyBogota usa el día local", () => {
    expect(hoyBogota(new Date("2026-11-19T03:00:00Z"))).toBe("2026-11-18");
  });
});

describe("hayCruce", () => {
  const c = (h1: number, h2: number, salaId = "a", estado = "PROGRAMADA", id = "x") => ({
    id, salaId, estado, inicio: bogotaAUtc("2026-11-19", h1 * 60), fin: bogotaAUtc("2026-11-19", h2 * 60),
  });
  const base = [c(9, 10)];
  it("detecta solapes en la misma sala", () => {
    expect(hayCruce(base, c(9.5, 10.5, "a", "PROGRAMADA", "n"))).toBe(true);
    expect(hayCruce(base, c(8, 9.5, "a", "PROGRAMADA", "n"))).toBe(true);
  });
  it("permite citas contiguas, otra sala y canceladas", () => {
    expect(hayCruce(base, c(10, 11, "a", "PROGRAMADA", "n"))).toBe(false);
    expect(hayCruce(base, c(9, 10, "b", "PROGRAMADA", "n"))).toBe(false);
    expect(hayCruce([c(9, 10, "a", "CANCELADA")], c(9, 10, "a", "PROGRAMADA", "n"))).toBe(false);
  });
  it("ignora la propia cita al editar", () => {
    expect(hayCruce(base, c(9, 10, "a", "PROGRAMADA", "x"))).toBe(false);
  });
});
