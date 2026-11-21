import { describe, expect, it } from "vitest";
import { estadoTrasPago, numeroFactura, saldo, totalItems, validarAbono } from "./facturacion";

describe("facturacion", () => {
  it("numeroFactura rellena a 4 dígitos", () => expect(numeroFactura(7)).toBe("FC-0007"));
  it("totalItems suma cantidad por valor", () => expect(totalItems([{ cantidad: 2, valorUnitario: 50000 }, { cantidad: 1, valorUnitario: 10000 }])).toBe(110000));
  it("saldo descuenta los pagos", () => expect(saldo(100000, [{ valor: 30000 }, { valor: 20000 }])).toBe(50000));
  it("estadoTrasPago pasa a PAGADA con saldo 0", () => {
    expect(estadoTrasPago(100000, [{ valor: 100000 }])).toBe("PAGADA");
    expect(estadoTrasPago(100000, [{ valor: 40000 }])).toBe("ABIERTA");
  });
  it("validarAbono", () => {
    expect(validarAbono(50000, 50000)).toBeNull();
    expect(validarAbono(0, 50000)).not.toBeNull();
    expect(validarAbono(-5, 50000)).not.toBeNull();
    expect(validarAbono(10.5, 50000)).not.toBeNull();
    expect(validarAbono(50001, 50000)).toBe("El abono no puede superar el saldo");
  });
});
