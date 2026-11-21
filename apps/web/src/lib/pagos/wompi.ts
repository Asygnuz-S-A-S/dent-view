// Wompi (Colombia). Doc: docs.wompi.co (links de pago, eventos, ambientes y llaves). Verificado contra la doc, NO contra una cuenta real.
import { aObjeto, aPesos, aTexto, ErrorPasarela, igualesSeguro, llamarApi, sha256Hex, type EventoMapeado, type EstadoPago, type Modo, type ProveedorPago } from "./proveedor";

const BASE: Record<Modo, string> = { SANDBOX: "https://sandbox.wompi.co/v1", PRODUCCION: "https://production.wompi.co/v1" };
const PREFIJO: Record<Modo, string> = { SANDBOX: "test", PRODUCCION: "prod" };
const ESTADOS: Record<string, EstadoPago | undefined> = { APPROVED: "APROBADO", DECLINED: "RECHAZADO", ERROR: "RECHAZADO", VOIDED: "ANULADO", PENDING: "PENDIENTE" };
// El checksum debe cubrir al menos id, estado y monto: así no se puede firmar un subconjunto que no proteja lo que usamos.
const OBLIGATORIAS = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];

const ruta = (o: unknown, camino: string): unknown => camino.split(".").reduce<unknown>((a, k) => aObjeto(a)[k], o);

/** Checksum de la doc: SHA256(valores de signature.properties en orden + timestamp + secreto de eventos). */
export function checksumWompi(evento: Record<string, unknown>, secreto: string): string | null {
  const props = aObjeto(evento.signature).properties;
  if (!Array.isArray(props) || !OBLIGATORIAS.every((p) => props.includes(p))) return null;
  let cadena = "";
  for (const p of props) {
    const v = typeof p === "string" ? ruta(evento.data, p) : undefined;
    if (v === undefined || v === null || typeof v === "object") return null;
    cadena += String(v);
  }
  return sha256Hex(`${cadena}${aTexto(evento.timestamp) ?? ""}${secreto}`);
}

export const wompi: ProveedorPago = {
  clave: "WOMPI",
  nombre: "Wompi",
  descripcion: "Links de pago de Wompi (Bancolombia). Tarjetas, PSE, Nequi y más.",
  bloqueadoProduccion: false,
  advertencia: "Implementado con la documentación oficial; aún no probado contra una cuenta real. Úsalo primero en SANDBOX.",
  campos: [
    { clave: "llavePublica", etiqueta: "Llave pública (pub_…)", secreto: false },
    { clave: "llavePrivada", etiqueta: "Llave privada (prv_…)", secreto: true },
    { clave: "secretoEventos", etiqueta: "Secreto de eventos (…_events_…)", secreto: true },
  ],
  async crearLink(llaves, modo, e) {
    if (!llaves.llavePrivada?.startsWith(`prv_${PREFIJO[modo]}_`)) throw new ErrorPasarela(`La llave privada no corresponde al modo ${modo}`);
    const r = await llamarApi(BASE[modo], "/payment_links", {
      metodo: "POST",
      cabeceras: { Authorization: `Bearer ${llaves.llavePrivada}` },
      cuerpo: {
        name: e.descripcion.slice(0, 60), description: e.descripcion, single_use: true, collect_shipping: false,
        currency: "COP", amount_in_cents: e.monto * 100, expires_at: e.expiraEn.toISOString().slice(0, 19).replace("T", " "),
        ...(e.urlRetorno ? { redirect_url: e.urlRetorno } : {}), sku: e.referencia.slice(0, 36),
      },
    });
    const d = aObjeto(aObjeto(r.json).data);
    const id = aTexto(d.id);
    if (r.estado >= 300 || !id) throw new ErrorPasarela(`Wompi rechazó la creación del link (${r.estado})`);
    return { idExterno: id, urlPago: `https://checkout.wompi.co/l/${encodeURIComponent(id)}`, expiraEn: e.expiraEn };
  },
  // TODO: la doc consultada no expone cómo listar las transacciones de un link (solo GET /transactions/:id, que exige el id de transacción).
  async consultarEstado() {
    return null;
  },
  async probarConexion(llaves, modo) {
    if (!llaves.llavePublica?.startsWith(`pub_${PREFIJO[modo]}_`)) return { ok: false, mensaje: `La llave pública no corresponde al modo ${modo}` };
    if (!llaves.llavePrivada?.startsWith(`prv_${PREFIJO[modo]}_`)) return { ok: false, mensaje: `La llave privada no corresponde al modo ${modo}` };
    if (!llaves.secretoEventos?.startsWith(`${PREFIJO[modo]}_events_`)) return { ok: false, mensaje: `El secreto de eventos no corresponde al modo ${modo}` };
    // TODO: GET /merchants/:llave_publica no pudo confirmarse en la doc consultada (el sitio bloqueó la página); se usa porque es el endpoint público del widget.
    const r = await llamarApi(BASE[modo], `/merchants/${encodeURIComponent(llaves.llavePublica)}`);
    const nombre = aTexto(aObjeto(aObjeto(r.json).data).name);
    return r.estado === 200 ? { ok: true, mensaje: nombre ? `Conexión correcta: ${nombre}` : "Conexión correcta" } : { ok: false, mensaje: `Wompi respondió ${r.estado}: revisa la llave pública` };
  },
  verificarWebhook({ headers, rawBody, llaves }) {
    if (!llaves.secretoEventos) return false;
    let ev: Record<string, unknown>;
    try {
      ev = aObjeto(JSON.parse(rawBody));
    } catch {
      return false;
    }
    const esperado = checksumWompi(ev, llaves.secretoEventos);
    const recibido = aTexto(aObjeto(ev.signature).checksum) ?? headers.get("x-event-checksum");
    // La doc muestra el checksum en mayúsculas: se compara sin distinguir mayúsculas.
    return !!esperado && !!recibido && igualesSeguro(esperado.toLowerCase(), recibido.toLowerCase());
  },
  async mapearEvento(payload, { modo }) {
    const p = aObjeto(payload);
    if (p.event !== "transaction.updated") return null;
    // `environment` del evento debe coincidir con el modo de la pasarela (un evento de pruebas no paga en producción).
    if (p.environment !== (modo === "SANDBOX" ? "test" : "prod")) return null;
    const t = aObjeto(aObjeto(p.data).transaction);
    const estado = ESTADOS[String(t.status)];
    const id = aTexto(t.id);
    const cents = aPesos(t.amount_in_cents);
    if (!estado || !id) return null;
    return {
      referencia: null, idExterno: aTexto(t.payment_link_id), estado, idTransaccion: id,
      monto: cents !== null && cents % 100 === 0 ? cents / 100 : null, moneda: aTexto(t.currency), idEventoExterno: `${id}:${String(t.status)}`,
    } satisfies EventoMapeado;
  },
};
