// ePayco. La documentación vigente (docs.epayco.com -> docs.davipay.com) no se pudo leer: TODO confirmar TODO el adaptador antes de usarlo.
import { aObjeto, aTexto, ErrorPasarela, igualesSeguro, sha256Hex, type EstadoPago, type ProveedorPago } from "./proveedor";

const ESTADOS: Record<string, EstadoPago | undefined> = { "1": "APROBADO", "2": "RECHAZADO", "3": "PENDIENTE", "4": "RECHAZADO" };

/** TODO: fórmula de x_signature tomada de la documentación conocida de ePayco, sin poder reconfirmarla contra la doc vigente. */
export const firmaEpayco = (f: { pCustId: string; pKey: string; refPayco: string; idTransaccion: string; monto: string; moneda: string }) =>
  sha256Hex([f.pCustId, f.pKey, f.refPayco, f.idTransaccion, f.monto, f.moneda].join("^"));

export const epayco: ProveedorPago = {
  clave: "EPAYCO",
  nombre: "ePayco",
  descripcion: "ePayco (confirmación por webhook).",
  bloqueadoProduccion: true,
  advertencia: "No probado e incompleto: solo la verificación de la confirmación está implementada (TODO sin confirmar en la doc); la creación de links no. Bloqueado para producción.",
  campos: [
    { clave: "pCustId", etiqueta: "P_CUST_ID_CLIENTE", secreto: false },
    { clave: "pKey", etiqueta: "P_KEY", secreto: true },
  ],
  async crearLink() {
    // TODO: endpoint y campos de links de ePayco sin confirmar (la doc no estuvo accesible).
    throw new ErrorPasarela("ePayco: la generación de links de pago aún no está implementada");
  },
  async consultarEstado() {
    return null;
  },
  async probarConexion(llaves) {
    return llaves.pCustId && llaves.pKey ? { ok: true, mensaje: "Datos guardados (sin prueba de conexión: TODO)" } : { ok: false, mensaje: "Faltan datos" };
  },
  verificarWebhook({ rawBody, llaves }) {
    const f = new URLSearchParams(rawBody);
    const firma = f.get("x_signature");
    const [ref, tx, monto, moneda] = ["x_ref_payco", "x_transaction_id", "x_amount", "x_currency_code"].map((k) => f.get(k));
    if (!firma || !llaves.pCustId || !llaves.pKey || !ref || !tx || !monto || !moneda) return false;
    return igualesSeguro(firmaEpayco({ pCustId: llaves.pCustId, pKey: llaves.pKey, refPayco: ref, idTransaccion: tx, monto, moneda }), firma.toLowerCase());
  },
  async mapearEvento(payload) {
    const p = aObjeto(payload);
    const estado = ESTADOS[String(p.x_cod_response)];
    const ref = aTexto(p.x_ref_payco);
    const monto = Number(p.x_amount);
    if (!estado || !ref) return null;
    return { referencia: aTexto(p.x_id_invoice), idExterno: null, estado, idTransaccion: aTexto(p.x_transaction_id), monto: Number.isInteger(monto) ? monto : null, moneda: aTexto(p.x_currency_code), idEventoExterno: `${ref}:${String(p.x_cod_response)}` };
  },
};
