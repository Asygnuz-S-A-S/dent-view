import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = { ctx: null as null | { rol: string; puedeValorar: boolean; organizationId: string; usuario: { id: string } }, modulo: true };
vi.mock("@dent-view/db", () => ({ prisma: { valoracionMedia: { findFirst: vi.fn(async () => ({ id: "M1", tipo: "FOTO", claveS3: "tenants/O1/valoraciones/V1/M1/original.jpg", mime: "image/jpeg" })) } } }));
vi.mock("@/lib/eventos", () => ({ registrarEvento: vi.fn(async () => ({})) }));
vi.mock("@/lib/sesion", () => ({ respuestaSinModulo: async () => (estado.modulo ? null : new Response(null, { status: 404 })) }));
vi.mock("@/lib/valoraciones-servidor", () => ({
  contextoValoraciones: async () => estado.ctx,
  valoracionVisible: async () => ({ id: "V1", pacienteId: null }),
  servirObjeto: async () => new Response("ok", { status: 200 }),
}));

const { GET } = await import("./route");
const pedir = (v = "") => GET(new Request(`http://x/api/valoraciones/V1/medios/M1${v}`), { params: Promise.resolve({ id: "V1", mediaId: "M1" }) });
const ctx = (rol: string, puedeValorar: boolean) => ({ rol, puedeValorar, organizationId: "O1", usuario: { id: "U1" } });

describe("GET /api/valoraciones/[id]/medios/[mediaId]", () => {
  beforeEach(() => { estado.ctx = ctx("especialista", true); estado.modulo = true; });
  it("sin sesión: 401", async () => { estado.ctx = null; expect((await pedir()).status).toBe(401); });
  it("recepción no ve fotos ni video ni el original: 403", async () => {
    estado.ctx = ctx("recepcion", false);
    expect((await pedir()).status).toBe(403);
    expect((await pedir("?v=original")).status).toBe(403);
    expect((await pedir("?v=thumb")).status).toBe(403);
  });
  it("quien valora sí las ve", async () => { expect((await pedir()).status).toBe(200); });
  it("centro sin el módulo (p. ej. radiológico): 404 aunque tenga el rol", async () => {
    estado.modulo = false;
    expect((await pedir()).status).toBe(404);
  });
});
