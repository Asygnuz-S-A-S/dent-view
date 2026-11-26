// Siigo (API de facturación electrónica). NO probado contra una cuenta real: implementado con la documentación pública y el SDK oficial
// SiigoDev/siigo_sdk_javascript (rutas /v1/invoices, /v1/invoices/{id}/stamp, /stamp/errors, /pdf, /v1/credit-notes). Bloqueado en PRODUCCION.
// Lo que NO se pudo confirmar queda como TODO; el cuerpo exacto de los documentos debe validarse contra una cuenta sandbox de Siigo.
import { aObjeto, aTexto, ErrorFE, llamarApi, TAMANO_MAX_DESCARGA, type ContextoFE, type Descarga, type FacturaFE, type LineaFE, type NotaFE, type ProveedorFacturacionElectronica, type ResultadoEmision } from "../proveedor";

// TODO: el SDK oficial usa https://services.siigo.com/alliances/api (sign-in: /siigoapi-users/v1/sign-in); la documentación apiary usa api.siigo.com (/auth). Se asume api.siigo.com.
const BASE = "https://api.siigo.com";
const HOSTS: ReadonlySet<string> = new Set(["api.siigo.com"]);

async function token(ctx: ContextoFE): Promise<Record<string, string>> {
  const r = await llamarApi(HOSTS, BASE, "/auth", { metodo: "POST", reintentar: true, cuerpo: { username: ctx.llaves.usuario, access_key: ctx.llaves.accessKey }, cabeceras: ctx.llaves.partnerId ? { "Partner-Id": ctx.llaves.partnerId } : {} });
  const t = aTexto(aObjeto(r.json).access_token);
  if (r.estado === 401 || r.estado === 403) throw new ErrorFE("Siigo rechazó el usuario o la llave de acceso", false);
  if (r.estado >= 300 || !t) throw new ErrorFE("Siigo no entregó un token de acceso", false);
  return { Authorization: `Bearer ${t}`, ...(ctx.llaves.partnerId ? { "Partner-Id": ctx.llaves.partnerId } : {}) };
}

const num = (ctx: ContextoFE, k: string) => {
  const n = Number(ctx.config[k]);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const requerido = (ctx: ContextoFE, k: string, etiqueta: string) => {
  const n = num(ctx, k);
  if (!n) throw new ErrorFE(`Falta configurar en la conexión de Siigo: ${etiqueta}`, false);
  return n;
};

/** Mensajes de error de Siigo, acotados y sin eco de datos sensibles (solo `Errors[].Message` si existe). */
function mensajesError(json: unknown): string[] {
  const e = aObjeto(json).Errors ?? aObjeto(json).errors;
  const lista = Array.isArray(e) ? e : [];
  const m = lista.map((x) => aTexto(aObjeto(x).Message) ?? aTexto(aObjeto(x).message) ?? (typeof x === "string" ? x : null)).filter((x): x is string => !!x);
  return (m.length ? m : ["Siigo rechazó el documento"]).map((x) => x.slice(0, 300)).slice(0, 10);
}

const lineasSiigo = (ctx: ContextoFE, ls: LineaFE[]) => {
  const codigo = aTexto(ctx.config.codigoProducto);
  if (!codigo) throw new ErrorFE("Falta configurar en la conexión de Siigo: código del producto/servicio de salud creado en Siigo", false);
  // TODO: Siigo exige que el código exista en el inventario de la cuenta; un solo producto genérico evita sincronizar el catálogo.
  return ls.map((l) => ({
    code: codigo, description: l.descripcion.slice(0, 250), quantity: l.cantidad, price: l.valorUnitario,
    ...(l.descuento ? { discount: Math.round((l.descuento * 100) / (l.cantidad * l.valorUnitario)) } : {}),
    // TODO: impuestos (IVA) requieren el id del impuesto en Siigo; hoy solo se soportan servicios excluidos (vatExcluded).
  }));
};
const cliente = (a: FacturaFE["adquirente"]) => ({
  person_type: a.tipoPersona === "JURIDICA" ? "Company" : "Person", id_type: a.tipoDocumento, identification: a.numeroDocumento,
  ...(a.dv ? { check_digit: a.dv } : {}), name: a.tipoPersona === "JURIDICA" ? [a.nombre] : [a.nombre.slice(0, 60), "."], // TODO: separar nombres y apellidos
  ...(a.correo ? { contacts: [{ email: a.correo }] } : {}),
});

/** stamp.status: Draft | Accepted | Rejected (doc del SDK). Sin estado reconocible = en proceso. */
function leerEstado(json: unknown, tipoDoc: "FACTURA" | "NOTA_CREDITO"): ResultadoEmision {
  const o = aObjeto(json);
  const st = aObjeto(o.stamp);
  const estado = String(st.status ?? "").toLowerCase();
  const base = { idExterno: aTexto(o.id), numeroDian: aTexto(o.name), cufe: aTexto(st.cufe) ?? aTexto(st.cude) };
  if (estado === "accepted") return { estado: "ACEPTADA", ...base, mensajes: [] };
  if (estado === "rejected") return { estado: "RECHAZADA", ...base, mensajes: mensajesError({ errors: st.errors }) };
  // TODO: para notas crédito el SDK no documenta StampCommand/stamp: se consulta el estado hasta que aparezca.
  void tipoDoc;
  return { estado: "PROCESANDO", ...base, mensajes: [] };
}

export const siigo: ProveedorFacturacionElectronica = {
  clave: "SIIGO",
  nombre: "Siigo",
  descripcion: "Facturación electrónica con la API de Siigo (usuario de API + access key).",
  bloqueadoProduccion: true,
  advertencia: "No probado: implementado solo con la documentación. Bloqueado para producción hasta probarlo con una cuenta real de Siigo.",
  soportaSalud: false, // TODO: los campos del sector salud (Res. 948/2026) no están confirmados en la API de Siigo
  soportaCuv: false,
  campos: [
    { clave: "usuario", etiqueta: "Usuario de la API", secreto: false },
    { clave: "accessKey", etiqueta: "Access key", secreto: true },
    { clave: "partnerId", etiqueta: "Partner-Id (nombre de tu aplicación)", secreto: false, opcional: true }, // TODO: confirmar si es obligatorio
  ],
  camposConfig: [
    { clave: "documentoFacturaId", etiqueta: "Id del tipo de comprobante de factura (FV)", ayuda: "Lo entrega GET /v1/document-types?type=FV", tipo: "numero" },
    { clave: "documentoNotaCreditoId", etiqueta: "Id del tipo de comprobante de nota crédito (NC)", ayuda: "GET /v1/document-types?type=NC", tipo: "numero" },
    { clave: "vendedorId", etiqueta: "Id del vendedor", ayuda: "GET /v1/users", tipo: "numero" },
    { clave: "medioPagoId", etiqueta: "Id del medio de pago", ayuda: "GET /v1/payment-types?document_type=FV", tipo: "numero" },
    { clave: "codigoProducto", etiqueta: "Código del producto/servicio de salud en Siigo", ayuda: "Producto genérico creado en Siigo, excluido de IVA", tipo: "texto" },
  ],
  async probarConexion(ctx) {
    try {
      await token(ctx);
      return { ok: true, mensaje: "Autenticación con Siigo correcta" };
    } catch (e) {
      return { ok: false, mensaje: e instanceof ErrorFE ? e.message : "No se pudo probar la conexión" };
    }
  },
  async emitirFactura(ctx, f, _clave) {
    // Siigo no documenta clave de idempotencia: la unicidad la garantiza dent-view (un documento por cuenta). TODO: antes de reintentar tras un fallo ambiguo, buscar por GET /v1/invoices?name=...
    const h = await token(ctx);
    const r = await llamarApi(HOSTS, BASE, "/v1/invoices", {
      metodo: "POST", cabeceras: h,
      cuerpo: {
        document: { id: requerido(ctx, "documentoFacturaId", "id del comprobante de factura") }, date: f.fecha, customer: cliente(f.adquirente),
        seller: requerido(ctx, "vendedorId", "id del vendedor"), observations: f.observaciones?.slice(0, 500) ?? undefined, stamp: { send: true }, mail: { send: false },
        items: lineasSiigo(ctx, f.lineas), payments: [{ id: requerido(ctx, "medioPagoId", "id del medio de pago"), value: f.total }],
      },
    });
    if (r.estado >= 400 && r.estado < 500) return { estado: "RECHAZADA", idExterno: null, mensajes: mensajesError(r.json) };
    return leerEstado(r.json, "FACTURA");
  },
  async emitirNotaCredito(ctx, n: NotaFE, _clave) {
    if (!n.origen.idExterno) throw new ErrorFE("La factura de origen no tiene id en Siigo", false);
    const h = await token(ctx);
    const r = await llamarApi(HOSTS, BASE, "/v1/credit-notes", {
      metodo: "POST", cabeceras: h,
      cuerpo: {
        document: { id: requerido(ctx, "documentoNotaCreditoId", "id del comprobante de nota crédito") }, date: n.fecha, invoice: n.origen.idExterno, reason: Number(n.motivoDian),
        seller: requerido(ctx, "vendedorId", "id del vendedor"), observations: n.motivo.slice(0, 500), items: lineasSiigo(ctx, n.lineas),
        payments: [{ id: requerido(ctx, "medioPagoId", "id del medio de pago"), value: n.total }],
      },
    });
    if (r.estado >= 400 && r.estado < 500) return { estado: "RECHAZADA", idExterno: null, mensajes: mensajesError(r.json) };
    return leerEstado(r.json, "NOTA_CREDITO");
  },
  async consultarEstado(ctx, d) {
    const h = await token(ctx);
    const ruta = d.tipo === "FACTURA" ? "invoices" : "credit-notes";
    const r = await llamarApi(HOSTS, BASE, `/v1/${ruta}/${encodeURIComponent(d.idExterno)}`, { cabeceras: h, reintentar: true });
    if (r.estado === 404) throw new ErrorFE("Siigo no encontró el documento", false);
    const res = leerEstado(r.json, d.tipo);
    if (res.estado === "RECHAZADA" && d.tipo === "FACTURA" && !res.mensajes.length) {
      const e = await llamarApi(HOSTS, BASE, `/v1/invoices/${encodeURIComponent(d.idExterno)}/stamp/errors`, { cabeceras: h, reintentar: true });
      res.mensajes = mensajesError(e.json); // TODO: forma exacta de EInvoiceErrorsViewModel sin confirmar
    }
    return { ...res, idExterno: res.idExterno ?? d.idExterno };
  },
  async descargar(ctx, d): Promise<Descarga | null> {
    // TODO: el SDK documenta solo PDF (base64) para facturas y notas; XML/attached no aparecen documentados.
    if (d.que !== "pdf") return null;
    const h = await token(ctx);
    const r = await llamarApi(HOSTS, BASE, `/v1/${d.tipo === "FACTURA" ? "invoices" : "credit-notes"}/${encodeURIComponent(d.idExterno)}/pdf`, { cabeceras: h, reintentar: true });
    const b64 = aTexto(aObjeto(r.json).base64);
    if (r.estado >= 300 || !b64) return null;
    if (b64.length > (TAMANO_MAX_DESCARGA * 4) / 3 + 8) throw new ErrorFE("El archivo del proveedor supera el tamaño permitido", false);
    return { bytes: Buffer.from(b64, "base64"), contentType: "application/pdf" };
  },
};
