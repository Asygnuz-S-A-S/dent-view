import { beforeEach, describe, expect, it, vi } from "vitest";

// Doble en memoria de lo que usa procesarEvento: reproduce la restricción única de EventoPasarela y el bloqueo del link.
const estado = { eventos: new Set<string>(), pagos: [] as { valor: number; medio: string }[], link: { id: "L1", facturaId: "F1", monto: 50000, moneda: "COP", estado: "CREADO" }, factura: { id: "F1", pacienteId: null, numero: 1, total: 50000, estado: "ABIERTA" } };
const tx = {
  eventoPasarela: {
    create: vi.fn(async ({ data }: { data: { idEventoExterno: string } }) => {
      if (estado.eventos.has(data.idEventoExterno)) throw Object.assign(new Error("unique"), { code: "P2002" });
      estado.eventos.add(data.idEventoExterno);
      return { id: "E" + estado.eventos.size };
    }),
    update: vi.fn(async () => ({})),
  },
  linkPago: {
    findFirst: vi.fn(async () => ({ id: "L1" })),
    findUniqueOrThrow: vi.fn(async () => estado.link),
    update: vi.fn(async ({ data }: { data: { estado: string } }) => { estado.link.estado = data.estado; }),
  },
  factura: { findFirst: vi.fn(async () => ({ ...estado.factura, pagos: estado.pagos })), update: vi.fn(async ({ data }: { data: { estado: string } }) => { estado.factura.estado = data.estado; }) },
  pago: { create: vi.fn(async ({ data }: { data: { valor: number; medio: string } }) => { estado.pagos.push(data); }) },
  evento: { create: vi.fn(async () => ({})) },
  $queryRaw: vi.fn(async () => []),
};
vi.mock("@dent-view/db", () => ({ prisma: { $transaction: (f: (t: typeof tx) => unknown) => f(tx) } }));
vi.mock("@/lib/eventos", () => ({ registrarEvento: vi.fn(async () => ({})) }));

const { procesarEvento } = await import("./servicio");
const pasarela = { id: "P1", organizationId: "O1", proveedor: "WOMPI" as const, modo: "SANDBOX" as const };
const ev = (over = {}) => ({ referencia: null, idExterno: "LINK", estado: "APROBADO" as const, monto: 50000, moneda: "COP", idEventoExterno: "T1:APPROVED", idTransaccion: "T1", ...over });

describe("procesarEvento", () => {
  beforeEach(() => { estado.eventos.clear(); estado.pagos.length = 0; estado.link.estado = "CREADO"; estado.factura.estado = "ABIERTA"; });

  it("aprobado: crea un Pago PASARELA y deja la cuenta pagada", async () => {
    expect(await procesarEvento(pasarela, ev())).toBe("aplicado");
    expect(estado.pagos[0]).toMatchObject({ valor: 50000, medio: "PASARELA", linkPagoId: "L1", referenciaExterna: "T1" });
    expect(estado.link.estado).toBe("APROBADO");
    expect(estado.factura.estado).toBe("PAGADA");
  });
  it("el mismo evento repetido no duplica el pago", async () => {
    await procesarEvento(pasarela, ev());
    expect(await procesarEvento(pasarela, ev())).toBe("duplicado");
    expect(estado.pagos).toHaveLength(1);
  });
  it("otro evento aprobado del mismo link tampoco duplica", async () => {
    await procesarEvento(pasarela, ev());
    expect(await procesarEvento(pasarela, ev({ idEventoExterno: "T2:APPROVED" }))).toBe("ignorado");
    expect(estado.pagos).toHaveLength(1);
  });
  it("monto distinto: no registra pago", async () => {
    expect(await procesarEvento(pasarela, ev({ monto: 1 }))).toBe("ignorado");
    expect(estado.pagos).toHaveLength(0);
    expect(estado.link.estado).toBe("CREADO");
  });
  it("pago parcial: la cuenta sigue abierta", async () => {
    estado.link.monto = 20000;
    expect(await procesarEvento(pasarela, ev({ monto: 20000 }))).toBe("aplicado");
    expect(estado.factura.estado).toBe("ABIERTA");
    estado.link.monto = 50000;
  });
});
