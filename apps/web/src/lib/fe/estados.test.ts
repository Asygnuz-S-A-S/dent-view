import { describe, expect, it } from "vitest";
import { backoffMs, esVigente, MAX_INTENTOS, puedeTransicionar } from "./estados";

describe("máquina de estados", () => {
  it("permite el camino feliz y los reintentos manuales", () => {
    expect(puedeTransicionar("BORRADOR", "ENVIANDO")).toBe(true);
    expect(puedeTransicionar("ENVIANDO", "ACEPTADA")).toBe(true);
    expect(puedeTransicionar("ENVIANDO", "RECHAZADA")).toBe(true);
    expect(puedeTransicionar("RECHAZADA", "ENVIANDO")).toBe(true);
    expect(puedeTransicionar("ERROR", "ENVIANDO")).toBe(true);
  });
  it("una FEV aceptada solo puede pasar a ANULADA (nunca volver a enviarse)", () => {
    expect(puedeTransicionar("ACEPTADA", "ENVIANDO")).toBe(false);
    expect(puedeTransicionar("ACEPTADA", "RECHAZADA")).toBe(false);
    expect(puedeTransicionar("ACEPTADA", "ANULADA")).toBe(true);
    expect(puedeTransicionar("ANULADA", "ENVIANDO")).toBe(false);
  });
  it("vigente = bloquea una nueva emisión", () => {
    expect(esVigente("ACEPTADA")).toBe(true);
    expect(esVigente("ENVIANDO")).toBe(true);
    expect(esVigente("RECHAZADA")).toBe(false);
  });
  it("backoff exponencial con tope de 2 horas", () => {
    expect(backoffMs(1)).toBe(60_000);
    expect(backoffMs(2)).toBe(120_000);
    expect(backoffMs(4)).toBe(480_000);
    expect(backoffMs(30)).toBe(2 * 3600_000);
    expect(MAX_INTENTOS).toBe(8);
  });
});
