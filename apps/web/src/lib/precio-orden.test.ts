import { describe, expect, it } from "vitest";
import { desglosarPrecios, ORIGEN_CONGELADO } from "./precio-orden";

const servicio = { id: "s1", precioImpreso: 120_000, precioDigital: 100_000, descuento: 10_000 };
const convenio = (extra: object = {}) => ({ id: "c", nombre: "Conv", activo: true, descuentoGeneral: 20, vigenteDesde: null, vigenteHasta: null, tarifas: {}, ...extra });
const base = { servicios: [servicio], entrega: "DIGITAL" as const, tarifasDoctor: {}, doctorId: null, fecha: "2026-11-20", convenio: null };
const item = (precio: number) => [{ id: "i1", servicioId: "s1", nombre: "Pano", opciones: null, precio }];

describe("desglosarPrecios", () => {
  it("catálogo: precio − descuento del catálogo, sin descuento extra", () => {
    const r = desglosarPrecios({ ...base, items: item(90_000) });
    expect(r.filas[0]).toMatchObject({ catalogo: 90_000, origen: "Catálogo", descuento: 0 });
    expect(r.total).toBe(90_000);
  });
  it("convenio con descuento general: muestra origen y descuento frente al catálogo", () => {
    const r = desglosarPrecios({ ...base, convenio: convenio(), items: item(72_000) });
    expect(r.filas[0]).toMatchObject({ origen: "Descuento del convenio", descuento: 18_000 });
    expect(r.descuentoTotal).toBe(18_000);
    expect(r.total).toBe(72_000);
  });
  it("tarifa del convenio y tarifa del doctor (esta gana)", () => {
    const tarifas = { s1: { precioImpreso: null, precioDigital: 60_000 } };
    expect(desglosarPrecios({ ...base, convenio: convenio({ tarifas }), items: item(60_000) }).filas[0]!.origen).toBe("Tarifa del convenio");
    const r = desglosarPrecios({ ...base, convenio: convenio({ tarifas }), tarifasDoctor: { d1: { s1: { precioImpreso: null, precioDigital: 50_000 } } }, doctorId: "d1", items: item(50_000) });
    expect(r.filas[0]).toMatchObject({ origen: "Tarifa del doctor", descuento: 40_000 });
  });
  it("si la tarifa cambió después de crear la orden, queda como congelado; servicio borrado también", () => {
    expect(desglosarPrecios({ ...base, items: item(80_000) }).filas[0]!.origen).toBe(ORIGEN_CONGELADO);
    const r = desglosarPrecios({ ...base, servicios: [], items: item(80_000) });
    expect(r.filas[0]).toMatchObject({ catalogo: null, origen: ORIGEN_CONGELADO, descuento: 0 });
  });
  it("convenio vencido se ignora", () => {
    const r = desglosarPrecios({ ...base, convenio: convenio({ vigenteHasta: "2026-01-01" }), items: item(90_000) });
    expect(r.filas[0]!.origen).toBe("Catálogo");
  });
});
