import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorFE, type ProveedorFacturacionElectronica, type ResultadoEmision } from "./proveedor";

type Doc = Record<string, any>;
const docs = new Map<string, Doc>();
let seq = 0;
const eventos: string[] = [];

const factura = () => ({
  id: "F1", organizationId: "O1", numero: 1, fecha: new Date("2026-11-20T15:00:00Z"), vence: null, notas: null, total: 100000, estado: "PAGADA", anuladoEn: null, ordenId: null,
  items: [{ descripcion: "Panorámica", cantidad: 1, valorUnitario: 100000, descuento: 0, servicioId: "S1", servicio: { codigoCups: "870113" } }], pagos: [],
  paciente: { nombre: "Ana", correo: null, direccion: null, celular: null, persona: { tipoDocumento: "CC", numeroDocumento: "123456", correo: null, direccion: null, celular: null } }, convenioRef: null, orden: null,
});
const cfg = { organizationId: "O1", nit: "800197268", dv: "4", razonSocial: "Centro", nombreComercial: null, regimen: null, responsabilidadFiscal: null, codigoPrestador: "110010000101", prefijoFactura: null, modalidadDefecto: null, generaRips: true, emiteFev: true };
const conexion = { id: "C1", organizationId: "O1", proveedor: "FALSO", modo: "SANDBOX", credencialesCifradas: "x", configJson: null, activa: true };

const cumple = (d: Doc, where: Doc) => Object.entries(where).every(([k, v]) => (v && typeof v === "object" ? ("in" in v ? v.in.includes(d[k]) : "lte" in v ? d[k] <= v.lte : true) : d[k] === v));
const actualizar = (d: Doc, data: Doc) => { for (const [k, v] of Object.entries(data)) d[k] = v && typeof v === "object" && "increment" in v ? (d[k] ?? 0) + v.increment : v; };
const dbDoc = {
  findUnique: vi.fn(async ({ where }: { where: Doc }) => [...docs.values()].find((d) => (where.id ? d.id === where.id : d.claveIdempotencia === where.claveIdempotencia)) ?? null),
  findUniqueOrThrow: vi.fn(async ({ where }: { where: Doc }) => ({ ...docs.get(where.id)!, conexion })),
  findFirst: vi.fn(async ({ where }: { where: Doc }) => { const d = [...docs.values()].find((x) => cumple(x, where)); return d ? { ...d, conexion } : null; }),
  findMany: vi.fn(async ({ where }: { where: Doc }) => [...docs.values()].filter((d) => cumple(d, where))),
  create: vi.fn(async ({ data }: { data: Doc }) => {
    if ([...docs.values()].some((d) => d.claveIdempotencia === data.claveIdempotencia)) throw Object.assign(new Error("unique"), { code: "P2002" });
    const d = { id: `D${++seq}`, intentos: 0, proximoIntento: new Date(0), mensajes: null, idExterno: null, cufe: null, ...data };
    docs.set(d.id, d);
    return d;
  }),
  update: vi.fn(async ({ where, data }: { where: Doc; data: Doc }) => { const d = docs.get(where.id)!; actualizar(d, data); return d; }),
  updateMany: vi.fn(async ({ where, data }: { where: Doc; data: Doc }) => {
    const hit = [...docs.values()].filter((d) => cumple(d, where));
    hit.forEach((d) => actualizar(d, data));
    return { count: hit.length };
  }),
};
let cola: Promise<unknown> = Promise.resolve(); // reproduce el bloqueo FOR UPDATE de la cuenta: las transacciones se serializan
const tx = { $queryRaw: vi.fn(async () => []), factura: { findFirst: vi.fn(async () => factura()) }, documentoElectronico: dbDoc, configFacturacion: { findUnique: vi.fn(async () => cfg) } };
const prisma = {
  configFacturacion: { findUnique: vi.fn(async () => cfg) },
  conexionFE: { findFirst: vi.fn(async () => conexion) },
  factura: { findFirst: vi.fn(async () => factura()), findUnique: vi.fn(async () => ({ pacienteId: null, numero: 1, total: 100000 })) },
  notaCredito: { findFirst: vi.fn(), aggregate: vi.fn() },
  documentoElectronico: dbDoc,
  $transaction: (f: (t: typeof tx) => Promise<unknown>) => { const r = cola.then(() => f(tx)); cola = r.catch(() => null); return r; },
};
vi.mock("@dent-view/db", () => ({ prisma }));
vi.mock("@/lib/eventos", () => ({ registrarEvento: vi.fn(async ({ tipo }: { tipo: string }) => { eventos.push(tipo); }) }));
vi.mock("@/lib/cifrado", () => ({ descifrar: () => "{}", secretoCifrado: () => "secreto" }));
vi.mock("./almacen", () => ({ claveArchivo: (o: string, d: string, q: string) => `tenants/${o}/fe/${d}/${q}`, claveValida: () => true, EXTENSION: { pdf: "pdf", xml: "xml", attached: "xml" }, guardarArchivo: vi.fn(async () => "hash"), leerArchivo: vi.fn() }));

const { registrar } = await import("./registro");
const { emitirFev, procesarDocumento, procesarPendientes, reintentarDocumento, aplicarEventoWebhook } = await import("./servicio");

let respuesta: () => Promise<ResultadoEmision>;
const emitirFactura = vi.fn(async () => respuesta());
const falso: ProveedorFacturacionElectronica = {
  clave: "FALSO", nombre: "Falso", descripcion: "", bloqueadoProduccion: false, soportaSalud: true, soportaCuv: false, campos: [],
  probarConexion: async () => ({ ok: true, mensaje: "" }),
  emitirFactura, emitirNotaCredito: vi.fn(),
  consultarEstado: vi.fn(async () => ({ estado: "ACEPTADA" as const, idExterno: "EXT1", numeroDian: "SETP1", cufe: "cufe-1", mensajes: [] })),
  descargar: vi.fn(async () => null),
};
registrar(falso);
const actor = { organizationId: "O1", userId: "U1" };
const aceptada = async (): Promise<ResultadoEmision> => ({ estado: "ACEPTADA", idExterno: "EXT1", numeroDian: "SETP1", cufe: "cufe-1", mensajes: [] });

beforeEach(() => {
  docs.clear(); seq = 0; eventos.length = 0; emitirFactura.mockClear(); respuesta = aceptada;
  cfg.emiteFev = true; cfg.generaRips = true; Object.assign(conexion, { activa: true, modo: "SANDBOX" });
});

describe("emitirFev", () => {
  it("emite y guarda ACEPTADA con CUFE y número DIAN, y audita", async () => {
    const r = await emitirFev("F1", actor);
    expect(r).toMatchObject({ ok: true, estado: "ACEPTADA", yaExistia: false });
    expect([...docs.values()][0]).toMatchObject({ estado: "ACEPTADA", cufe: "cufe-1", numeroDian: "SETP1", claveIdempotencia: "fev:F1", intentos: 1 });
    expect(eventos).toEqual(["fe.emitida"]);
  });
  it("dos emisiones simultáneas: un solo documento y una sola llamada al proveedor", async () => {
    const [a, b] = await Promise.all([emitirFev("F1", actor), emitirFev("F1", actor)]);
    expect(docs.size).toBe(1);
    expect(emitirFactura).toHaveBeenCalledTimes(1);
    expect([a, b].filter((r) => r.ok && r.yaExistia)).toHaveLength(1);
  });
  it("una segunda emisión tras la aceptación no vuelve a llamar", async () => {
    await emitirFev("F1", actor);
    expect(await emitirFev("F1", actor)).toMatchObject({ ok: true, yaExistia: true, estado: "ACEPTADA" });
    expect(emitirFactura).toHaveBeenCalledTimes(1);
  });
  it("precondiciones: sin FEV activada, sin conexión, cuenta anulada o ítem sin CUPS", async () => {
    cfg.emiteFev = false;
    expect(await emitirFev("F1", actor)).toMatchObject({ ok: false, error: expect.stringContaining("no tiene activada") });
    cfg.emiteFev = true;
    prisma.conexionFE.findFirst.mockResolvedValueOnce(null as unknown as typeof conexion);
    expect(await emitirFev("F1", actor)).toMatchObject({ ok: false, error: expect.stringContaining("proveedor") });
    tx.factura.findFirst.mockResolvedValueOnce({ ...factura(), estado: "ANULADA" });
    expect(await emitirFev("F1", actor)).toMatchObject({ ok: false, error: expect.stringContaining("anulada") });
    tx.factura.findFirst.mockResolvedValueOnce({ ...factura(), items: [{ ...factura().items[0]!, servicio: { codigoCups: null as unknown as string } }] });
    expect(await emitirFev("F1", actor)).toMatchObject({ ok: false, error: expect.stringContaining("CUPS") });
    expect(docs.size).toBe(0);
    expect(emitirFactura).not.toHaveBeenCalled();
  });
  it("PRODUCCION con proveedor no probado se bloquea", async () => {
    Object.assign(conexion, { modo: "PRODUCCION" });
    registrar({ ...falso, bloqueadoProduccion: true });
    expect(await emitirFev("F1", actor)).toMatchObject({ ok: false, error: expect.stringContaining("PRODUCCION") });
    registrar(falso);
  });
  it("rechazo: queda RECHAZADA con mensajes y se puede reintentar con éxito", async () => {
    respuesta = async () => ({ estado: "RECHAZADA", idExterno: "EXT1", mensajes: ["NIT del adquirente inválido"] });
    expect(await emitirFev("F1", actor)).toMatchObject({ ok: true, estado: "RECHAZADA" });
    expect([...docs.values()][0]).toMatchObject({ estado: "RECHAZADA", mensajes: ["NIT del adquirente inválido"] });
    expect(eventos).toEqual(["fe.rechazada"]);
    respuesta = aceptada;
    const id = [...docs.values()][0]!.id;
    expect(await reintentarDocumento(id, actor)).toMatchObject({ ok: true, estado: "ACEPTADA" });
    expect(docs.size).toBe(1);
  });
});

describe("reintentos", () => {
  it("un fallo transitorio deja ENVIANDO con próximo intento y el cron lo completa", async () => {
    respuesta = async () => { throw new ErrorFE("El proveedor no respondió a tiempo"); };
    expect(await emitirFev("F1", actor)).toMatchObject({ ok: true, estado: "ENVIANDO" });
    const d = [...docs.values()][0]!;
    expect(d).toMatchObject({ estado: "ENVIANDO", intentos: 1, mensajes: ["El proveedor no respondió a tiempo"] });
    expect(d.proximoIntento.getTime()).toBeGreaterThan(Date.now());
    expect((await procesarPendientes()).revisados).toBe(0); // aún no vence
    d.proximoIntento = new Date(Date.now() - 1000);
    respuesta = aceptada;
    expect(await procesarPendientes()).toMatchObject({ revisados: 1, resueltos: 1 });
    expect(d.estado).toBe("ACEPTADA");
  });
  it("tras 8 intentos pasa a ERROR y audita fe.error", async () => {
    respuesta = async () => { throw new ErrorFE("sin red"); };
    await emitirFev("F1", actor);
    const d = [...docs.values()][0]!;
    for (let i = 0; i < 10 && d.estado === "ENVIANDO"; i++) { d.proximoIntento = new Date(0); await procesarDocumento(d.id); }
    expect(d).toMatchObject({ estado: "ERROR", intentos: 8 });
    expect(eventos).toContain("fe.error");
  });
  it("un error permanente (configuración) pasa directo a ERROR", async () => {
    respuesta = async () => { throw new ErrorFE("Siigo rechazó el usuario", false); };
    expect(await emitirFev("F1", actor)).toMatchObject({ ok: true, estado: "ERROR" });
  });
  it("PROCESANDO conserva idExterno y el siguiente ciclo consulta en vez de emitir de nuevo", async () => {
    respuesta = async () => ({ estado: "PROCESANDO", idExterno: "EXT1", mensajes: [] });
    await emitirFev("F1", actor);
    const d = [...docs.values()][0]!;
    expect(d).toMatchObject({ estado: "ENVIANDO", idExterno: "EXT1" });
    d.proximoIntento = new Date(0);
    await procesarDocumento(d.id);
    expect(falso.consultarEstado).toHaveBeenCalled();
    expect(emitirFactura).toHaveBeenCalledTimes(1);
    expect(d).toMatchObject({ estado: "ACEPTADA", cufe: "cufe-1" });
  });
  it("dos procesos sobre el mismo documento: solo uno lo reserva", async () => {
    respuesta = async () => { throw new ErrorFE("x"); };
    await emitirFev("F1", actor);
    const d = [...docs.values()][0]!;
    d.proximoIntento = new Date(0);
    respuesta = aceptada;
    const [a, b] = await Promise.all([procesarDocumento(d.id), procesarDocumento(d.id)]);
    expect([a, b].filter((x) => x === null)).toHaveLength(1);
    expect(emitirFactura).toHaveBeenCalledTimes(2); // 1 del fallo inicial + 1 del reintento
  });
});

describe("webhook entrante", () => {
  it("aplica una vez; el reenvío es duplicado", async () => {
    respuesta = async () => ({ estado: "PROCESANDO", idExterno: "EXT1", mensajes: [] });
    await emitirFev("F1", actor);
    const ev = { idExterno: "EXT1", estado: "ACEPTADA" as const, cufe: "cufe-w", numeroDian: "SETP9", mensajes: [] };
    expect(await aplicarEventoWebhook({ id: "C1", organizationId: "O1", proveedor: "FALSO" }, ev)).toBe("aplicado");
    expect([...docs.values()][0]).toMatchObject({ estado: "ACEPTADA", cufe: "cufe-w" });
    expect(await aplicarEventoWebhook({ id: "C1", organizationId: "O1", proveedor: "FALSO" }, ev)).toBe("duplicado");
    expect(await aplicarEventoWebhook({ id: "C1", organizationId: "O1", proveedor: "FALSO" }, { ...ev, idExterno: "NOEXISTE" })).toBe("sin_documento");
    expect(await aplicarEventoWebhook({ id: "C1", organizationId: "O2", proveedor: "FALSO" }, ev)).toBe("sin_documento"); // otro centro
  });
});
