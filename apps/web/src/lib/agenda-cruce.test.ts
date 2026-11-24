import { describe, expect, it } from "vitest";
import { esConflictoDeEscritura, esCruceDeCitas } from "./agenda-cruce";

describe("esCruceDeCitas", () => {
  it("reconoce la violación de exclusión de Postgres", () => {
    expect(esCruceDeCitas(new Error('conflicting key value violates exclusion constraint "Cita_sin_cruce_sala"'))).toBe(true);
    expect(esCruceDeCitas({ code: "23P01" })).toBe(true);
    expect(esCruceDeCitas({ code: "P2010", meta: { message: "Cita_sin_cruce_profesional" } })).toBe(true);
    // Forma real observada con Prisma 7 + adaptador pg (P2039 con el error del driver dentro de meta).
    const real = { code: "P2039", message: "Invalid `tx.cita.create()` invocation", meta: { modelName: "Cita", driverAdapterError: { name: "DriverAdapterError", cause: { originalCode: "23P01", kind: "postgres", message: 'conflicting key value violates exclusion constraint "Cita_sin_cruce_sala"' } } } };
    expect(esCruceDeCitas(real)).toBe(true);
  });
  it("no confunde otros errores", () => {
    expect(esCruceDeCitas(new Error("connection refused"))).toBe(false);
    expect(esCruceDeCitas(null)).toBe(false);
  });
});

describe("esConflictoDeEscritura", () => {
  it("reconoce P2034 (deadlock entre dos altas simultáneas) y nada más", () => {
    expect(esConflictoDeEscritura({ code: "P2034", meta: { driverAdapterError: { name: "DriverAdapterError" } } })).toBe(true);
    expect(esConflictoDeEscritura({ code: "P2039" })).toBe(false);
    expect(esConflictoDeEscritura(null)).toBe(false);
  });
});
