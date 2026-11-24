import { beforeEach, describe, expect, it, vi } from "vitest";

const ROLES: { actual: string } = { actual: "admin_tenant" };
const exigir = vi.fn(async (roles?: readonly string[]) => {
  if (roles && !roles.includes(ROLES.actual)) throw new Error("NO_AUTORIZADO");
  return { usuario: { id: "U1" }, organizationId: "O1", rol: ROLES.actual };
});
vi.mock("@/lib/sesion", () => ({ exigirContexto: exigir }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
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
  anticipo: { findFirst: vi.fn(async () => ({ id: "A1", valor: 50000, valorAplicado: 50000, estado: "APLICADO" })), update: vi.fn(async ({ data }: { data: object }) => { updates.anticipo.push(data); }) },
  notaCredito: {
    aggregate: vi.fn(async () => ({ _max: { consecutivo: notas.length ? notas.length : null } })),
    create: vi.fn(async ({ data }: { data: (typeof notas)[number] }) => { notas.push(data); }),
  },
};
const prisma = {
  $transaction: (f: (t: typeof tx) => unknown) => f(tx),
  pago: { findFirst: vi.fn(async () => ({ facturaId: "F1" })) },
};
vi.mock("@dent-view/db", () => ({ prisma }));

const { anularFactura, anularPago, crearNotaCredito } = await import("./actions");
const pago = (over = {}) => ({ id: "G1", valor: 100000, medio: "EFECTIVO", anuladoEn: null, anticipoId: null, ...over });

beforeEach(() => {
  ROLES.actual = "admin_tenant";
  Object.assign(factura, { total: 100000, estado: "ABIERTA", pagos: [] });
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
