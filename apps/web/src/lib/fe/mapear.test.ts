import { describe, expect, it } from "vitest";
import { ErrorMapeo, mapearAdquirente, mapearFactura, mapearNotaCredito, type ConfigMapeo, type EntradaFactura } from "./mapear";

const cfg: ConfigMapeo = { nit: "800197268", dv: "4", razonSocial: "Centro Dental SAS", nombreComercial: null, regimen: "Común", responsabilidadFiscal: "O-47", codigoPrestador: "110010000101", prefijoFactura: "SETP", modalidadDefecto: "01", generaRips: true };
const base: EntradaFactura = {
  numero: 7, fecha: new Date("2026-11-20T15:00:00Z"), vence: null, notas: null, total: 150000, estado: "PAGADA",
  paciente: { nombre: "Ana Pérez", tipoDocumento: "CC", numeroDocumento: "1.020.304", correo: "ana@example.com", direccion: null, celular: null },
  convenio: null,
  items: [{ descripcion: "Panorámica", cantidad: 1, valorUnitario: 100000, descuento: 0, servicioId: "S1", codigoCups: "870113" }, { descripcion: "Cefalométrica", cantidad: 1, valorUnitario: 50000, descuento: 0, servicioId: "S2", codigoCups: "870107" }],
  pagos: [{ valor: 100000, medio: "EFECTIVO", fecha: new Date("2026-11-20T16:00:00Z"), anuladoEn: null }, { valor: 50000, medio: "ANTICIPO", fecha: new Date("2026-11-20T16:00:00Z"), anuladoEn: null }, { valor: 999, medio: "EFECTIVO", fecha: new Date(), anuladoEn: new Date() }],
};

describe("mapearFactura", () => {
  it("mapea emisor, adquirente, líneas con CUPS y sin IVA por defecto", () => {
    const f = mapearFactura(base, cfg);
    expect(f.referencia).toBe("FC-0007");
    expect(f.fecha).toBe("2026-11-20");
    expect(f.emisor).toMatchObject({ nit: "800197268", dv: "4" });
    expect(f.adquirente).toMatchObject({ tipoDocumento: "13", numeroDocumento: "1020304", tipoPersona: "NATURAL" });
    expect(f.lineas.map((l) => l.codigoCups)).toEqual(["870113", "870107"]);
    expect(f.lineas[0]!.impuesto).toEqual({ tipo: "EXCLUIDO", tarifa: 0 });
    expect(f).toMatchObject({ subtotal: 150000, impuestos: 0, total: 150000, formaPago: "CONTADO" });
  });
  it("medios de pago reales (sin pagos anulados) y anticipos", () => {
    const f = mapearFactura(base, cfg);
    expect(f.mediosPago.map((m) => [m.codigoDian, m.valor])).toEqual([["10", 100000], ["1", 50000]]);
    expect(f.anticipos).toBe(50000);
  });
  it("extensión de salud: cobertura 15 (Particular) por defecto y datos del convenio cuando existen", () => {
    expect(mapearFactura(base, cfg).salud).toMatchObject({ codigoPrestador: "110010000101", coberturaPlanBeneficios: "15", numeroContrato: null, anticipo: 50000 });
    const conv = { ...base, convenio: { nombre: "EPS Sana", nit: "800197268", nitPagador: null, cucon: "CUCON-1", coberturaPlan: "01" } };
    const f = mapearFactura(conv, cfg);
    expect(f.salud).toMatchObject({ coberturaPlanBeneficios: "01", numeroContrato: "CUCON-1" });
    expect(f.adquirente).toMatchObject({ tipoDocumento: "31", numeroDocumento: "800197268", dv: "4", tipoPersona: "JURIDICA", nombre: "EPS Sana" });
  });
  it("sin generaRips no hay extensión de salud", () => expect(mapearFactura(base, { ...cfg, generaRips: false }).salud).toBeNull());
  it("IVA configurable", () => {
    const f = mapearFactura(base, { ...cfg, tratamientoIva: "IVA_19" });
    expect(f).toMatchObject({ subtotal: 150000, impuestos: 28500, total: 178500 });
  });
  it("falla con mensajes legibles", () => {
    expect(() => mapearFactura(base, { ...cfg, nit: null })).toThrow(ErrorMapeo);
    expect(() => mapearFactura(base, { ...cfg, dv: "9" })).toThrow(/dígito de verificación/);
    expect(() => mapearFactura(base, { ...cfg, codigoPrestador: "123" })).toThrow(/12 dígitos/);
    expect(() => mapearAdquirente({ ...base.paciente!, tipoDocumento: "ZZ" }, null)).toThrow(/ZZ/);
    expect(() => mapearAdquirente(null, null)).toThrow(/a quién facturar/);
  });
});

describe("mapearNotaCredito", () => {
  const origen = { idExterno: "X1", numeroDian: "SETP1", cufe: "abc", fecha: new Date("2026-11-20T15:00:00Z") };
  it("anulación total = motivo 2; parcial = 1; lleva el CUFE de origen", () => {
    const total = mapearNotaCredito({ consecutivo: 3, fecha: new Date("2026-11-21T15:00:00Z"), valor: 150000, motivo: "Error de facturación", totalOrigen: 150000 }, origen, base, cfg);
    expect(total).toMatchObject({ referencia: "NC-0003", motivoDian: "2", total: 150000, origen: { cufe: "abc", fecha: "2026-11-20" } });
    const parcial = mapearNotaCredito({ consecutivo: 4, fecha: new Date(), valor: 50000, motivo: "Devolución parcial", totalOrigen: 150000 }, origen, base, cfg);
    expect(parcial.motivoDian).toBe("1");
  });
  it("exige CUFE de origen", () => {
    expect(() => mapearNotaCredito({ consecutivo: 1, fecha: new Date(), valor: 1, motivo: "x", totalOrigen: 1 }, { ...origen, cufe: null }, base, cfg)).toThrow(/CUFE/);
  });
});
