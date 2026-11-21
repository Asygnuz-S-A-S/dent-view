import { describe, expect, it } from "vitest";
import { conReintentoNumero, numeroOrden, siguienteEstado, transicionValida } from "./ordenes";

describe("transicionValida", () => {
  it("permite solo el avance siguiente", () => {
    expect(transicionValida("SOLICITADA", "AGENDADA")).toBe(true);
    expect(transicionValida("SOLICITADA", "TOMADA")).toBe(false);
    expect(transicionValida("INFORMADA", "ENTREGADA")).toBe(true);
    expect(transicionValida("TOMADA", "AGENDADA")).toBe(false);
  });
  it("cancela solo antes de informar", () => {
    expect(transicionValida("AGENDADA", "CANCELADA")).toBe(true);
    expect(transicionValida("INFORMADA", "CANCELADA")).toBe(false);
    expect(transicionValida("CANCELADA", "SOLICITADA")).toBe(false);
  });
  it("siguienteEstado", () => {
    expect(siguienteEstado("TOMADA")).toBe("INFORMADA");
    expect(siguienteEstado("ENTREGADA")).toBeNull();
  });
});

describe("numeroOrden", () => {
  it("rellena a 4 dígitos", () => expect(numeroOrden(7)).toBe("#0007"));
});

describe("conReintentoNumero", () => {
  const choque = Object.assign(new Error("unique"), { code: "P2002" });
  it("reintenta ante P2002", async () => {
    let n = 0;
    const r = await conReintentoNumero(async () => {
      if (++n < 3) throw choque;
      return n;
    });
    expect(r).toBe(3);
  });
  it("se rinde tras los intentos y no reintenta otros errores", async () => {
    let n = 0;
    await expect(conReintentoNumero(async () => { n++; throw choque; }, 2)).rejects.toBe(choque);
    expect(n).toBe(2);
    n = 0;
    await expect(conReintentoNumero(async () => { n++; throw new Error("x"); })).rejects.toThrow("x");
    expect(n).toBe(1);
  });
});

describe("numeroDeBusqueda", () => {
  it("acepta números de orden y rechaza cédulas que no caben en el INT", async () => {
    const { numeroDeBusqueda } = await import("./ordenes");
    expect(numeroDeBusqueda("#0028")).toBe(28);
    expect(numeroDeBusqueda("28")).toBe(28);
    expect(numeroDeBusqueda("5182236143")).toBeNull(); // cédula de 10 dígitos mayor que el INT máximo (2.147.483.647)
    expect(numeroDeBusqueda("abc")).toBeNull();
    expect(numeroDeBusqueda("0")).toBeNull();
  });
});
