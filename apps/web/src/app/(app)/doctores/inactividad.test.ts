import { describe, expect, it } from "vitest";
import { estaInactivo, inicioMesBogota } from "./inactividad";

const hoy = new Date("2026-11-18T12:00:00Z");
const hace = (dias: number) => new Date(hoy.getTime() - dias * 86_400_000);

describe("estaInactivo", () => {
  it("remitió hace 59 días: activo", () => expect(estaInactivo(hace(59), hace(400), hoy)).toBe(false));
  it("remitió hace 61 días: inactivo", () => expect(estaInactivo(hace(61), hace(400), hoy)).toBe(true));
  it("sin remisiones y miembro hace 10 días: activo", () => expect(estaInactivo(null, hace(10), hoy)).toBe(false));
  it("sin remisiones y miembro hace 90 días: inactivo", () => expect(estaInactivo(null, hace(90), hoy)).toBe(true));
});

describe("inicioMesBogota", () => {
  it("1 de nov 00:30 Bogotá aún es noviembre", () =>
    expect(inicioMesBogota(new Date("2026-11-01T05:30:00Z")).toISOString()).toBe("2026-11-01T05:00:00.000Z"));
  it("31 de oct 23:30 Bogotá sigue en octubre", () =>
    expect(inicioMesBogota(new Date("2026-11-01T04:30:00Z")).toISOString()).toBe("2026-10-01T05:00:00.000Z"));
});
