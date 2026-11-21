import { prisma } from "@dent-view/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearInvitacion, invitacionVigente, responderInvitacion } from "./invitaciones";

const manana = new Date(Date.now() + 86_400_000);
const ayer = new Date(Date.now() - 86_400_000);

describe("invitacionVigente", () => {
  const base = { status: "pending", expiresAt: manana, email: "Ana@x.co", role: "recepcion" };
  it("solo la responde su destinatario, pendiente y vigente", () => {
    expect(invitacionVigente(base, "ana@x.co")).toBe(true);
    expect(invitacionVigente(base, "otro@x.co")).toBe(false);
    expect(invitacionVigente({ ...base, status: "accepted" }, "ana@x.co")).toBe(false);
    expect(invitacionVigente({ ...base, expiresAt: ayer }, "ana@x.co")).toBe(false);
  });
});

// Requiere la BD de desarrollo: se omite si no hay DATABASE_URL.
describe.skipIf(!process.env.DATABASE_URL)("invitaciones (A2)", () => {
  const s = `${Date.now()}`;
  const org = `inv-${s}`;
  const [admin, invitado, intruso] = [`ia-${s}`, `ii-${s}`, `ix-${s}`];
  const correo = (id: string) => `${id}@test.local`;

  beforeAll(async () => {
    await prisma.organization.create({ data: { id: org, name: org, slug: org } });
    for (const id of [admin, invitado, intruso]) await prisma.user.create({ data: { id, name: id, email: correo(id), emailVerified: true } });
  });
  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: org } });
    await prisma.user.deleteMany({ where: { id: { in: [admin, invitado, intruso] } } });
    await prisma.$disconnect();
  });

  it("crear la invitación no crea la membresía; otro usuario no puede aceptarla", async () => {
    const inv = await crearInvitacion(org, admin, correo(invitado), "recepcion");
    expect(await prisma.member.count({ where: { organizationId: org, userId: invitado } })).toBe(0);
    expect(await responderInvitacion(inv.id, { id: intruso, email: correo(intruso), emailVerified: true }, true)).toHaveProperty("error");
    expect(await prisma.member.count({ where: { organizationId: org } })).toBe(0);
  });

  it("el invitado acepta: queda miembro con el rol de la invitación y no puede reutilizarla", async () => {
    const inv = await prisma.invitation.findFirstOrThrow({ where: { organizationId: org, status: "pending" } });
    // N1: cuenta sin correo verificado no puede aceptar.
    expect(await responderInvitacion(inv.id, { id: invitado, email: correo(invitado), emailVerified: false }, true)).toHaveProperty("error");
    expect(await responderInvitacion(inv.id, { id: invitado, email: correo(invitado), emailVerified: true }, true)).toEqual({ ok: true });
    expect(await prisma.member.findFirstOrThrow({ where: { organizationId: org, userId: invitado } })).toMatchObject({ role: "recepcion" });
    expect(await responderInvitacion(inv.id, { id: invitado, email: correo(invitado), emailVerified: true }, true)).toHaveProperty("error");
  });

  it("rechazar no crea membresía", async () => {
    const inv = await crearInvitacion(org, admin, correo(intruso), "especialista");
    expect(await responderInvitacion(inv.id, { id: intruso, email: correo(intruso), emailVerified: true }, false)).toEqual({ ok: true });
    expect(await prisma.member.count({ where: { organizationId: org, userId: intruso } })).toBe(0);
  });
});
