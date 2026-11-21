import { describe, expect, it } from "vitest";
import { agruparCartera, diasAntiguedad, tramoDe } from "./cartera";

const ahora = new Date("2026-11-19T12:00:00Z");
const hace = (d: number) => new Date(ahora.getTime() - d * 86_400_000);

describe("cartera", () => {
  it("tramoDe respeta los bordes", () => {
    expect([0, 30, 31, 60, 61, 90, 91].map(tramoDe)).toEqual([0, 0, 1, 1, 2, 2, 3]);
  });
  it("diasAntiguedad usa el vencimiento si existe y nunca es negativo", () => {
    expect(diasAntiguedad(hace(100), hace(10), ahora)).toBe(10);
    expect(diasAntiguedad(hace(45), null, ahora)).toBe(45);
    expect(diasAntiguedad(hace(1), hace(-5), ahora)).toBe(0);
  });
  it("agruparCartera agrupa por responsable y suma por tramo", () => {
    const base = { vence: null, responsableId: null, convenio: null };
    const g = agruparCartera(
      [
        { ...base, id: "a", fecha: hace(10), saldo: 100, responsable: "PACIENTE" as const, pacienteId: "p1" },
        { ...base, id: "b", fecha: hace(95), saldo: 50, responsable: "PACIENTE" as const, pacienteId: "p1" },
        { ...base, id: "c", fecha: hace(40), saldo: 500, responsable: "CONVENIO" as const, pacienteId: "p2", convenio: "Seguros X" },
        { ...base, id: "d", fecha: hace(40), saldo: 5, responsable: "CONVENIO" as const, pacienteId: "p3", convenio: " seguros x " },
      ],
      ahora,
    );
    expect(g.map((x) => x.clave)).toEqual(["CONVENIO:seguros x", "PACIENTE:p1"]);
    expect(g[0].porTramo).toEqual([0, 505, 0, 0]);
    expect(g[1].porTramo).toEqual([100, 0, 0, 50]);
    expect(g[1].total).toBe(150);
  });
});
