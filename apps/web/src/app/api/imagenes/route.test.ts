import { describe, expect, it, vi } from "vitest";

const formData = vi.fn();
vi.mock("@dent-view/db", () => ({ prisma: {} }));
vi.mock("@/lib/imagenes-servidor", () => ({ contextoImagenes: async () => ({ usuario: { id: "U-img" }, organizationId: "O1" }), mismoOrigen: () => true, guardarS3: vi.fn(), borrarS3: vi.fn() }));
vi.mock("@/lib/eventos", () => ({ registrarEvento: vi.fn() }));

const { POST } = await import("./route");
const pedir = (cl?: string) => {
  const req = new Request("http://x/api/imagenes", { method: "POST", headers: cl ? { "content-length": cl } : {} });
  req.formData = formData;
  return POST(req);
};

describe("POST /api/imagenes: tope de 150 MB antes de leer el cuerpo", () => {
  it("413 si Content-Length supera 150 MB o falta, sin llamar a formData()", async () => {
    expect((await pedir(String(150 * 1024 * 1024 + 1))).status).toBe(413);
    expect((await pedir()).status).toBe(413);
    expect(formData).not.toHaveBeenCalled();
  });
});
