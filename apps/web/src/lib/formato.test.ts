import { describe, expect, it } from "vitest";
import { conMiles, parsearCop, soloDigitos } from "./formato";

describe("formato COP", () => {
  it("quita separadores y símbolos", () => expect(soloDigitos("$ 180.000")).toBe("180000"));
  it("quita ceros a la izquierda", () => expect(soloDigitos("007")).toBe("7"));
  it("agrega separador de miles", () => expect(conMiles("1250000")).toBe("1.250.000"));
  it("vacío se queda vacío", () => expect(conMiles("")).toBe(""));
  it("parsea a número", () => {
    expect(parsearCop("360.000")).toBe(360000);
    expect(parsearCop("abc")).toBe(0);
  });
});
