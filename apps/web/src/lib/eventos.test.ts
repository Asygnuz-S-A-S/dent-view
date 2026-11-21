import { prisma } from "@dent-view/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("./sesion", () => ({ obtenerSesion: async () => null }));
const { registrarEvento } = await import("./eventos");

// Requiere la BD de desarrollo: se omite si no hay DATABASE_URL.
describe.skipIf(!process.env.DATABASE_URL)("emisión de webhooks desde registrarEvento", () => {
  const s = `${Date.now()}`;
  const orgs = [`wha-${s}`, `whb-${s}`];
  const hook: Record<string, string> = {};
  const crear = (org: string, eventos: string[], activo = true) =>
    prisma.webhook.create({ data: { organizationId: org, nombre: "t", url: "https://x.example.com/h", secretoCifrado: "x", eventos, activo } });

  beforeAll(async () => {
    for (const id of orgs) await prisma.organization.create({ data: { id, name: id, slug: id } });
    hook.a = (await crear(orgs[0]!, ["orden.creada"])).id;
    hook.todos = (await crear(orgs[0]!, ["*"])).id;
    hook.otro = (await crear(orgs[0]!, ["cita.creada"])).id;
    hook.inactivo = (await crear(orgs[0]!, ["orden.creada"], false)).id;
    hook.b = (await crear(orgs[1]!, ["*"])).id;
  });
  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
    await prisma.$disconnect();
  });
  const entregas = (org: string) => prisma.webhookEntrega.findMany({ where: { organizationId: org } });

  it("encola solo para webhooks activos y suscritos del mismo centro, con payload mínimo", async () => {
    await registrarEvento({ organizationId: orgs[0]!, tipo: "orden.creada", detalle: { ordenId: "o1", numero: 7, notaClinica: "no debe salir" } });
    const e = await entregas(orgs[0]!);
    expect(e.map((x) => x.webhookId).sort()).toEqual([hook.a, hook.todos].sort());
    expect(e[0]).toMatchObject({ estado: "PENDIENTE", intentos: 0, evento: "orden.creada" });
    expect(e[0]!.payload).toMatchObject({ evento: "orden.creada", version: 1, centro: { id: orgs[0], slug: orgs[0] }, datos: { ordenId: "o1", numero: 7 } });
    expect(JSON.stringify(e[0]!.payload)).not.toContain("no debe salir");
    expect(await entregas(orgs[1]!)).toHaveLength(0); // aislamiento entre centros
  });
  it("tipos no públicos no encolan nada", async () => {
    await registrarEvento({ organizationId: orgs[1]!, tipo: "nota.creada", detalle: { notaId: "n" } });
    expect(await entregas(orgs[1]!)).toHaveLength(0);
  });
  it("dentro de una transacción que se revierte tampoco quedan entregas", async () => {
    await prisma.$transaction(async (tx) => {
      await registrarEvento({ organizationId: orgs[1]!, tipo: "cita.creada", detalle: { citaId: "c" } }, tx);
      throw new Error("revertir");
    }).catch(() => {});
    expect(await entregas(orgs[1]!)).toHaveLength(0);
    await registrarEvento({ organizationId: orgs[1]!, tipo: "cita.creada", detalle: { citaId: "c" } });
    expect(await entregas(orgs[1]!)).toHaveLength(1);
  });
});
