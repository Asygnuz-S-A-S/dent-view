import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { obtenerProveedor, proveedoresDisponibles, proveedorDeSlug, quitar, registrar } from "./registro";
import { firmaWebhookSimulado, pdfSimulado, simulado } from "./proveedores/simulado";
import { ErrorFE, llamarApi, type ContextoFE, type ProveedorFacturacionElectronica } from "./proveedor";

const ctx: ContextoFE = { llaves: { secretoWebhook: "s3cret" }, modo: "SANDBOX", config: {} };
const entorno = { ...process.env };
afterEach(() => { process.env = { ...entorno }; });

describe("simulador: solo localhost con FEV_SIMULADO=1", () => {
  it("fuera de localhost no está disponible ni emite", async () => {
    process.env.FEV_SIMULADO = "1";
    process.env.BETTER_AUTH_URL = "https://app.ejemplo.com";
    expect(obtenerProveedor("SIMULADO")).toBeNull();
    expect(proveedoresDisponibles().map((p) => p.clave)).not.toContain("SIMULADO");
    await expect(simulado.emitirFactura(ctx, {} as never, "fev:1")).rejects.toThrow(/localhost/);
  });
  it("sin FEV_SIMULADO tampoco, aunque sea localhost", () => {
    delete process.env.FEV_SIMULADO;
    process.env.BETTER_AUTH_URL = "https://localhost:8443";
    expect(obtenerProveedor("SIMULADO")).toBeNull();
  });
  it("en localhost con la variable: acepta con CUFE determinístico de 96 hex y marca de simulación", async () => {
    process.env.FEV_SIMULADO = "1";
    process.env.BETTER_AUTH_URL = "https://localhost:8443";
    const a = await simulado.emitirFactura(ctx, {} as never, "fev:1");
    const b = await simulado.emitirFactura(ctx, {} as never, "fev:1");
    expect(a).toEqual(b);
    expect(a.estado).toBe("ACEPTADA");
    expect(a.cufe).toMatch(/^[0-9a-f]{96}$/);
    expect((await simulado.emitirFactura(ctx, {} as never, "fev:2")).cufe).not.toBe(a.cufe);
  });
  it.each([["RECHAZAR", "RECHAZADA"], ["PROCESANDO", "PROCESANDO"]])("escenario %s", async (escenario, estado) => {
    process.env.FEV_SIMULADO = "1";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    expect((await simulado.emitirFactura({ ...ctx, config: { escenario } }, {} as never, "fev:1")).estado).toBe(estado);
  });
  it("escenario ERROR_TRANSITORIO lanza un error reintentable", async () => {
    process.env.FEV_SIMULADO = "1";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    await expect(simulado.emitirFactura({ ...ctx, config: { escenario: "ERROR_TRANSITORIO" } }, {} as never, "fev:1")).rejects.toMatchObject({ transitorio: true });
  });
  it("genera PDF y XML marcados SIN VALIDEZ FISCAL", async () => {
    process.env.FEV_SIMULADO = "1";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    const xml = await simulado.descargar(ctx, { idExterno: "SIM-abc", tipo: "FACTURA", que: "xml" });
    expect(Buffer.from(xml!.bytes).toString()).toContain("SIMULADO — SIN VALIDEZ FISCAL");
    const pdf = await simulado.descargar(ctx, { idExterno: "SIM-abc", tipo: "FACTURA", que: "pdf" });
    expect(Buffer.from(pdf!.bytes).subarray(0, 5).toString()).toBe("%PDF-");
    expect(Buffer.from(pdfSimulado(["a"])).toString("latin1")).toContain("%%EOF");
  });
});

describe("firma del webhook del simulador", () => {
  const cuerpo = JSON.stringify({ idExterno: "SIM-1", estado: "ACEPTADA", cufe: "c" });
  const e = (firma: string | null) => ({ headers: new Headers(firma ? { "x-fe-signature": firma } : {}), rawBody: cuerpo, llaves: { secretoWebhook: "s3cret" }, modo: "SANDBOX" as const });
  it("acepta la firma correcta y rechaza ausente, incorrecta o sin secreto", () => {
    expect(simulado.verificarWebhook!(e(firmaWebhookSimulado(cuerpo, "s3cret")))).toBe(true);
    expect(simulado.verificarWebhook!(e(null))).toBe(false);
    expect(simulado.verificarWebhook!(e(firmaWebhookSimulado(cuerpo, "otro")))).toBe(false);
    expect(simulado.verificarWebhook!({ ...e(firmaWebhookSimulado(cuerpo, "")), llaves: {} })).toBe(false);
  });
  it("mapea el evento", () => {
    expect(simulado.mapearEvento!(JSON.parse(cuerpo), e(null))).toMatchObject({ idExterno: "SIM-1", estado: "ACEPTADA", cufe: "c" });
    expect(simulado.mapearEvento!({ idExterno: "x", estado: "OTRO" }, e(null))).toBeNull();
  });
});

describe("contrato del registro: un proveedor nuevo solo requiere registrarlo", () => {
  const falso: ProveedorFacturacionElectronica = {
    clave: "FALSO", nombre: "Falso", descripcion: "Solo para la prueba", bloqueadoProduccion: false, soportaSalud: true, soportaCuv: false,
    campos: [{ clave: "token", etiqueta: "Token", secreto: true }],
    probarConexion: async () => ({ ok: true, mensaje: "ok" }),
    emitirFactura: async () => ({ estado: "ACEPTADA", idExterno: "F1", cufe: "c", mensajes: [] }),
    emitirNotaCredito: async () => ({ estado: "ACEPTADA", idExterno: "N1", cufe: "n", mensajes: [] }),
    consultarEstado: async () => ({ estado: "ACEPTADA", idExterno: "F1", mensajes: [] }),
    descargar: async () => null,
  };
  beforeEach(() => registrar(falso));
  afterEach(() => quitar("FALSO"));
  it("aparece en la lista (la UI se pinta de ella), se resuelve por clave y por slug", () => {
    expect(proveedoresDisponibles().map((p) => p.clave)).toContain("FALSO");
    expect(obtenerProveedor("FALSO")).toBe(falso);
    expect(proveedorDeSlug("falso")).toBe(falso);
  });
  it("sin registrar no existe", () => {
    quitar("FALSO");
    expect(obtenerProveedor("FALSO")).toBeNull();
  });
});

describe("llamarApi", () => {
  const HOSTS = new Set(["api.ok.com"]);
  it("rechaza hosts no permitidos y http", async () => {
    await expect(llamarApi(HOSTS, "https://evil.com", "/x")).rejects.toThrow(/Destino no permitido/);
    await expect(llamarApi(HOSTS, "http://api.ok.com", "/x")).rejects.toThrow(/Destino no permitido/);
  });
  it("reintenta con backoff solo si se pide y ante 5xx", async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response("", { status: 503 })).mockResolvedValueOnce(Response.json({ a: 1 }));
    expect((await llamarApi(HOSTS, "https://api.ok.com", "/x", { reintentar: true, fetch: f, esperaMs: 1 })).json).toEqual({ a: 1 });
    expect(f).toHaveBeenCalledTimes(2);
    const g = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
    await expect(llamarApi(HOSTS, "https://api.ok.com", "/x", { fetch: g })).rejects.toBeInstanceOf(ErrorFE);
    expect(g).toHaveBeenCalledTimes(1);
  });
});
