// Integración contra la BD de desarrollo (hace falta DATABASE_URL y los seeds). Se omite si no hay BD.
import { prisma } from "@dent-view/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// El registro de eventos lee la sesión de Better Auth (no existe aquí): se reemplaza por un insert directo.
vi.mock("@/lib/eventos", () => ({
  registrarEvento: (e: { organizationId: string; tipo: string; pacienteId?: string | null; actorId?: string | null; detalle?: object }, db: typeof prisma = prisma) => db.evento.create({ data: { ...e, detalle: e.detalle } }),
}));

const hayBD = !!process.env.DATABASE_URL;

describe.skipIf(!hayBD)("API pública contra la BD", () => {
  let orgA = "", orgB = "";
  let tokA = "", tokB = "", tokSoloLectura = "", tokVencido = "", tokRevocado = "";
  const creados: string[] = [];
  const ordenesCreadas: string[] = [];
  let ruta: { pacientes: typeof import("@/app/api/v1/pacientes/route"); pacienteId: typeof import("@/app/api/v1/pacientes/[id]/route"); ordenes: typeof import("@/app/api/v1/ordenes/route"); catalogo: typeof import("@/app/api/v1/catalogo/route") };

  const llamar = (h: (r: Request, s?: never) => Promise<Response>, token: string, ruta: string, init: RequestInit = {}) =>
    h(new Request(`http://localhost/api/v1${ruta}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers } }));
  const con = <P,>(h: unknown, id: string) => (r: Request) => (h as (r: Request, s: { params: Promise<P> }) => Promise<Response>)(r, { params: Promise.resolve({ id } as P) });

  async function nuevoToken(organizationId: string, permisos: string[], extra: { vence?: Date; revocadoEn?: Date } = {}) {
    const { generarTokenApi } = await import("./api-token");
    const t = generarTokenApi();
    const fila = await prisma.tokenApi.create({ data: { organizationId, nombre: "test-api-v1", prefijo: t.prefijo, tokenHash: t.tokenHash, permisos, ...extra } });
    creados.push(fila.id);
    return t.token;
  }

  beforeAll(async () => {
    const [a, b] = await Promise.all([prisma.organization.findUnique({ where: { slug: "radex-demo" } }), prisma.organization.findUnique({ where: { slug: "radex-2-demo" } })]);
    orgA = a!.id; orgB = b!.id;
    const { PERMISOS_API: TODOS_LOS_PERMISOS, SOLO_LECTURA } = await import("./api-token");
    [tokA, tokB, tokSoloLectura, tokVencido, tokRevocado] = await Promise.all([
      nuevoToken(orgA, TODOS_LOS_PERMISOS), nuevoToken(orgB, TODOS_LOS_PERMISOS), nuevoToken(orgA, SOLO_LECTURA),
      nuevoToken(orgA, SOLO_LECTURA, { vence: new Date(Date.now() - 1000) }), nuevoToken(orgA, SOLO_LECTURA, { revocadoEn: new Date() }),
    ]);
    ruta = {
      pacientes: await import("@/app/api/v1/pacientes/route"),
      pacienteId: await import("@/app/api/v1/pacientes/[id]/route"),
      ordenes: await import("@/app/api/v1/ordenes/route"),
      catalogo: await import("@/app/api/v1/catalogo/route"),
    };
  });

  afterAll(async () => {
    await prisma.ordenItem.deleteMany({ where: { ordenId: { in: ordenesCreadas } } });
    await prisma.orden.deleteMany({ where: { id: { in: ordenesCreadas } } });
    await prisma.evento.deleteMany({ where: { tipo: "orden.creada", detalle: { path: ["token"], string_starts_with: "dvk_" }, organizationId: orgA } });
    await prisma.claveIdempotencia.deleteMany({ where: { tokenId: { in: creados } } });
    await prisma.tokenApi.deleteMany({ where: { id: { in: creados } } });
  });

  it("autenticación: sin token, malformado, inexistente, vencido y revocado → mismo 401", async () => {
    const cuerpos = [];
    for (const t of ["", "dvk_malo", "dvk_AAAAAAAA_" + "A".repeat(43), tokVencido, tokRevocado]) {
      const r = await ruta.catalogo.GET(new Request("http://localhost/api/v1/catalogo", { headers: t ? { authorization: `Bearer ${t}` } : {} }));
      expect(r.status).toBe(401);
      cuerpos.push(await r.json());
    }
    expect(new Set(cuerpos.map((c) => JSON.stringify(c))).size).toBe(1);
    expect(cuerpos[0]).toEqual({ error: { codigo: "no_autenticado", mensaje: "Token ausente, inválido o revocado." } });
  });

  it("permisos: solo lectura puede listar pero no crear (403)", async () => {
    expect((await llamar(ruta.catalogo.GET, tokSoloLectura, "/catalogo")).status).toBe(200);
    const r = await llamar(ruta.pacientes.POST, tokSoloLectura, "/pacientes", { method: "POST", body: JSON.stringify({ tipoDocumento: "CC", numeroDocumento: "123456", nombre: "X Y" }) });
    expect(r.status).toBe(403);
  });

  it("aislamiento: un token del centro B no ve ni usa datos del centro A", async () => {
    const a = await (await llamar(ruta.pacientes.GET, tokA, "/pacientes?limite=100")).json();
    const b = await (await llamar(ruta.pacientes.GET, tokB, "/pacientes?limite=100")).json();
    expect(a.datos.length).toBeGreaterThan(0);
    const idsA = new Set(a.datos.map((p: { id: string }) => p.id));
    expect(b.datos.some((p: { id: string }) => idsA.has(p.id))).toBe(false);
    const idA = a.datos[0].id as string;
    expect((await llamar(con(ruta.pacienteId.GET, idA), tokB, `/pacientes/${idA}`)).status).toBe(404);
    expect((await llamar(con(ruta.pacienteId.PATCH, idA), tokB, `/pacientes/${idA}`, { method: "PATCH", body: JSON.stringify({ celular: "1" }) })).status).toBe(404);
    const cat = await (await llamar(ruta.catalogo.GET, tokA, "/catalogo?limite=1")).json();
    const orden = await llamar(ruta.ordenes.POST, tokB, "/ordenes", { method: "POST", body: JSON.stringify({ pacienteId: idA, servicios: [{ servicioId: cat.datos[0].id }] }) });
    expect(orden.status).toBe(422);
  });

  it("orden: el servidor recalcula el precio, rechaza precios del cliente y registra el origen api", async () => {
    const pac = (await (await llamar(ruta.pacientes.GET, tokA, "/pacientes?limite=1")).json()).datos[0];
    const serv = (await (await llamar(ruta.catalogo.GET, tokA, "/catalogo?limite=100")).json()).datos.find((s: { precioDigital: number | null }) => s.precioDigital) as { id: string; precioDigital: number; descuento: number };
    const cuerpo = { pacienteId: pac.id, entrega: "DIGITAL", servicios: [{ servicioId: serv.id }] };

    const conPrecio = await llamar(ruta.ordenes.POST, tokA, "/ordenes", { method: "POST", body: JSON.stringify({ ...cuerpo, precio: 1 }) });
    expect(conPrecio.status).toBe(422);

    const r = await llamar(ruta.ordenes.POST, tokA, "/ordenes", { method: "POST", body: JSON.stringify(cuerpo) });
    expect(r.status).toBe(201);
    const { orden } = await r.json();
    ordenesCreadas.push(orden.id);
    expect(orden.items[0].precio).toBe(Math.max(0, serv.precioDigital - serv.descuento));
    const ev = await prisma.evento.findFirst({ where: { organizationId: orgA, tipo: "orden.creada", detalle: { path: ["ordenId"], equals: orden.id } } });
    expect(ev?.detalle).toMatchObject({ origen: "api", token: expect.stringMatching(/^dvk_/) });
  });

  it("idempotencia: misma clave y petición → misma respuesta sin duplicar; otro cuerpo → 422", async () => {
    const pac = (await (await llamar(ruta.pacientes.GET, tokA, "/pacientes?limite=1")).json()).datos[0];
    const serv = (await (await llamar(ruta.catalogo.GET, tokA, "/catalogo?limite=2")).json()).datos;
    const clave = `test-${Date.now()}`;
    const enviar = (servicioId: string) => llamar(ruta.ordenes.POST, tokA, "/ordenes", { method: "POST", headers: { "idempotency-key": clave }, body: JSON.stringify({ pacienteId: pac.id, servicios: [{ servicioId }] }) });
    const r1 = await enviar(serv[0].id);
    const j1 = await r1.json();
    ordenesCreadas.push(j1.orden.id);
    const r2 = await enviar(serv[0].id);
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r2.headers.get("idempotent-replayed")).toBe("true");
    expect(await r2.json()).toEqual(j1);
    expect(await prisma.orden.count({ where: { organizationId: orgA, id: j1.orden.id } })).toBe(1);
    expect((await enviar(serv[1].id)).status).toBe(422);
    expect((await llamar(ruta.ordenes.POST, tokA, "/ordenes", { method: "POST", headers: { "idempotency-key": "x".repeat(81) }, body: "{}" })).status).toBe(400);
  });

  it("búsqueda q: solo separadores no equivale a «todos» y la fecha de nacimiento futura se rechaza", async () => {
    for (const q of ["---", ".", " . - "]) {
      const j = await (await llamar(ruta.pacientes.GET, tokA, `/pacientes?limite=100&q=${encodeURIComponent(q.trim() || q)}`)).json();
      expect(j.datos, `q=${q}`).toEqual([]);
    }
    const nuevo = (fechaNacimiento: string) => llamar(ruta.pacientes.POST, tokA, "/pacientes", { method: "POST", body: JSON.stringify({ tipoDocumento: "CC", numeroDocumento: "QAFN-1", nombre: "QA fecha nacimiento", fechaNacimiento }) });
    for (const f of ["2999-01-01", "1800-01-01"]) expect((await nuevo(f)).status, f).toBe(422);
  });

  it("paginación: recorrer con cursor no repite y respeta el límite; cursor falso → 400", async () => {
    const vistos: string[] = [];
    let cursor = "";
    for (let i = 0; i < 20; i++) {
      const j = await (await llamar(ruta.catalogo.GET, tokA, `/catalogo?limite=7${cursor ? `&cursor=${cursor}` : ""}`)).json();
      expect(j.datos.length).toBeLessThanOrEqual(7);
      vistos.push(...j.datos.map((s: { id: string }) => s.id));
      if (!j.siguienteCursor) break;
      cursor = j.siguienteCursor;
    }
    expect(new Set(vistos).size).toBe(vistos.length);
    expect(vistos.length).toBe(await prisma.servicio.count({ where: { organizationId: orgA, activo: true } }));
    expect((await llamar(ruta.catalogo.GET, tokA, "/catalogo?cursor=falso")).status).toBe(400);
    expect((await llamar(ruta.catalogo.GET, tokA, "/catalogo?limite=500")).status).toBe(400);
  });
});
