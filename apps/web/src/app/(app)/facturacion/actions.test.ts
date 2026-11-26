import { beforeEach, describe, expect, it, vi } from "vitest";

const ROLES: { actual: string } = { actual: "admin_tenant" };
const exigir = vi.fn(async (roles?: readonly string[]) => {
  if (roles && !roles.includes(ROLES.actual)) throw new Error("NO_AUTORIZADO");
  return { usuario: { id: "U1" }, organizationId: "O1", rol: ROLES.actual };
});
vi.mock("@/lib/sesion", () => ({ exigirContexto: exigir }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const fe = { documento: null as string | null, vigentes: 0 };
const prepararNotaFe = vi.fn(async () => fe.documento);
const procesarDocumento = vi.fn(async () => "ACEPTADA");
vi.mock("@/lib/fe/servicio", () => ({ prepararNotaFe, procesarDocumento }));
vi.mock("@/lib/eventos", () => ({ registrarEvento: vi.fn(async () => ({})) }));

const factura = { id: "F1", pacienteId: "P1", numero: 3, total: 100000, estado: "ABIERTA", pagos: [] as { id: string; valor: number; medio: string; anuladoEn: Date | null; anticipoId: string | null }[] };
const notas: { consecutivo: number; valor: number; motivo: string }[] = [];
const updates = { factura: [] as object[], pago: [] as object[], anticipo: [] as object[] };
const tx = {
  $queryRaw: vi.fn(async () => []),
  factura: {
    findFirst: vi.fn(async () => ({ ...factura, pagos: factura.pagos.filter((p) => !p.anuladoEn), _filtrados: true })),
    findFirstOrThrow: vi.fn(async () => ({ ...factura })),
    update: vi.fn(async ({ data }: { data: object }) => { updates.factura.push(data); Object.assign(factura, data); }),
  },
  pago: { update: vi.fn(async ({ data }: { data: object }) => { updates.pago.push(data); }) },
  documentoElectronico: { count: vi.fn(async () => fe.vigentes) },
  anticipo: { findFirst: vi.fn(async () => ({ id: "A1", valor: 50000, valorAplicado: 50000, estado: "APLICADO" })), update: vi.fn(async ({ data }: { data: object }) => { updates.anticipo.push(data); }) },
  notaCredito: {
    aggregate: vi.fn(async () => ({ _max: { consecutivo: notas.length ? notas.length : null } })),
    create: vi.fn(async ({ data }: { data: (typeof notas)[number] }) => { notas.push(data); return { id: `N${notas.length}` }; }),
  },
};
const prisma = {
  $transaction: (f: (t: typeof tx) => unknown) => f(tx),
  pago: { findFirst: vi.fn(async () => ({ facturaId: "F1" })) },
  pacienteTenant: { findFirst: vi.fn(async () => ({ id: "P1" })) },
  orden: { findFirst: vi.fn(async () => ({ pacienteId: "P1", convenioId: "CV1", items: [{ nombre: "Panorámica", opciones: null, precio: 90000, servicioId: "S1" }, { nombre: "Cefalo", opciones: "A", precio: 10000, servicioId: null }] })) },
  convenio: { findFirst: vi.fn(async () => ({ id: "CV1" })) },
};
vi.mock("@dent-view/db", () => ({ prisma }));

const { anularFactura, anularPago, crearFactura, crearNotaCredito } = await import("./actions");
const pago = (over = {}) => ({ id: "G1", valor: 100000, medio: "EFECTIVO", anuladoEn: null, anticipoId: null, ...over });

beforeEach(() => {
  ROLES.actual = "admin_tenant";
  Object.assign(factura, { total: 100000, estado: "ABIERTA", pagos: [] });
  fe.documento = null; fe.vigentes = 0; procesarDocumento.mockClear(); prepararNotaFe.mockClear();
  notas.length = 0; updates.factura.length = 0; updates.pago.length = 0; updates.anticipo.length = 0;
});

describe("anularFactura", () => {
  it("exige motivo de al menos 5 caracteres", async () => {
    expect(await anularFactura("F1", "  ab ")).toEqual({ error: expect.stringContaining("motivo") });
    expect(updates.factura).toHaveLength(0);
  });
  it("guarda motivo, quién y cuándo", async () => {
    expect(await anularFactura("F1", "Orden duplicada")).toEqual({});
    expect(updates.factura[0]).toMatchObject({ estado: "ANULADA", anuladoPorId: "U1", motivoAnulacion: "Orden duplicada", anuladoEn: expect.any(Date) });
  });
  it("con pagos vigentes no se anula; con solo pagos anulados sí", async () => {
    factura.pagos = [pago()];
    expect(await anularFactura("F1", "Orden duplicada")).toEqual({ error: expect.stringContaining("pagos") });
    factura.pagos = [pago({ anuladoEn: new Date() })];
    expect(await anularFactura("F1", "Orden duplicada")).toEqual({});
  });
});

describe("anularPago", () => {
  it("solo admin_tenant", async () => {
    ROLES.actual = "recepcion";
    await expect(anularPago("G1", "Cobro duplicado")).rejects.toThrow("NO_AUTORIZADO");
    expect(updates.pago).toHaveLength(0);
  });
  it("exige motivo", async () => {
    expect(await anularPago("G1", "x")).toEqual({ error: expect.stringContaining("motivo") });
  });
  it("marca el pago (no lo borra) y reabre la cuenta pagada", async () => {
    factura.estado = "PAGADA"; factura.pagos = [pago()];
    expect(await anularPago("G1", "Cobro duplicado")).toEqual({});
    expect(updates.pago[0]).toMatchObject({ anuladoPorId: "U1", motivoAnulacion: "Cobro duplicado", anuladoEn: expect.any(Date) });
    expect(factura.estado).toBe("ABIERTA");
  });
  it("un pago de anticipo devuelve lo aplicado al anticipo", async () => {
    factura.estado = "PAGADA"; factura.pagos = [pago({ valor: 50000, anticipoId: "A1" }), pago({ id: "G2", valor: 50000 })];
    await anularPago("G1", "Aplicado por error");
    expect(updates.anticipo[0]).toMatchObject({ valorAplicado: 0, estado: "DISPONIBLE" });
    expect(factura.estado).toBe("ABIERTA");
  });
  it("no anula dos veces", async () => {
    factura.pagos = [pago({ anuladoEn: new Date() })];
    expect(await anularPago("G1", "Cobro duplicado")).toEqual({ error: "El pago ya está anulado" });
  });
});

describe("crearNotaCredito", () => {
  it("solo admin_tenant", async () => {
    ROLES.actual = "recepcion";
    await expect(crearNotaCredito("F1", { valor: 1000, motivo: "Descuento pactado" })).rejects.toThrow("NO_AUTORIZADO");
  });
  it("solo sobre cuentas pagadas y con valor <= pagado", async () => {
    expect(await crearNotaCredito("F1", { valor: 1000, motivo: "Descuento pactado" })).toEqual({ error: expect.stringContaining("pagadas") });
    factura.estado = "PAGADA"; factura.pagos = [pago()];
    expect(await crearNotaCredito("F1", { valor: 100001, motivo: "Descuento pactado" })).toEqual({ error: expect.stringContaining("superar") });
    expect(await crearNotaCredito("F1", { valor: 1000, motivo: "no" })).toEqual({ error: expect.stringContaining("motivo") });
    expect(notas).toHaveLength(0);
  });
  it("inserta la nota con consecutivo y reduce el total de la cuenta", async () => {
    factura.estado = "PAGADA"; factura.pagos = [pago()];
    expect(await crearNotaCredito("F1", { valor: 30000, motivo: "Descuento pactado" })).toEqual({});
    expect(notas[0]).toMatchObject({ consecutivo: 1, valor: 30000, motivo: "Descuento pactado" });
    expect(factura.total).toBe(70000);
  });
});

describe("notas crédito acumulables", () => {
  it("dos notas de 100 sobre una cuenta pagada de 100: la segunda falla y el total no queda negativo", async () => {
    factura.estado = "PAGADA"; factura.pagos = [pago({ valor: 100 })]; factura.total = 100;
    expect(await crearNotaCredito("F1", { valor: 100, motivo: "Descuento pactado" })).toEqual({});
    expect(await crearNotaCredito("F1", { valor: 100, motivo: "Descuento repetido" })).toEqual({ error: expect.stringContaining("total vigente") });
    expect(notas).toHaveLength(1);
    expect(factura.total).toBe(0);
  });
});

describe("crearFactura con valores extremos", () => {
  const base = { pacienteId: "P1", responsable: "PACIENTE" as const };
  it("un ítem por encima de mil millones se rechaza con mensaje en español (no revienta la BD)", async () => {
    expect(await crearFactura({ ...base, items: [{ descripcion: "x", cantidad: 1, valorUnitario: 3_000_000_000 }] })).toEqual({ error: expect.stringContaining("no puede superar") });
  });
  it("un total que no cabe en Int4 se rechaza", async () => {
    expect(await crearFactura({ ...base, items: [{ descripcion: "x", cantidad: 3, valorUnitario: 1_000_000_000 }] })).toEqual({ error: expect.stringContaining("2.000.000.000") });
  });
});

describe("facturación electrónica", () => {
  it("una cuenta con FEV vigente no se anula (se corrige con nota crédito electrónica)", async () => {
    fe.vigentes = 1;
    expect(await anularFactura("F1", "Orden duplicada")).toEqual({ error: expect.stringContaining("nota crédito electrónica") });
    expect(updates.factura).toHaveLength(0);
  });
  it("la nota crédito interna con FEV aceptada deja su documento electrónico y lo procesa fuera de la transacción", async () => {
    factura.estado = "PAGADA"; factura.pagos = [pago()];
    fe.documento = "D1";
    expect(await crearNotaCredito("F1", { valor: 30000, motivo: "Descuento pactado" })).toEqual({});
    expect(prepararNotaFe).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ notaCreditoId: "N1", facturaId: "F1" }));
    expect(procesarDocumento).toHaveBeenCalledWith("D1");
    expect(factura.total).toBe(70000); // la nota interna se conserva
  });
  it("si el proveedor falla al procesar, la nota interna igual queda creada", async () => {
    factura.estado = "PAGADA"; factura.pagos = [pago()];
    fe.documento = "D1";
    procesarDocumento.mockRejectedValueOnce(new Error("proveedor caído"));
    expect(await crearNotaCredito("F1", { valor: 30000, motivo: "Descuento pactado" })).toEqual({});
    expect(notas).toHaveLength(1);
  });
  it("sin FEV no se procesa nada (comportamiento de siempre)", async () => {
    factura.estado = "PAGADA"; factura.pagos = [pago()];
    await crearNotaCredito("F1", { valor: 30000, motivo: "Descuento pactado" });
    expect(procesarDocumento).not.toHaveBeenCalled();
  });
});

describe("crearFactura desde una orden conserva servicioId y convenioId", () => {
  it("copia servicioId de cada ítem y el convenio real", async () => {
    const creadas: { data: { convenioId: string | null; items: { create: { servicioId?: string | null }[] } } }[] = [];
    (tx as unknown as { factura: Record<string, unknown> }).factura.aggregate = vi.fn(async () => ({ _max: { numero: 0 } }));
    (tx as unknown as { factura: Record<string, unknown> }).factura.count = vi.fn(async () => 0);
    (tx as unknown as { factura: Record<string, unknown> }).factura.create = vi.fn(async (a: (typeof creadas)[number]) => { creadas.push(a); return { id: "F9", numero: 1 }; });
    expect(await crearFactura({ ordenId: "OR1", responsable: "CONVENIO", convenio: "EPS Sana" })).toEqual({ id: "F9" });
    expect(creadas[0]!.data.convenioId).toBe("CV1");
    expect(creadas[0]!.data.items.create.map((i) => i.servicioId)).toEqual(["S1", null]);
  });
});
