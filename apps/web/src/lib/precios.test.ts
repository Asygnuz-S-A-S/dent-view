import { describe, expect, it } from "vitest";
import { convenioVigente, hoyBogota, precioFinal, resolverPrecio, totalOrden, type ConvenioPrecio } from "./precios";

const s = { precioImpreso: 60000, precioDigital: 50000, descuento: 10000 };

describe("precioFinal", () => {
  it("resta el descuento según la entrega", () => {
    expect(precioFinal(s, "IMPRESA")).toBe(50000);
    expect(precioFinal(s, "DIGITAL")).toBe(40000);
  });
  it("usa el otro precio si falta el de la entrega", () => {
    expect(precioFinal({ precioImpreso: null, precioDigital: 80000, descuento: 0 }, "IMPRESA")).toBe(80000);
    expect(precioFinal({ precioImpreso: 90000, precioDigital: null, descuento: 0 }, "DIGITAL")).toBe(90000);
  });
  it("devuelve null sin precios y nunca negativo", () => {
    expect(precioFinal({ precioImpreso: null, precioDigital: null, descuento: 0 }, "DIGITAL")).toBeNull();
    expect(precioFinal({ precioImpreso: 5000, precioDigital: 5000, descuento: 9000 }, "DIGITAL")).toBe(0);
  });
});

describe("totalOrden", () => {
  it("suma los precios", () => {
    expect(totalOrden([{ precio: 50000 }, { precio: 150000 }])).toBe(200000);
    expect(totalOrden([])).toBe(0);
  });
});

const HOY = "2026-11-20";
const conv = (o: Partial<ConvenioPrecio> = {}): ConvenioPrecio => ({ activo: true, descuentoGeneral: null, vigenteDesde: null, vigenteHasta: null, ...o });
const base = { servicio: s, entrega: "DIGITAL" as const, fecha: HOY };

describe("resolverPrecio", () => {
  it("sin convenio ni tarifas devuelve el catálogo", () => {
    expect(resolverPrecio(base)).toEqual({ precio: 40000, origen: "CATALOGO" });
  });
  it("catálogo sin precio devuelve null aun con descuento general", () => {
    const sin = { precioImpreso: null, precioDigital: null, descuento: 0 };
    expect(resolverPrecio({ ...base, servicio: sin, convenio: conv({ descuentoGeneral: 10 }) })).toEqual({ precio: null, origen: "CATALOGO" });
  });
  it("el descuento general se aplica sobre el precio final del catálogo", () => {
    expect(resolverPrecio({ ...base, convenio: conv({ descuentoGeneral: 10 }) })).toEqual({ precio: 36000, origen: "CONVENIO_DESCUENTO" });
    expect(resolverPrecio({ ...base, convenio: conv({ descuentoGeneral: 33 }), entrega: "IMPRESA" })).toEqual({ precio: 33500, origen: "CONVENIO_DESCUENTO" });
  });
  it("descuento 0, nulo o fuera de rango", () => {
    expect(resolverPrecio({ ...base, convenio: conv({ descuentoGeneral: 0 }) }).origen).toBe("CATALOGO");
    expect(resolverPrecio({ ...base, convenio: conv({ descuentoGeneral: null }) }).origen).toBe("CATALOGO");
    expect(resolverPrecio({ ...base, convenio: conv({ descuentoGeneral: 150 }) }).precio).toBe(0);
    expect(resolverPrecio({ ...base, convenio: conv({ descuentoGeneral: -5 }) }).origen).toBe("CATALOGO");
  });
  it("la tarifa del convenio gana al descuento general", () => {
    const convenio = conv({ descuentoGeneral: 10, tarifa: { precioImpreso: 30000, precioDigital: 25000 } });
    expect(resolverPrecio({ ...base, convenio })).toEqual({ precio: 25000, origen: "CONVENIO_TARIFA" });
    expect(resolverPrecio({ ...base, convenio, entrega: "IMPRESA" })).toEqual({ precio: 30000, origen: "CONVENIO_TARIFA" });
  });
  it("tarifa con solo un precio sirve para ambas entregas; vacía se ignora", () => {
    expect(resolverPrecio({ ...base, convenio: conv({ tarifa: { precioImpreso: 30000, precioDigital: null } }) }).precio).toBe(30000);
    expect(resolverPrecio({ ...base, convenio: conv({ tarifa: { precioImpreso: null, precioDigital: null } }) }).origen).toBe("CATALOGO");
  });
  it("la tarifa del doctor gana a todo y funciona sin convenio", () => {
    const tarifaDoctor = { precioImpreso: 20000, precioDigital: 15000 };
    const convenio = conv({ descuentoGeneral: 50, tarifa: { precioImpreso: 1, precioDigital: 1 } });
    expect(resolverPrecio({ ...base, tarifaDoctor, convenio })).toEqual({ precio: 15000, origen: "DOCTOR" });
    expect(resolverPrecio({ ...base, tarifaDoctor })).toEqual({ precio: 15000, origen: "DOCTOR" });
    expect(resolverPrecio({ ...base, tarifaDoctor, entrega: "IMPRESA" }).precio).toBe(20000);
  });
  it("tarifa doctor vacía cae al convenio", () => {
    expect(resolverPrecio({ ...base, tarifaDoctor: { precioImpreso: null, precioDigital: null }, convenio: conv({ descuentoGeneral: 10 }) }).origen).toBe("CONVENIO_DESCUENTO");
  });
  it("un precio de tarifa 0 es válido (gratis)", () => {
    expect(resolverPrecio({ ...base, tarifaDoctor: { precioImpreso: 0, precioDigital: 0 } })).toEqual({ precio: 0, origen: "DOCTOR" });
  });
  it("ignora convenio inactivo o fuera de vigencia, pero no la tarifa del doctor", () => {
    const c = { descuentoGeneral: 10, tarifa: { precioImpreso: 1000, precioDigital: 1000 } };
    expect(resolverPrecio({ ...base, convenio: conv({ ...c, activo: false }) }).origen).toBe("CATALOGO");
    expect(resolverPrecio({ ...base, convenio: conv({ ...c, vigenteHasta: "2026-11-19" }) }).origen).toBe("CATALOGO");
    expect(resolverPrecio({ ...base, convenio: conv({ ...c, vigenteDesde: "2026-11-21" }) }).origen).toBe("CATALOGO");
    expect(resolverPrecio({ ...base, convenio: conv({ ...c, activo: false }), tarifaDoctor: { precioImpreso: 5, precioDigital: 5 } }).origen).toBe("DOCTOR");
  });
  it("nunca devuelve negativo", () => {
    expect(resolverPrecio({ ...base, tarifaDoctor: { precioImpreso: -10, precioDigital: -10 } }).precio).toBe(0);
    expect(resolverPrecio({ ...base, servicio: { precioImpreso: 100, precioDigital: 100, descuento: 500 }, convenio: conv({ descuentoGeneral: 10 }) }).precio).toBe(0);
  });
});

describe("convenioVigente", () => {
  it("extremos inclusivos", () => {
    const c = { activo: true, vigenteDesde: HOY, vigenteHasta: HOY };
    expect(convenioVigente(c, HOY)).toBe(true);
    expect(convenioVigente(c, "2026-11-19")).toBe(false);
    expect(convenioVigente(c, "2026-11-21")).toBe(false);
  });
});

describe("hoyBogota", () => {
  it("usa el día calendario de Bogotá (UTC-5)", () => {
    expect(hoyBogota(new Date("2026-11-21T03:00:00Z"))).toBe("2026-11-20");
    expect(hoyBogota(new Date("2026-11-21T05:00:00Z"))).toBe("2026-11-21");
  });
});
