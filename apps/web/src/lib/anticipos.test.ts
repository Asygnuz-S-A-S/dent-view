import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/eventos", () => ({ registrarEvento: vi.fn(async () => ({})) }));
const { aplicarAnticipo } = await import("./anticipos");

const db = {
  factura: { id: "F1", pacienteId: "P1", numero: 1, total: 80000, estado: "ABIERTA", pagos: [] as { valor: number }[] },
  anticipo: { id: "A1", pacienteId: "P1", estado: "DISPONIBLE", valor: 50000, valorAplicado: 0 },
  pagos: [] as { valor: number; medio: string; anticipoId: string }[],
};
const tx = {
  $queryRaw: vi.fn(async () => []),
  factura: { findFirst: vi.fn(async () => ({ ...db.factura, pagos: [...db.factura.pagos] })), update: vi.fn(async ({ data }: { data: { estado: string } }) => { db.factura.estado = data.estado; }) },
  anticipo: { findFirst: vi.fn(async () => ({ ...db.anticipo })), update: vi.fn(async ({ data }: { data: { valorAplicado: number; estado: string } }) => { Object.assign(db.anticipo, data); }) },
  pago: { create: vi.fn(async ({ data }: { data: { valor: number; medio: string; anticipoId: string } }) => { db.pagos.push(data); db.factura.pagos.push(data); }) },
};
const aplicar = () => aplicarAnticipo(tx as never, { organizationId: "O1", anticipoId: "A1", facturaId: "F1", actorId: "U1" });

describe("aplicarAnticipo", () => {
  beforeEach(() => {
    Object.assign(db.factura, { total: 80000, estado: "ABIERTA", pagos: [] });
    Object.assign(db.anticipo, { pacienteId: "P1", estado: "DISPONIBLE", valor: 50000, valorAplicado: 0 });
    db.pagos.length = 0;
  });

  it("crea un Pago ANTICIPO y consume el anticipo", async () => {
    expect(await aplicar()).toBeNull();
    expect(db.pagos).toEqual([expect.objectContaining({ valor: 50000, medio: "ANTICIPO", anticipoId: "A1" })]);
    expect(db.anticipo).toMatchObject({ valorAplicado: 50000, estado: "APLICADO" });
    expect(db.factura.estado).toBe("ABIERTA"); // faltan 30.000
  });
  it("no pasa del saldo: aplica parcial y el anticipo sigue disponible", async () => {
    db.factura.total = 20000;
    expect(await aplicar()).toBeNull();
    expect(db.pagos[0].valor).toBe(20000);
    expect(db.anticipo).toMatchObject({ valorAplicado: 20000, estado: "DISPONIBLE" });
    expect(db.factura.estado).toBe("PAGADA");
  });
  it("no se aplica dos veces ni a otro paciente ni a cuenta cerrada", async () => {
    db.anticipo.estado = "APLICADO";
    expect(await aplicar()).toMatch(/ya no está disponible/);
    db.anticipo.estado = "DISPONIBLE"; db.anticipo.pacienteId = "P2";
    expect(await aplicar()).toMatch(/otro paciente/);
    db.anticipo.pacienteId = "P1"; db.factura.estado = "PAGADA";
    expect(await aplicar()).toMatch(/no está abierta/);
    expect(db.pagos).toHaveLength(0);
  });
  it("un pago anulado del anticipo no cuenta para el saldo al aplicar", async () => {
    db.factura.pagos = [{ valor: 80000, anuladoEn: new Date() } as never];
    expect(await aplicar()).toBeNull();
    expect(db.pagos[0].valor).toBe(50000);
  });
});
