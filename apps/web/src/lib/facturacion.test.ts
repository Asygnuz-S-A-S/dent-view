import { describe, expect, it } from "vitest";
import { estadoTrasPago, montoAplicable, motivoValido, numeroFactura, saldo, totalItems, totalPagado, validarAbono, validarNotaCredito } from "./facturacion";

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
  it("los pagos anulados no suman ni cuentan para el saldo", () => {
    const pagos = [{ valor: 40000 }, { valor: 60000, anuladoEn: new Date() }];
    expect(totalPagado(pagos)).toBe(40000);
    expect(saldo(100000, pagos)).toBe(60000);
    expect(estadoTrasPago(100000, pagos)).toBe("ABIERTA");
  });
  it("saldo negativo = a favor (nota crédito sobre cuenta pagada)", () => expect(saldo(70000, [{ valor: 100000 }])).toBe(-30000));
  it("montoAplicable respeta lo que queda del anticipo y el saldo", () => {
    expect(montoAplicable({ valor: 50000, valorAplicado: 0 }, 80000)).toBe(50000);
    expect(montoAplicable({ valor: 50000, valorAplicado: 20000 }, 80000)).toBe(30000);
    expect(montoAplicable({ valor: 50000, valorAplicado: 0 }, 20000)).toBe(20000);
    expect(montoAplicable({ valor: 50000, valorAplicado: 50000 }, 20000)).toBe(0);
    expect(montoAplicable({ valor: 50000, valorAplicado: 0 }, -5)).toBe(0);
  });
  it("motivoValido exige 5 caracteres útiles", () => {
    expect(motivoValido("  ab  ")).toBeNull();
    expect(motivoValido(undefined)).toBeNull();
    expect(motivoValido(" error de digitación ")).toBe("error de digitación");
  });
  it("validarNotaCredito: entero > 0 y no mayor a lo pagado", () => {
    expect(validarNotaCredito(1000, 5000, 5000)).toBeNull();
    expect(validarNotaCredito(5000, 5000, 5000)).toBeNull();
    expect(validarNotaCredito(5001, 5000, 5000)).not.toBeNull();
    expect(validarNotaCredito(0, 5000, 5000)).not.toBeNull();
    expect(validarNotaCredito(1.5, 5000, 5000)).not.toBeNull();
    // Notas acumuladas: pagado 100 y total ya reducido a 0 por una nota previa de 100
    expect(validarNotaCredito(100, 100, 0)).toMatch(/total vigente/);
    expect(validarNotaCredito(40, 100, 30)).not.toBeNull();
  });
});
