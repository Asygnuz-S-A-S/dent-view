// Implementación independiente (sala limpia) a partir de docs/sala-limpia/03-recordatorios-y-seguimiento.md
import { describe, expect, it } from "vitest";
import { estadoTrasIntento, ordenarLista, primerDiaMes, seguimientoAbierto, sumarMeses, tasaConversion } from "./seguimiento";

describe("estadoTrasIntento", () => {
  it("sin respuesta sobre pendiente pasa a sin respuesta", () => {
    expect(estadoTrasIntento("PENDIENTE", "SIN_RESPUESTA")).toBe("SIN_RESPUESTA");
    expect(estadoTrasIntento("PENDIENTE", "BUZON")).toBe("SIN_RESPUESTA");
  });
  it("sin respuesta no cambia otros estados", () => {
    expect(estadoTrasIntento("AGENDADO", "SIN_RESPUESTA")).toBe("AGENDADO");
  });
  it("agendó y declinó", () => {
    expect(estadoTrasIntento("SIN_RESPUESTA", "AGENDO")).toBe("AGENDADO");
    expect(estadoTrasIntento("PENDIENTE", "DECLINO")).toBe("DECLINO");
  });
});

describe("estados", () => {
  it("completado y cancelado están cerrados", () => {
    expect(seguimientoAbierto("COMPLETADO")).toBe(false);
    expect(seguimientoAbierto("CANCELADO")).toBe(false);
    expect(seguimientoAbierto("DECLINO")).toBe(true);
  });
});

describe("tasaConversion", () => {
  it("cero sin datos y proporción con datos", () => {
    expect(tasaConversion(0, 0)).toBe(0);
    expect(tasaConversion(3, 1)).toBe(0.75);
  });
});

describe("meses", () => {
  it("normaliza al primer día y suma meses cruzando año", () => {
    expect(primerDiaMes("2026-11-19").toISOString().slice(0, 10)).toBe("2026-11-01");
    expect(sumarMeses(primerDiaMes("2026-11-19"), 2).toISOString().slice(0, 10)).toBe("2027-01-01");
  });
});

describe("ordenarLista", () => {
  it("prioridad, luego mes, luego antigüedad", () => {
    const f = (id: string, prioridad: string, mes: string, c: number) => ({ id, prioridad, mesObjetivo: new Date(mes), creadoEn: new Date(c) });
    const r = ordenarLista([f("a", "BAJA", "2026-01-01", 1), f("b", "ALTA", "2026-03-01", 2), f("c", "ALTA", "2026-02-01", 3), f("d", "NORMAL", "2026-01-01", 0)]);
    expect(r.map((x) => x.id)).toEqual(["c", "b", "d", "a"]);
  });
});
