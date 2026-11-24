import { beforeEach, describe, expect, it, vi } from "vitest";

const tipo = { actual: "CENTRO_RADIOLOGICO" };
vi.mock("./tipo-centro-servidor", () => ({ tipoDeCentro: async () => tipo.actual }));
vi.mock("@dent-view/db", () => ({ prisma: {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(f: T) => f }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); }, redirect: () => { throw new Error("NEXT_REDIRECT"); } }));
vi.mock("./auth", () => ({ auth: { api: { getSession: async () => null } } }));

const { exigirModulo, respuestaSinModulo } = await import("./sesion");
const ctx = { organizationId: "O1" };

describe("exigirModulo / respuestaSinModulo", () => {
  beforeEach(() => { tipo.actual = "CENTRO_RADIOLOGICO"; });
  it("módulo deshabilitado para el tipo: 404 en acciones y en rutas API", async () => {
    await expect(exigirModulo(ctx, "valoraciones")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(exigirModulo(ctx, "crm")).rejects.toThrow("NEXT_NOT_FOUND");
    expect((await respuestaSinModulo(ctx, "valoraciones"))?.status).toBe(404);
  });
  it("módulo habilitado: sigue", async () => {
    await expect(exigirModulo(ctx, "seguimiento-doctores")).resolves.toBeUndefined();
    expect(await respuestaSinModulo(ctx, "seguimiento-doctores")).toBeNull();
    tipo.actual = "CENTRO_ODONTOLOGICO";
    await expect(exigirModulo(ctx, "valoraciones")).resolves.toBeUndefined();
    await expect(exigirModulo(ctx, "seguimiento-doctores")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
