import { beforeEach, describe, expect, it, vi } from "vitest";

const formData = vi.fn();
let rol = "recepcion";
const ordenFind = vi.fn();
const crear = vi.fn();
const guardarS3 = vi.fn();
vi.mock("@dent-view/db", () => ({
  prisma: { pacienteTenant: { findFirst: async () => ({ id: "P1" }) }, orden: { findFirst: (a: unknown) => ordenFind(a) }, estudio: { findFirst: async () => null }, imagenEstudio: { create: (a: unknown) => crear(a) } },
}));
vi.mock("@/lib/imagenes-servidor", () => ({ contextoCarga: async () => ({ usuario: { id: "U-img" }, organizationId: "O1", rol }), mismoOrigen: () => true, guardarS3: (...a: unknown[]) => guardarS3(...a), borrarS3: vi.fn() }));
vi.mock("@/lib/eventos", () => ({ registrarEvento: vi.fn() }));

const { POST } = await import("./route");
const pedir = (cl?: string) => {
  const req = new Request("http://x/api/imagenes", { method: "POST", headers: cl ? { "content-length": cl } : {} });
  req.formData = formData;
  return POST(req);
};
const pdf = () => new File(["%PDF-1.7\n1 0 obj"], "orden.pdf", { type: "application/pdf" });
const form = (campos: Record<string, string>, archivos: File[]) => {
  const f = new FormData();
  Object.entries(campos).forEach(([k, v]) => f.set(k, v));
  archivos.forEach((a) => f.append("archivos", a));
  return f;
};

beforeEach(() => { rol = "recepcion"; vi.clearAllMocks(); ordenFind.mockResolvedValue({ id: "O-1" }); });

describe("POST /api/imagenes: tope de 150 MB antes de leer el cuerpo", () => {
  it("413 si Content-Length supera 150 MB o falta, sin llamar a formData()", async () => {
    expect((await pedir(String(150 * 1024 * 1024 + 1))).status).toBe(413);
    expect((await pedir()).status).toBe(413);
    expect(formData).not.toHaveBeenCalled();
  });
});

describe("POST /api/imagenes: PDF y doctor remitente", () => {
  it("recepción sube un PDF como orden médica (sin variantes) y la orden se acota al centro y paciente", async () => {
    formData.mockResolvedValue(form({ pacienteId: "P1", ordenId: "O-1", categoria: "orden" }, [pdf()]));
    const r = await pedir("1000");
    expect(r.status).toBe(200);
    expect(guardarS3).toHaveBeenCalledTimes(1);
    expect(crear.mock.calls[0]![0].data).toMatchObject({ mime: "application/pdf", ordenId: "O-1", organizationId: "O1" });
    expect(crear.mock.calls[0]![0].data.claveS3).toMatch(/\/orden\.pdf$/);
    expect(ordenFind.mock.calls[0]![0].where).not.toHaveProperty("doctorRemitenteId");
  });
  it("un archivo falso con extensión .jpg se rechaza por su firma", async () => {
    formData.mockResolvedValue(form({ pacienteId: "P1", categoria: "foto" }, [new File(["no soy imagen"], "falso.jpg", { type: "image/jpeg" })]));
    const r = await pedir("1000");
    expect(r.status).toBe(400);
    expect(guardarS3).not.toHaveBeenCalled();
  });
  it("el doctor remitente solo adjunta la orden médica: otra categoría da 403", async () => {
    rol = "doctor_remitente";
    formData.mockResolvedValue(form({ pacienteId: "P1", ordenId: "O-1", categoria: "foto" }, [pdf()]));
    expect((await pedir("1000")).status).toBe(403);
    expect(guardarS3).not.toHaveBeenCalled();
  });
  it("el doctor remitente debe indicar una orden y la búsqueda exige que sea suya", async () => {
    rol = "doctor_remitente";
    formData.mockResolvedValue(form({ pacienteId: "P1", categoria: "orden" }, [pdf()]));
    expect((await pedir("1000")).status).toBe(400);
    ordenFind.mockResolvedValue(null); // la orden es de otro doctor: indistinguible de inexistente
    formData.mockResolvedValue(form({ pacienteId: "P1", ordenId: "O-ajena", categoria: "orden" }, [pdf()]));
    expect((await pedir("1000")).status).toBe(404);
    expect(ordenFind.mock.calls.at(-1)![0].where).toMatchObject({ doctorRemitenteId: "U-img", organizationId: "O1", pacienteId: "P1" });
    expect(crear).not.toHaveBeenCalled();
  });
  it("el doctor remitente adjunta el PDF a su propia orden", async () => {
    rol = "doctor_remitente";
    formData.mockResolvedValue(form({ pacienteId: "P1", ordenId: "O-1", categoria: "orden" }, [pdf()]));
    expect((await pedir("1000")).status).toBe(200);
    expect(crear).toHaveBeenCalledOnce();
  });
});
