import { describe, expect, it } from "vitest";
import { esquemaAnticipoPlan, esquemaPlanManual, estadoItemTrasOrden, estadoPlanTras, itemsDeCotizacion, puedeCancelarPlan, repartirNeto, resumenPlan } from "./planes";

const l = (o: Partial<Parameters<typeof itemsDeCotizacion>[0][number]> = {}) => ({ servicioId: "S1", descripcion: "Resina", diente: null, fase: 1, posicion: 0, cantidad: 1, valorUnitario: 100_000, descuento: 0, ...o });

describe("repartirNeto", () => {
  it("no pierde pesos al repartir", () => {
    expect(repartirNeto(100, 3)).toEqual([34, 33, 33]);
    expect(repartirNeto(100, 3).reduce((a, b) => a + b, 0)).toBe(100);
    expect(repartirNeto(0, 2)).toEqual([0, 0]);
  });
});

describe("itemsDeCotizacion", () => {
  it("expande por cantidad, congela el neto y deja fuera lo libre", () => {
    const r = itemsDeCotizacion([l({ cantidad: 2, valorUnitario: 50_000, descuento: 10_000 }), l({ servicioId: null, descripcion: "Libre" }), l({ fase: 2, valorUnitario: 30_000 })]);
    expect(r.items.map((i) => i.precio)).toEqual([45_000, 45_000, 30_000]);
    expect(r.items.map((i) => i.posicion)).toEqual([0, 1, 2]);
    expect(r.libres).toBe(1);
  });
  it("el neto nunca es negativo", () => {
    expect(itemsDeCotizacion([l({ valorUnitario: 10, descuento: 99 })]).items[0]!.precio).toBe(0);
  });
});

describe("resumenPlan", () => {
  const items = [{ precio: 100, estado: "REALIZADO" as const }, { precio: 100, estado: "EN_ORDEN" as const }, { precio: 100, estado: "PENDIENTE" as const }];
  it("avance y saldo bajan con lo realizado (solo realizado cuenta)", () => {
    const r = resumenPlan(items);
    expect(r).toMatchObject({ total: 300, realizado: 100, enOrden: 100, pendiente: 100, saldo: 200, avancePct: 33 });
    expect(resumenPlan(items.map((i) => ({ ...i, estado: i.precio ? ("REALIZADO" as const) : i.estado }))).avancePct).toBe(100);
    expect(resumenPlan([items[0]!, items[0]!, items[2]!]).avancePct).toBe(67);
  });
  it("el anticipo disponible descuenta del saldo por pagar", () => {
    const r = resumenPlan(items, [{ valor: 150, valorAplicado: 20 }]);
    expect(r).toMatchObject({ anticipoTotal: 150, anticipoAplicado: 20, anticipoDisponible: 130, saldo: 200, saldoPorPagar: 70 });
    expect(resumenPlan(items, [{ valor: 900, valorAplicado: 0 }]).saldoPorPagar).toBe(0);
  });
  it("plan sin ítems o con total 0 no divide por cero", () => {
    expect(resumenPlan([]).avancePct).toBe(0);
    expect(resumenPlan([{ precio: 0, estado: "REALIZADO" }]).avancePct).toBe(100);
  });
});

describe("transiciones", () => {
  it("estado del ítem según la orden", () => {
    expect(estadoItemTrasOrden("SOLICITADA")).toBeNull();
    expect(estadoItemTrasOrden("AGENDADA")).toBeNull();
    for (const e of ["TOMADA", "INFORMADA", "ENTREGADA"] as const) expect(estadoItemTrasOrden(e)).toBe("REALIZADO");
    expect(estadoItemTrasOrden("CANCELADA")).toBe("PENDIENTE");
  });
  it("el plan se completa y se reabre; el cancelado no cambia", () => {
    expect(estadoPlanTras("ACTIVO", [{ estado: "REALIZADO" }, { estado: "REALIZADO" }])).toBe("COMPLETADO");
    expect(estadoPlanTras("COMPLETADO", [{ estado: "REALIZADO" }, { estado: "PENDIENTE" }])).toBe("ACTIVO");
    expect(estadoPlanTras("CANCELADO", [{ estado: "REALIZADO" }])).toBe("CANCELADO");
    expect(estadoPlanTras("ACTIVO", [])).toBe("ACTIVO");
  });
  it("solo se cancela un plan activo sin ítems en orden", () => {
    expect(puedeCancelarPlan("ACTIVO", [{ estado: "PENDIENTE" }, { estado: "REALIZADO" }])).toBe(true);
    expect(puedeCancelarPlan("ACTIVO", [{ estado: "EN_ORDEN" }])).toBe(false);
    expect(puedeCancelarPlan("COMPLETADO", [])).toBe(false);
  });
});

describe("validación", () => {
  it("plan manual exige ítems y rechaza campos extra", () => {
    expect(esquemaPlanManual.safeParse({ pacienteId: "P", items: [] }).success).toBe(false);
    expect(esquemaPlanManual.safeParse({ pacienteId: "P", items: [{ servicioId: "S", cantidad: 1, precio: 1 }] }).success).toBe(false);
    expect(esquemaPlanManual.safeParse({ pacienteId: "P", items: [{ servicioId: "S", cantidad: 2 }] }).success).toBe(true);
  });
  it("anticipo: entero, mínimo y medio manual", () => {
    expect(esquemaAnticipoPlan.safeParse({ monto: 50_000, medio: "EFECTIVO" }).success).toBe(true);
    expect(esquemaAnticipoPlan.safeParse({ monto: 500, medio: "EFECTIVO" }).success).toBe(false);
    expect(esquemaAnticipoPlan.safeParse({ monto: 50_000, medio: "ANTICIPO" }).success).toBe(false);
    expect(esquemaAnticipoPlan.safeParse({ monto: 10.5, medio: "OTRO" }).success).toBe(false);
  });
});
