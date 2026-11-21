// PayU Latam (WebCheckout). La confirmación y su firma están confirmadas en la doc; la creación de links NO (el checkout es un formulario POST).
import { createHash } from "node:crypto";
import { aObjeto, aTexto, ErrorPasarela, igualesSeguro, type EstadoPago, type ProveedorPago } from "./proveedor";

const ESTADOS: Record<string, EstadoPago | undefined> = { "4": "APROBADO", "6": "RECHAZADO", "5": "EXPIRADO" };

/** Doc: si el segundo decimal es 0 se usa un decimal (150.00 -> 150.0); si no, dos (150.26). */
export const nuevoValorPayu = (valor: string) => {
  const n = Number(valor);
  if (!Number.isFinite(n)) return valor;
  const dos = (Math.round(n * 100) / 100).toFixed(2);
  return dos.endsWith("0") ? dos.slice(0, -1) : dos;
};

export function firmaPayu(f: { apiKey: string; merchantId: string; referencia: string; valor: string; moneda: string; estado: string }, algoritmo: "md5" | "sha1" | "sha256") {
  return createHash(algoritmo).update([f.apiKey, f.merchantId, f.referencia, nuevoValorPayu(f.valor), f.moneda, f.estado].join("~")).digest("hex");
}
const ALGORITMO_POR_LARGO: Record<number, "md5" | "sha1" | "sha256"> = { 32: "md5", 40: "sha1", 64: "sha256" };

export const payu: ProveedorPago = {
  clave: "PAYU",
  nombre: "PayU",
  descripcion: "PayU Latam WebCheckout.",
  bloqueadoProduccion: true,
  advertencia: "No probado y incompleto: la confirmación (webhook) está implementada, pero la creación de links de pago no (TODO). Bloqueado para producción.",
  campos: [
    { clave: "apiKey", etiqueta: "ApiKey", secreto: true },
    { clave: "merchantId", etiqueta: "Merchant ID", secreto: false },
    { clave: "accountId", etiqueta: "Account ID", secreto: false },
  ],
  async crearLink() {
    // TODO: WebCheckout exige un formulario POST firmado hacia checkout.payulatam.com; no hay API de links confirmada en la doc.
    throw new ErrorPasarela("PayU: la generación de links de pago aún no está implementada");
  },
  async consultarEstado() {
    return null;
  },
  async probarConexion(llaves) {
    return llaves.apiKey && llaves.merchantId && llaves.accountId ? { ok: true, mensaje: "Datos guardados (PayU no ofrece una prueba liviana confirmada)" } : { ok: false, mensaje: "Faltan datos" };
  },
  verificarWebhook({ rawBody, llaves }) {
    const f = new URLSearchParams(rawBody);
    const sign = f.get("sign");
    const alg = sign ? ALGORITMO_POR_LARGO[sign.length] : undefined;
    const campos = ["reference_sale", "value", "currency", "state_pol"].map((k) => f.get(k));
    if (!alg || !sign || !llaves.apiKey || !llaves.merchantId || campos.some((c) => c === null)) return false;
    // El merchant_id se toma de la configuración del centro, no del cuerpo.
    const esperado = firmaPayu({ apiKey: llaves.apiKey, merchantId: llaves.merchantId, referencia: campos[0]!, valor: campos[1]!, moneda: campos[2]!, estado: campos[3]! }, alg);
    return igualesSeguro(esperado, sign.toLowerCase());
  },
  async mapearEvento(payload) {
    const p = aObjeto(payload);
    const estado = ESTADOS[String(p.state_pol)];
    const id = aTexto(p.transaction_id);
    const valor = Number(p.value);
    if (!estado || !id) return null;
    return { referencia: aTexto(p.reference_sale), idExterno: null, estado, idTransaccion: id, monto: Number.isInteger(valor) ? valor : null, moneda: aTexto(p.currency), idEventoExterno: id };
  },
};
