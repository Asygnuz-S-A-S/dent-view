import { describe, expect, it } from "vitest";
import { estaVencido } from "./laboratorio";

const ahora = new Date("2026-11-19T12:00:00Z");
const ayer = new Date("2026-11-18T00:00:00Z");
describe("estaVencido", () => {
  it("vence si pasó la fecha y no se ha recibido", () => {
    expect(estaVencido({ estado: "ENVIADO", entregaEsperada: ayer }, ahora)).toBe(true);
    expect(estaVencido({ estado: "PENDIENTE", entregaEsperada: ayer }, ahora)).toBe(true);
  });
  it("no vence si ya se recibió/cerró, no hay fecha o es futura", () => {
    expect(estaVencido({ estado: "RECIBIDO", entregaEsperada: ayer }, ahora)).toBe(false);
    expect(estaVencido({ estado: "CANCELADO", entregaEsperada: ayer }, ahora)).toBe(false);
    expect(estaVencido({ estado: "ENVIADO", entregaEsperada: null }, ahora)).toBe(false);
    expect(estaVencido({ estado: "ENVIADO", entregaEsperada: new Date("2026-11-20T00:00:00Z") }, ahora)).toBe(false);
  });
});
