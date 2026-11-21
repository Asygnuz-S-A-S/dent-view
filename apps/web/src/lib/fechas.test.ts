import { describe, expect, it } from "vitest";
import { fechaCorta, fechaHoraCompleta, fechaHora, fechaIso, fechaLarga, fechaLargaDeIso } from "./fechas";

const d = new Date("2026-11-20T15:00:00Z"); // 10:00 en Bogotá

describe("fechas", () => {
  it("fecha corta en Bogotá", () => expect(fechaCorta(d)).toBe("20/11/2026"));
  it("fecha corta usa UTC para fechas sin hora", () => expect(fechaCorta(new Date("1990-05-04T00:00:00Z"), true)).toBe("04/05/1990"));
  it("fecha y hora legibles", () => expect(fechaHora(d)).toBe("vie, 20 de nov, 10:00 a. m."));
  it("fecha y hora completas", () => expect(fechaHoraCompleta(d)).toBe("20/11/2026, 10:00 a. m."));
  it("fecha larga sin mayúsculas raras", () => expect(fechaLarga(d)).toBe("viernes 20 de noviembre de 2026"));
  it("fecha larga desde ISO", () => expect(fechaLargaDeIso("2026-11-20")).toBe("viernes 20 de noviembre de 2026"));
  it("iso respeta la medianoche de Bogotá", () => {
    expect(fechaIso(new Date("2026-11-21T04:59:00Z"))).toBe("2026-11-20");
    expect(fechaIso(new Date("2026-11-21T05:00:00Z"))).toBe("2026-11-21");
  });
  it("nulos", () => expect(fechaCorta(null)).toBe("—"));
});
