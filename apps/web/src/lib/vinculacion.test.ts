import { describe, expect, it } from "vitest";
import { elegirOrdenParaEstudio } from "../../../../packages/db/src/vinculacion";

const o = (id: string, estado: string, dia: number) => ({ id, estado, creadoEn: new Date(Date.UTC(2026, 10, dia)) });

describe("elegirOrdenParaEstudio", () => {
  it("elige la AGENDADA/TOMADA más reciente", () => {
    expect(elegirOrdenParaEstudio([o("a", "AGENDADA", 1), o("b", "TOMADA", 5), o("c", "AGENDADA", 3)])).toBe("b");
  });
  it("ignora órdenes en otros estados", () => {
    expect(elegirOrdenParaEstudio([o("a", "SOLICITADA", 9), o("b", "INFORMADA", 8), o("c", "CANCELADA", 7)])).toBeNull();
    expect(elegirOrdenParaEstudio([o("a", "SOLICITADA", 9), o("b", "AGENDADA", 2)])).toBe("b");
  });
  it("sin órdenes no vincula", () => expect(elegirOrdenParaEstudio([])).toBeNull());
  it("empate en fecha es ambiguo: no vincula", () => {
    expect(elegirOrdenParaEstudio([o("a", "AGENDADA", 4), o("b", "TOMADA", 4)])).toBeNull();
  });
});
