import { beforeEach, describe, expect, it, vi } from "vitest";

const exigir = vi.fn(async (roles?: readonly string[]) => ({ usuario: { id: "U1" }, organizationId: "O1", rol: "especialista", roles }));
vi.mock("@/lib/sesion", () => ({ exigirContexto: exigir }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/eventos", () => ({ registrarEvento: vi.fn(async () => ({})) }));
const prisma: Record<string, any> & { $transaction: (f: (t: unknown) => unknown) => Promise<unknown> } = {
  pacienteTenant: { findFirst: vi.fn(async () => ({ id: "P1" })) },
  notaClinica: {
    findFirst: vi.fn(async () => ({ id: "N0", fecha: new Date("2026-11-19T15:00:00Z") })),
    create: vi.fn(async ({ data }: { data: { texto: string } }) => ({ id: "N1", ...data })),
  },
  planTratamientoItem: { findFirst: vi.fn(async () => ({ id: "I1", pacienteId: "P1", estado: "PLANEADO" })), update: vi.fn(async () => ({})), aggregate: vi.fn(async () => ({ _max: { posicion: 0 } })), create: vi.fn(async () => ({ id: "I2" })) },
  condicionDental: { findMany: vi.fn(async () => [{ diente: 16, superficie: null, condicion: "caries", notas: null }]), deleteMany: vi.fn(async () => ({})), create: vi.fn(async () => ({})) },
  odontogramaHistorial: { create: vi.fn(async () => ({})) },
  $transaction: async (f: (t: unknown) => unknown) => f(prisma),
};
vi.mock("@dent-view/db", () => ({ prisma }));

const clinico = await import("./clinico-actions");
const pacientes = await import("../pacientes/actions");
const { MEDICOS } = await import("@/lib/roles");

beforeEach(() => vi.clearAllMocks());

describe("permisos clínicos: solo MEDICOS (recepción no)", () => {
  it("crear nota, agregar/cambiar/mover plan y odontograma piden MEDICOS", async () => {
    await clinico.crearNota("P1", "texto");
    await clinico.agregarItemPlan({ pacienteId: "P1", descripcion: "Resina" });
    await clinico.cambiarEstadoPlan("I1", "ACEPTADO");
    await clinico.moverItemPlan("I1", 1).catch(() => {});
    await pacientes.guardarCondicion({ pacienteId: "P1", diente: 16, condicion: "caries" });
    expect(exigir.mock.calls.length).toBeGreaterThanOrEqual(5);
    for (const [roles] of exigir.mock.calls) {
      expect(roles).toEqual(MEDICOS);
      expect(roles).not.toContain("recepcion");
    }
  });
});

describe("notas clínicas inmodificables", () => {
  it("no existe editarNota", () => expect("editarNota" in clinico).toBe(false));
  it("una corrección es una nota nueva que cita la anterior", async () => {
    expect(await clinico.crearNota("P1", "Dice caries, era fractura", "N0")).toEqual({});
    expect(prisma.notaClinica.create.mock.calls[0][0].data.texto).toMatch(/^\[Corrige la nota del .+\] Dice caries, era fractura$/);
  });
  it("corregir una nota inexistente falla sin crear nada", async () => {
    prisma.notaClinica.findFirst.mockResolvedValueOnce(null as never);
    expect(await clinico.crearNota("P1", "x", "NX")).toEqual({ error: "Nota a corregir no encontrada" });
    expect(prisma.notaClinica.create).not.toHaveBeenCalled();
  });
});

describe("odontograma con historial", () => {
  it("guarda el estado previo con autor antes de sobrescribir", async () => {
    await pacientes.guardarCondicion({ pacienteId: "P1", diente: 16, condicion: null });
    const h = prisma.odontogramaHistorial.create.mock.calls[0][0].data;
    expect(h).toMatchObject({ organizationId: "O1", pacienteId: "P1", autorId: "U1", snapshot: [{ diente: 16, condicion: "caries" }] });
    // El historial se guarda antes de borrar la condición.
    expect(prisma.odontogramaHistorial.create.mock.invocationCallOrder[0]).toBeLessThan(prisma.condicionDental.deleteMany.mock.invocationCallOrder[0]);
  });
});
