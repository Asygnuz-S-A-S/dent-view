import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  member: { findMany: vi.fn() }, user: { findUnique: vi.fn() },
  organization: { findUnique: vi.fn() }, configCentro: { findUnique: vi.fn() },
}));
vi.mock("@dent-view/db", () => ({ prisma: db }));
import { marcaDeCentro, marcaDeUsuario } from "./marca";
import { MARCA_PLATAFORMA } from "./plantilla";

beforeEach(() => {
  vi.resetAllMocks();
  db.organization.findUnique.mockResolvedValue({ name: "Radex" });
  db.configCentro.findUnique.mockResolvedValue({ nombre: null, colorPrimario: "#C2410C", logo: null, direccion: "Cra 7", telefono: null, correo: "c@r.co" });
  db.user.findUnique.mockResolvedValue({ role: null });
});

describe("marca del centro", () => {
  it("usa nombre, color validado y contacto del centro", async () => {
    expect(await marcaDeCentro("o1")).toMatchObject({ nombre: "Radex", color: "#c2410c", direccion: "Cra 7", correo: "c@r.co" });
  });
  it("color inválido → color de la plataforma", async () => {
    db.configCentro.findUnique.mockResolvedValue({ colorPrimario: "red;}" });
    expect((await marcaDeCentro("o1")).color).toBe(MARCA_PLATAFORMA.color);
  });
});

describe("marca por usuario (correos sin centro)", () => {
  it("un solo centro → marca del centro", async () => {
    db.member.findMany.mockResolvedValue([{ organizationId: "o1" }]);
    expect((await marcaDeUsuario("u1")).nombre).toBe("Radex");
  });
  it("varios centros → plataforma", async () => {
    db.member.findMany.mockResolvedValue([{ organizationId: "o1" }, { organizationId: "o2" }]);
    expect(await marcaDeUsuario("u1")).toBe(MARCA_PLATAFORMA);
  });
  it("sin centros o superadmin → plataforma", async () => {
    db.member.findMany.mockResolvedValue([]);
    expect(await marcaDeUsuario("u1")).toBe(MARCA_PLATAFORMA);
    db.member.findMany.mockResolvedValue([{ organizationId: "o1" }]);
    db.user.findUnique.mockResolvedValue({ role: "admin" });
    expect(await marcaDeUsuario("u1")).toBe(MARCA_PLATAFORMA);
  });
});
