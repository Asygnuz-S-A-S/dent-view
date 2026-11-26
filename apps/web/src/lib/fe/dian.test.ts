import { describe, expect, it } from "vitest";
import { digitoVerificacionNit, MEDIO_PAGO_DIAN, nitValido, tipoDocumentoDian } from "./dian";

describe("dígito de verificación del NIT", () => {
  it("calcula casos conocidos", () => {
    expect(digitoVerificacionNit("800197268")).toBe("4"); // DIAN
    expect(digitoVerificacionNit("860.002.964")).toBe("4"); // Banco de Bogotá
    expect(digitoVerificacionNit("900123456")).toBe("8");
  });
  it("rechaza lo que no es numérico", () => {
    expect(digitoVerificacionNit("12A45")).toBeNull();
    expect(digitoVerificacionNit("")).toBeNull();
    expect(digitoVerificacionNit("1234567890123456")).toBeNull();
  });
  it("valida el par NIT/DV", () => {
    expect(nitValido("800197268", "4")).toBe(true);
    expect(nitValido("800197268", "5")).toBe(false);
  });
});

describe("tipos de documento DIAN", () => {
  it.each([["CC", "13"], ["TI", "12"], ["CE", "22"], ["PA", "41"], ["RC", "11"], ["NIT", "31"], ["cc", "13"]])("%s -> %s", (t, c) => expect(tipoDocumentoDian(t)).toBe(c));
  it("un tipo desconocido no tiene equivalente", () => expect(tipoDocumentoDian("XX")).toBeNull());
  it("todos los medios de pago de dent-view tienen código", () => {
    for (const m of ["EFECTIVO", "TRANSFERENCIA", "TARJETA", "PASARELA", "ANTICIPO", "OTRO"]) expect(MEDIO_PAGO_DIAN[m]).toBeTruthy();
  });
});
