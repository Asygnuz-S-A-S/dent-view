import { describe, expect, it } from "vitest";
import { esCruceDeCitas } from "./agenda-cruce";

describe("esCruceDeCitas", () => {
  it("reconoce la violación de exclusión de Postgres", () => {
    expect(esCruceDeCitas(new Error('conflicting key value violates exclusion constraint "Cita_sin_cruce_sala"'))).toBe(true);
    expect(esCruceDeCitas({ code: "23P01" })).toBe(true);
    expect(esCruceDeCitas({ code: "P2010", meta: { message: "Cita_sin_cruce_profesional" } })).toBe(true);
  });
  it("no confunde otros errores", () => {
    expect(esCruceDeCitas(new Error("connection refused"))).toBe(false);
    expect(esCruceDeCitas(null)).toBe(false);
  });
});
