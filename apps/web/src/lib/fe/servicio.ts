// Servicio de facturación electrónica: emisión idempotente de FEV y notas crédito, reintentos, webhook y descargas.
// Regla: el adaptador (red) se llama SIEMPRE fuera de una transacción; el estado se reclama con un UPDATE condicional (reserva) para que
// dos procesos (usuario, cron, webhook) no emitan el mismo documento dos veces.
import { prisma, type Prisma } from "@dent-view/db";
import { descifrar, secretoCifrado } from "@/lib/cifrado";
import { registrarEvento } from "@/lib/eventos";
import { numeroFactura } from "@/lib/facturacion";
import { claveArchivo, claveValida, EXTENSION, guardarArchivo, leerArchivo } from "./almacen";
import { backoffMs, MAX_INTENTOS, RESERVA_MS, type EstadoDoc } from "./estados";
import { ErrorMapeo, mapearFactura, mapearNotaCredito, type ConfigMapeo, type EntradaFactura } from "./mapear";
import { ErrorFE, TAMANO_MAX_DESCARGA, type ContextoFE, type EventoFE, type ResultadoEmision, type TipoDescarga } from "./proveedor";
import { obtenerProveedor } from "./registro";

export type Actor = { organizationId: string; userId: string | null };
export type ResultadoEmitir = { ok: true; documentoId: string; estado: EstadoDoc; yaExistia: boolean } | { ok: false; error: string };

const secreto = () => {
  const s = secretoCifrado();
  if (!s) throw new Error("Falta CIFRADO_SECRETO o BETTER_AUTH_SECRET");
  return s;
};
const limpiar = (m: unknown): string[] => (Array.isArray(m) ? m.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 300)).slice(0, 20) : []);

type Db = Prisma.TransactionClient;
type Conexion = { id: string; proveedor: string; modo: "SANDBOX" | "PRODUCCION"; credencialesCifradas: string; configJson: unknown };

export const configDeConexion = (c: { configJson: unknown }): Record<string, unknown> => (c.configJson && typeof c.configJson === "object" && !Array.isArray(c.configJson) ? (c.configJson as Record<string, unknown>) : {});
export function contextoDe(c: Conexion): ContextoFE {
  return { llaves: JSON.parse(descifrar(c.credencialesCifradas, secreto())), modo: c.modo, config: configDeConexion(c) };
}
/** Un proveedor "No probado" no emite en PRODUCCION; el simulado no existe fuera de localhost. Devuelve el mensaje si no se puede usar. */
export function conexionNoUsable(c: { proveedor: string; modo: string }): string | null {
  const p = obtenerProveedor(c.proveedor);
  if (!p) return "El proveedor de facturación electrónica no está disponible";
  if (c.modo === "PRODUCCION" && p.bloqueadoProduccion) return `${p.nombre} está marcado «No probado»: no puede emitir en PRODUCCION`;
  return null;
}

const incluirFactura = { items: { include: { servicio: { select: { codigoCups: true } } } }, pagos: true, paciente: { include: { persona: true } }, convenioRef: true, orden: { select: { items: { select: { servicioId: true, codigoCups: true } } } } } as const;

async function cargarFactura(db: Db, organizationId: string, facturaId: string) {
  return db.factura.findFirst({ where: { id: facturaId, organizationId }, include: incluirFactura });
}
type FacturaCargada = NonNullable<Awaited<ReturnType<typeof cargarFactura>>>;

export function aEntrada(f: FacturaCargada): EntradaFactura {
  const cupsOrden = new Map((f.orden?.items ?? []).filter((i) => i.servicioId && i.codigoCups).map((i) => [i.servicioId!, i.codigoCups!]));
  return {
    numero: f.numero, fecha: f.fecha, vence: f.vence, notas: f.notas, total: f.total, estado: f.estado,
    paciente: f.paciente ? { nombre: f.paciente.nombre, tipoDocumento: f.paciente.persona.tipoDocumento, numeroDocumento: f.paciente.persona.numeroDocumento, correo: f.paciente.correo ?? f.paciente.persona.correo, direccion: f.paciente.direccion ?? f.paciente.persona.direccion, celular: f.paciente.celular ?? f.paciente.persona.celular } : null,
    convenio: f.convenioRef ? { nombre: f.convenioRef.nombre, nit: f.convenioRef.nit, nitPagador: f.convenioRef.nitPagador, cucon: f.convenioRef.cucon, coberturaPlan: f.convenioRef.coberturaPlan } : null,
    // CUPS: el de la orden (editable por ítem) manda sobre el del catálogo.
    items: f.items.map((i) => ({ descripcion: i.descripcion, cantidad: i.cantidad, valorUnitario: i.valorUnitario, descuento: i.descuento, servicioId: i.servicioId, codigoCups: (i.servicioId && cupsOrden.get(i.servicioId)) || i.servicio?.codigoCups || null })),
    pagos: f.pagos.map((p) => ({ valor: p.valor, medio: p.medio, fecha: p.fecha, anuladoEn: p.anuladoEn })),
  };
}

async function configMapeo(db: Db | typeof prisma, organizationId: string, conexion: { configJson: unknown }): Promise<ConfigMapeo | null> {
  const c = await db.configFacturacion.findUnique({ where: { organizationId } });
  if (!c) return null;
  const iva = configDeConexion(conexion).tratamientoIva;
  return { ...c, tratamientoIva: iva === "IVA_19" ? "IVA_19" : "EXCLUIDO" };
}

/** Conexión activa del centro (la más antigua si hubiera varias). */
export const conexionActiva = (organizationId: string) => prisma.conexionFE.findFirst({ where: { organizationId, activa: true }, orderBy: { creadoEn: "asc" } });

/**
 * Emite la factura electrónica de una cuenta de cobro. Idempotente: una cuenta tiene un solo documento FACTURA (clave `fev:<facturaId>`, única en BD);
 * una segunda llamada (o dos simultáneas) devuelve el mismo documento sin llamar al proveedor otra vez.
 */
export async function emitirFev(facturaId: string, actor: Actor): Promise<ResultadoEmitir> {
  const org = actor.organizationId;
  const cfg = await prisma.configFacturacion.findUnique({ where: { organizationId: org } });
  if (!cfg?.emiteFev) return { ok: false, error: "El centro no tiene activada la facturación electrónica" };
  const conexion = await conexionActiva(org);
  if (!conexion) return { ok: false, error: "No hay un proveedor de facturación electrónica conectado y activo" };
  const noUsable = conexionNoUsable(conexion);
  if (noUsable) return { ok: false, error: noUsable };
  const clave = `fev:${facturaId}`;

  let resultado: { documentoId: string; estado: EstadoDoc; procesar: boolean };
  try {
    resultado = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Factura" WHERE id = ${facturaId} AND "organizationId" = ${org} FOR UPDATE`;
      const f = await cargarFactura(tx, org, facturaId);
      if (!f) throw new ErrorMapeo("Cuenta de cobro no encontrada");
      if (f.estado === "ANULADA" || f.anuladoEn) throw new ErrorMapeo("La cuenta está anulada");
      if (f.estado !== "ABIERTA" && f.estado !== "PAGADA") throw new ErrorMapeo("La cuenta no está en un estado facturable");
      const existente = await tx.documentoElectronico.findUnique({ where: { claveIdempotencia: clave } });
      if (existente && existente.organizationId !== org) throw new ErrorMapeo("Cuenta de cobro no encontrada");
      if (existente && existente.estado !== "RECHAZADA" && existente.estado !== "ERROR") return { documentoId: existente.id, estado: existente.estado, procesar: false };
      const entrada = aEntrada(f);
      if (cfg.generaRips) {
        const sin = entrada.items.filter((i) => !i.codigoCups);
        if (sin.length) throw new ErrorMapeo(`Falta el código CUPS en: ${sin.map((i) => i.descripcion).slice(0, 3).join(", ")}`);
      }
      mapearFactura(entrada, (await configMapeo(tx, org, conexion))!); // valida antes de crear el documento
      const datos = { estado: "ENVIANDO" as const, intentos: 0, proximoIntento: new Date(), mensajes: [], conexionId: conexion.id, emitidoPorId: actor.userId, ordenId: f.ordenId };
      const doc = existente
        ? await tx.documentoElectronico.update({ where: { id: existente.id }, data: datos })
        : await tx.documentoElectronico.create({ data: { organizationId: org, tipo: "FACTURA", facturaId, claveIdempotencia: clave, ...datos } });
      return { documentoId: doc.id, estado: doc.estado as EstadoDoc, procesar: true };
    });
  } catch (e) {
    if (e instanceof ErrorMapeo) return { ok: false, error: e.message };
    if ((e as { code?: string }).code === "P2002") { // carrera extrema: otro proceso creó el documento entre la lectura y la inserción
      const d = await prisma.documentoElectronico.findUnique({ where: { claveIdempotencia: clave } });
      if (d?.organizationId === org) return { ok: true, documentoId: d.id, estado: d.estado as EstadoDoc, yaExistia: true };
    }
    throw e;
  }
  if (!resultado.procesar) return { ok: true, documentoId: resultado.documentoId, estado: resultado.estado, yaExistia: true };
  const estado = (await procesarDocumento(resultado.documentoId)) ?? resultado.estado;
  return { ok: true, documentoId: resultado.documentoId, estado, yaExistia: false };
}

/**
 * Dentro de la transacción de la nota crédito interna: si la cuenta tiene FEV aceptada, deja listo el documento NOTA_CREDITO (ENVIANDO).
 * Devuelve su id (a procesar DESPUÉS del commit) o null si no aplica. La nota interna nunca depende de que el proveedor responda.
 */
export async function prepararNotaFe(tx: Db, d: { organizationId: string; facturaId: string; notaCreditoId: string; userId: string | null }): Promise<string | null> {
  const origen = await tx.documentoElectronico.findFirst({ where: { organizationId: d.organizationId, facturaId: d.facturaId, tipo: "FACTURA", estado: "ACEPTADA" } });
  if (!origen) return null;
  const clave = `nc:${d.notaCreditoId}`;
  const ya = await tx.documentoElectronico.findUnique({ where: { claveIdempotencia: clave } });
  if (ya) return ya.estado === "RECHAZADA" || ya.estado === "ERROR" ? null : ya.id;
  const doc = await tx.documentoElectronico.create({ data: { organizationId: d.organizationId, tipo: "NOTA_CREDITO", facturaId: d.facturaId, notaCreditoId: d.notaCreditoId, ordenId: origen.ordenId, conexionId: origen.conexionId, claveIdempotencia: clave, estado: "ENVIANDO", emitidoPorId: d.userId } });
  return doc.id;
}

/** Emite la nota crédito electrónica de una nota interna ya existente (p. ej. la FEV se aceptó después de crear la nota). */
export async function emitirNotaCreditoFe(notaCreditoId: string, actor: Actor): Promise<ResultadoEmitir> {
  const org = actor.organizationId;
  const nota = await prisma.notaCredito.findFirst({ where: { id: notaCreditoId, organizationId: org } });
  if (!nota) return { ok: false, error: "Nota crédito no encontrada" };
  try {
    const id = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Factura" WHERE id = ${nota.facturaId} AND "organizationId" = ${org} FOR UPDATE`;
      const existente = await tx.documentoElectronico.findUnique({ where: { claveIdempotencia: `nc:${nota.id}` } });
      if (existente && existente.estado !== "RECHAZADA" && existente.estado !== "ERROR") return { id: existente.id, nuevo: false, estado: existente.estado as EstadoDoc };
      if (existente) {
        await tx.documentoElectronico.update({ where: { id: existente.id }, data: { estado: "ENVIANDO", intentos: 0, proximoIntento: new Date(), mensajes: [], emitidoPorId: actor.userId } });
        return { id: existente.id, nuevo: true, estado: "ENVIANDO" as EstadoDoc };
      }
      const nuevo = await prepararNotaFe(tx, { organizationId: org, facturaId: nota.facturaId, notaCreditoId: nota.id, userId: actor.userId });
      if (!nuevo) throw new ErrorMapeo("La cuenta no tiene una factura electrónica aceptada por la DIAN");
      return { id: nuevo, nuevo: true, estado: "ENVIANDO" as EstadoDoc };
    });
    if (!id.nuevo) return { ok: true, documentoId: id.id, estado: id.estado, yaExistia: true };
    return { ok: true, documentoId: id.id, estado: (await procesarDocumento(id.id)) ?? "ENVIANDO", yaExistia: false };
  } catch (e) {
    if (e instanceof ErrorMapeo) return { ok: false, error: e.message };
    throw e;
  }
}

/** Reintento manual: RECHAZADA o ERROR vuelven a ENVIANDO con los intentos en cero. */
export async function reintentarDocumento(documentoId: string, actor: Actor): Promise<ResultadoEmitir> {
  const d = await prisma.documentoElectronico.findFirst({ where: { id: documentoId, organizationId: actor.organizationId }, include: { conexion: true } });
  if (!d) return { ok: false, error: "Documento no encontrado" };
  if (d.estado === "ACEPTADA" || d.estado === "ANULADA") return { ok: false, error: "El documento ya fue aceptado" };
  const noUsable = conexionNoUsable(d.conexion);
  if (noUsable) return { ok: false, error: noUsable };
  if (d.estado === "ENVIANDO") return { ok: false, error: "El documento ya está en proceso; el sistema lo reintenta solo" };
  const r = await prisma.documentoElectronico.updateMany({ where: { id: d.id, estado: { in: ["RECHAZADA", "ERROR", "BORRADOR"] } }, data: { estado: "ENVIANDO", intentos: 0, proximoIntento: new Date(), emitidoPorId: actor.userId } });
  if (r.count === 0) return { ok: false, error: "El documento ya está en proceso" };
  return { ok: true, documentoId: d.id, estado: (await procesarDocumento(d.id)) ?? "ENVIANDO", yaExistia: false };
}

/**
 * Trabaja un documento ENVIANDO: reserva, llama al proveedor (emitir, o consultar si ya tiene idExterno) y guarda el resultado.
 * Devuelve el estado final o null si otro proceso lo tiene reservado / no estaba pendiente.
 */
export async function procesarDocumento(documentoId: string): Promise<EstadoDoc | null> {
  const ahora = new Date();
  const reservado = await prisma.documentoElectronico.updateMany({ where: { id: documentoId, estado: "ENVIANDO", proximoIntento: { lte: ahora } }, data: { proximoIntento: new Date(ahora.getTime() + RESERVA_MS), intentos: { increment: 1 }, enviadoEn: ahora } });
  if (reservado.count === 0) return null;
  const doc = await prisma.documentoElectronico.findUniqueOrThrow({ where: { id: documentoId }, include: { conexion: true } });
  const fin = (estado: EstadoDoc, mensajes: string[], extra: Prisma.DocumentoElectronicoUpdateManyMutationInput = {}) => cerrar(doc, estado, mensajes, extra);
  try {
    const noUsable = conexionNoUsable(doc.conexion);
    if (noUsable) return await fin("ERROR", [noUsable]);
    const proveedor = obtenerProveedor(doc.conexion.proveedor)!;
    const ctx = contextoDe(doc.conexion);
    let res: ResultadoEmision;
    if (doc.idExterno) res = await proveedor.consultarEstado(ctx, { idExterno: doc.idExterno, tipo: doc.tipo === "NOTA_CREDITO" ? "NOTA_CREDITO" : "FACTURA" });
    else {
      const f = await cargarFactura(prisma, doc.organizationId, doc.facturaId);
      const cfg = await configMapeo(prisma, doc.organizationId, doc.conexion);
      if (!f || !cfg) return await fin("ERROR", ["No se pudo cargar la cuenta o los datos del facturador"]);
      if (doc.tipo === "NOTA_CREDITO") {
        const nota = await prisma.notaCredito.findFirst({ where: { id: doc.notaCreditoId ?? "", organizationId: doc.organizationId } });
        const origen = await prisma.documentoElectronico.findFirst({ where: { organizationId: doc.organizationId, facturaId: doc.facturaId, tipo: "FACTURA", estado: { in: ["ACEPTADA", "ANULADA"] } } });
        if (!nota || !origen) return await fin("ERROR", ["La nota crédito no tiene una factura electrónica aceptada de origen"]);
        const previas = await prisma.notaCredito.aggregate({ where: { facturaId: f.id, creadoEn: { gt: nota.creadoEn } }, _sum: { valor: true } });
        const totalOrigen = f.total + nota.valor + (previas._sum.valor ?? 0); // total de la cuenta cuando se emitió la FEV
        res = await proveedor.emitirNotaCredito(ctx, mapearNotaCredito({ consecutivo: nota.consecutivo, fecha: nota.creadoEn, valor: nota.valor, motivo: nota.motivo, totalOrigen }, { idExterno: origen.idExterno, numeroDian: origen.numeroDian, cufe: origen.cufe, fecha: origen.aceptadoEn ?? origen.creadoEn }, aEntrada(f), cfg), doc.claveIdempotencia);
      } else res = await proveedor.emitirFactura(ctx, mapearFactura(aEntrada(f), cfg), doc.claveIdempotencia);
    }
    return await aplicarResultado(doc, res, ctx, proveedor);
  } catch (e) {
    if (e instanceof ErrorMapeo) return fin("RECHAZADA", [e.message]); // datos incompletos: no sirve reintentar sin corregirlos
    const permanente = e instanceof ErrorFE && !e.transitorio;
    const mensaje = e instanceof ErrorFE ? e.message : "Error inesperado al emitir";
    if (!(e instanceof ErrorFE)) console.error("fe: error inesperado", doc.id, e instanceof Error ? e.message : "error");
    if (permanente || doc.intentos >= MAX_INTENTOS) return fin("ERROR", [mensaje]);
    return fin("ENVIANDO", [mensaje], { proximoIntento: new Date(Date.now() + backoffMs(doc.intentos)) });
  }
}

type Doc = Prisma.DocumentoElectronicoGetPayload<{ include: { conexion: true } }>;

async function cerrar(doc: Doc, estado: EstadoDoc, mensajes: string[], extra: Prisma.DocumentoElectronicoUpdateManyMutationInput = {}): Promise<EstadoDoc | null> {
  const r = await prisma.documentoElectronico.updateMany({ where: { id: doc.id, estado: "ENVIANDO" }, data: { estado, mensajes: limpiar(mensajes), ...extra } });
  if (r.count === 0) return null; // lo resolvió otro proceso (webhook)
  if (estado !== "ENVIANDO") await auditar(doc, estado, mensajes);
  return estado;
}

async function auditar(doc: Pick<Doc, "id" | "organizationId" | "facturaId" | "tipo" | "intentos" | "emitidoPorId">, estado: EstadoDoc, mensajes: string[]) {
  const tipo = estado === "ACEPTADA" ? "fe.emitida" : estado === "RECHAZADA" ? "fe.rechazada" : estado === "ERROR" ? "fe.error" : null;
  if (!tipo) return;
  const f = await prisma.factura.findUnique({ where: { id: doc.facturaId }, select: { pacienteId: true, numero: true } });
  await registrarEvento({ organizationId: doc.organizationId, pacienteId: f?.pacienteId, actorId: doc.emitidoPorId, tipo, detalle: { documentoId: doc.id, facturaId: doc.facturaId, factura: f ? numeroFactura(f.numero) : undefined, documento: doc.tipo, intentos: doc.intentos, ...(estado === "ACEPTADA" ? {} : { mensajes: limpiar(mensajes).slice(0, 3) }) } }).catch((e) => console.error("fe: no se pudo auditar", e instanceof Error ? e.message : "error"));
}

/** Guarda el resultado del proveedor (respuesta directa, consulta o webhook). Solo actúa sobre documentos ENVIANDO. */
async function aplicarResultado(doc: Doc, res: ResultadoEmision | EventoFE, ctx: ContextoFE | null, proveedor: ReturnType<typeof obtenerProveedor>): Promise<EstadoDoc | null> {
  if (res.estado === "RECHAZADA") return cerrar(doc, "RECHAZADA", res.mensajes, { idExterno: res.idExterno ?? doc.idExterno });
  if (res.estado === "PROCESANDO") {
    const vigente = await prisma.documentoElectronico.findUnique({ where: { id: doc.id }, select: { intentos: true } });
    if ((vigente?.intentos ?? doc.intentos) >= MAX_INTENTOS) return cerrar(doc, "ERROR", ["El proveedor no confirmó el documento a tiempo"], { idExterno: res.idExterno ?? doc.idExterno });
    return cerrar(doc, "ENVIANDO", res.mensajes, { idExterno: res.idExterno ?? doc.idExterno, proximoIntento: new Date(Date.now() + backoffMs(Math.max(1, doc.intentos))) });
  }
  if (!res.cufe) return cerrar(doc, "ERROR", ["El proveedor aceptó el documento pero no entregó el CUFE"], { idExterno: res.idExterno ?? doc.idExterno });
  const archivos: Prisma.DocumentoElectronicoUpdateManyMutationInput = {};
  const idExterno = res.idExterno ?? doc.idExterno;
  if (ctx && proveedor && idExterno) {
    // Descarga y guarda XML y PDF; si falla no se pierde la aceptación (la ruta de descarga lo vuelve a intentar).
    for (const que of ["xml", "pdf"] as const) {
      try {
        const d = await proveedor.descargar(ctx, { idExterno, tipo: doc.tipo === "NOTA_CREDITO" ? "NOTA_CREDITO" : "FACTURA", que });
        if (!d || d.bytes.byteLength > TAMANO_MAX_DESCARGA) continue;
        const key = claveArchivo(doc.organizationId, doc.id, que);
        const hash = await guardarArchivo(key, d.bytes, d.contentType);
        if (que === "xml") Object.assign(archivos, { xmlKey: key, hashXml: hash });
        else archivos.pdfKey = key;
      } catch (e) {
        console.error("fe: no se pudo guardar el archivo", que, e instanceof Error ? e.message : "error");
      }
    }
  }
  try {
    const estado = await cerrar(doc, "ACEPTADA", res.mensajes, { idExterno, numeroDian: res.numeroDian ?? null, cufe: res.cufe, aceptadoEn: new Date(), ...archivos });
    if (estado && doc.tipo === "NOTA_CREDITO") await marcarAnuladaSiTotal(doc);
    return estado;
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return cerrar(doc, "ERROR", ["El CUFE devuelto ya está registrado en otro documento"]);
    throw e;
  }
}

/** Si las notas crédito electrónicas aceptadas cubren el total facturado, la FEV de origen pasa a ANULADA. */
async function marcarAnuladaSiTotal(doc: Doc) {
  const origen = await prisma.documentoElectronico.findFirst({ where: { organizationId: doc.organizationId, facturaId: doc.facturaId, tipo: "FACTURA", estado: "ACEPTADA" } });
  const f = await prisma.factura.findUnique({ where: { id: doc.facturaId }, select: { total: true } });
  if (!origen || !f || f.total > 0) return; // Factura.total ya viene neto de notas crédito
  await prisma.documentoElectronico.updateMany({ where: { id: origen.id, estado: "ACEPTADA" }, data: { estado: "ANULADA" } });
}

/** Cron: procesa documentos ENVIANDO cuyo próximo intento ya venció. */
export async function procesarPendientes(limite = 20) {
  const pendientes = await prisma.documentoElectronico.findMany({ where: { estado: "ENVIANDO", proximoIntento: { lte: new Date() } }, orderBy: { proximoIntento: "asc" }, take: limite, select: { id: true } });
  const r = { revisados: pendientes.length, resueltos: 0, errores: 0 };
  for (const p of pendientes) {
    try {
      if (await procesarDocumento(p.id)) r.resueltos++;
    } catch (e) {
      r.errores++;
      console.error("fe: fallo procesando", p.id, e instanceof Error ? e.message : "error");
    }
  }
  return r;
}

/** Webhook entrante ya autenticado: aplica el estado a UN documento de ESA conexión (el centro sale de la conexión de la URL, no del payload). Idempotente por estado. */
export async function aplicarEventoWebhook(conexion: { id: string; organizationId: string; proveedor: string }, ev: EventoFE): Promise<"aplicado" | "duplicado" | "sin_documento"> {
  const doc = await prisma.documentoElectronico.findFirst({ where: { organizationId: conexion.organizationId, conexionId: conexion.id, idExterno: ev.idExterno }, include: { conexion: true } });
  if (!doc) return "sin_documento";
  if (doc.estado !== "ENVIANDO") return "duplicado";
  const r = await aplicarResultado(doc, ev, null, null); // sin archivos: se traen al primer pedido de descarga
  return r ? "aplicado" : "duplicado";
}

/** Archivo de un documento (org-scoped). Si no está guardado, se pide al proveedor y se guarda. null = no disponible. */
export async function descargarDocumento(documentoId: string, organizationId: string, que: TipoDescarga): Promise<{ bytes: Uint8Array; contentType: string; nombre: string } | null> {
  const doc = await prisma.documentoElectronico.findFirst({ where: { id: documentoId, organizationId }, include: { conexion: true } });
  if (!doc || doc.estado === "ENVIANDO" || doc.estado === "RECHAZADA" || doc.estado === "ERROR") return null;
  const campo = que === "pdf" ? "pdfKey" : que === "xml" ? "xmlKey" : "attachedKey";
  const contentType = que === "pdf" ? "application/pdf" : "application/xml";
  const nombre = `${doc.tipo === "FACTURA" ? "factura" : "nota-credito"}-${doc.numeroDian ?? doc.id}.${EXTENSION[que]}`.replace(/[^\w.-]/g, "_");
  const key = doc[campo];
  if (key && claveValida(key, organizationId)) return { bytes: await leerArchivo(key), contentType, nombre };
  const proveedor = obtenerProveedor(doc.conexion.proveedor);
  if (!proveedor || !doc.idExterno) return null;
  const d = await proveedor.descargar(contextoDe(doc.conexion), { idExterno: doc.idExterno, tipo: doc.tipo === "NOTA_CREDITO" ? "NOTA_CREDITO" : "FACTURA", que });
  if (!d || d.bytes.byteLength > TAMANO_MAX_DESCARGA) return null;
  const nueva = claveArchivo(organizationId, doc.id, que);
  const hash = await guardarArchivo(nueva, d.bytes, d.contentType);
  await prisma.documentoElectronico.update({ where: { id: doc.id }, data: { [campo]: nueva, ...(que === "xml" ? { hashXml: hash } : {}) } });
  return { bytes: d.bytes, contentType: d.contentType, nombre };
}
