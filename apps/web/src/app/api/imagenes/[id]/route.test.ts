import { beforeEach, describe, expect, it, vi } from "vitest";

let rol = "recepcion";
let claveS3 = "tenants/O1/imagenes/I1/orden.pdf";
const borrar = vi.fn();
vi.mock("@dent-view/db", () => ({ prisma: { imagenEstudio: { findFirst: async () => ({ id: "I1", pacienteId: "P1", claveS3, nombreOriginal: "o.pdf", mime: "application/pdf" }), delete: (a: unknown) => borrar(a) } } }));
vi.mock("@/lib/imagenes-servidor", () => ({ contextoImagenes: async () => ({ usuario: { id: "U1" }, organizationId: "O1", rol }), mismoOrigen: () => true, borrarS3: vi.fn(), leerS3: vi.fn(), sinCache: {} }));
vi.mock("@/lib/eventos", () => ({ registrarEvento: vi.fn() }));

const { DELETE } = await import("./route");
const eliminar = () => DELETE(new Request("http://x/api/imagenes/I1", { method: "DELETE" }), { params: Promise.resolve({ id: "I1" }) });

beforeEach(() => { vi.clearAllMocks(); rol = "recepcion"; claveS3 = "tenants/O1/imagenes/I1/orden.pdf"; });

describe("DELETE /api/imagenes/[id]", () => {
  it("las órdenes y documentos solo los elimina el administrador", async () => {
    expect((await eliminar()).status).toBe(403);
    rol = "especialista";
    expect((await eliminar()).status).toBe(403);
    expect(borrar).not.toHaveBeenCalled();
    rol = "admin_tenant";
    expect((await eliminar()).status).toBe(200);
    expect(borrar).toHaveBeenCalledOnce();
  });
  it("las imágenes (galería) siguen pudiéndolas eliminar los roles clínicos", async () => {
    claveS3 = "tenants/O1/imagenes/I1/original.jpg";
    expect((await eliminar()).status).toBe(200);
  });
});
