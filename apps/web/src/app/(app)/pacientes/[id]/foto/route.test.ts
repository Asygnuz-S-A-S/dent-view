import { describe, expect, it, vi } from "vitest";

const formData = vi.fn();
vi.mock("@dent-view/db", () => ({ prisma: { pacienteTenant: { findFirst: vi.fn(async () => ({ id: "P1", fotoKey: null })) } } }));
vi.mock("@/lib/sesion", () => ({ contextoActivo: async () => ({ usuario: { id: "U1", debeCambiarClave: false }, organizationId: "O1", rol: "recepcion" }) }));
vi.mock("@/lib/s3", () => ({ s3: { send: vi.fn() } }));
vi.mock("@/lib/eventos", () => ({ registrarEvento: vi.fn() }));

const { POST } = await import("./route");
const pedir = (cl?: string) => {
  const req = new Request("http://x/pacientes/P1/foto", { method: "POST", headers: { origin: "http://x", ...(cl ? { "content-length": cl } : {}) } });
  req.formData = formData;
  return POST(req, { params: Promise.resolve({ id: "P1" }) });
};

describe("POST /pacientes/[id]/foto: tope antes de leer el cuerpo", () => {
  it("413 si Content-Length supera 6 MB o falta, sin llamar a formData()", async () => {
    expect((await pedir(String(6 * 1024 * 1024 + 1))).status).toBe(413);
    expect((await pedir()).status).toBe(413);
    expect(formData).not.toHaveBeenCalled();
  });
  it("dentro del tope sí lee el cuerpo", async () => {
    formData.mockResolvedValueOnce(new FormData());
    expect((await pedir("1000")).status).toBe(400); // "Elige una foto"
    expect(formData).toHaveBeenCalledTimes(1);
  });
});
