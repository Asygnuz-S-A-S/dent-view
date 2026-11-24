// Bold (Colombia): API de links de pago y webhook con x-bold-signature. Doc: developers.bold.co. NO probado contra una cuenta real.
import { createHmac } from "node:crypto";
import { aObjeto, aPesos, aTexto, ErrorPasarela, igualesSeguro, llamarApi, type ProveedorPago } from "./proveedor";

const BASE = "https://integrations.api.bold.co";
const cabecera = (llaves: Record<string, string>) => ({ Authorization: `x-api-key ${llaves.llaveIdentidad}` });

/** Doc: HMAC-SHA256 (hex) del cuerpo en Base64 con la llave secreta. */
export const firmaBold = (cuerpo: string, secreto: string) => createHmac("sha256", secreto).update(Buffer.from(cuerpo, "utf8").toString("base64")).digest("hex");

export const bold: ProveedorPago = {
  clave: "BOLD",
  nombre: "Bold",
  descripcion: "Links de pago de Bold (API de integración).",
  bloqueadoProduccion: true,
  advertencia: "No probado: implementado solo con la documentación. Bloqueado para producción hasta probarlo en una cuenta real.",
  campos: [
    { clave: "llaveIdentidad", etiqueta: "Llave de identidad", secreto: true },
    { clave: "llaveSecreta", etiqueta: "Llave secreta (firma de webhooks)", secreto: true },
  ],
  async crearLink(llaves, _modo, e) {
    // TODO: la doc dice que expiration_date va en nanosegundos pero los ejemplos parecen milisegundos; no se envía (el vencimiento se controla en dent-view).
    const r = await llamarApi(BASE, "/online/link/v1", {
      metodo: "POST", cabeceras: cabecera(llaves),
      cuerpo: {
        amount_type: "CLOSE", amount: { currency: "COP", total_amount: e.monto, tip_amount: 0 },
        description: e.descripcion.slice(0, 100), reference: e.referencia,
        ...(e.urlRetorno ? { callback_url: e.urlRetorno } : {}), ...(e.correoPagador ? { payer_email: e.correoPagador } : {}),
      },
    });
    const pl = aObjeto(aObjeto(r.json).payload);
    const id = aTexto(pl.payment_link);
    const url = aTexto(pl.url);
    if (r.estado >= 300 || !id || !url) throw new ErrorPasarela(`Bold rechazó la creación del link (${r.estado})`);
    return { idExterno: id, urlPago: url, expiraEn: e.expiraEn };
  },
  // TODO: GET /online/link/v1/{id} existe pero los campos de estado de la respuesta no se confirmaron.
  async consultarEstado() {
    return null;
  },
  // TODO: Bold no documenta una consulta liviana de credenciales: solo se valida que estén presentes.
  async probarConexion(llaves) {
    return llaves.llaveIdentidad && llaves.llaveSecreta ? { ok: true, mensaje: "Llaves guardadas (Bold no ofrece una prueba liviana confirmada: genera un link de prueba)" } : { ok: false, mensaje: "Faltan llaves" };
  },
  verificarWebhook({ headers, rawBody, llaves }) {
    const recibido = headers.get("x-bold-signature");
    // Siempre se exige la llave secreta (también en SANDBOX): firmar con secreto vacío permitiría a cualquiera falsificar el webhook.
    const secreto = llaves.llaveSecreta;
    if (!recibido || !secreto) return false;
    return igualesSeguro(firmaBold(rawBody, secreto).toLowerCase(), recibido.trim().toLowerCase());
  },
  async mapearEvento(payload) {
    const p = aObjeto(payload);
    const estado = p.type === "SALE_APPROVED" ? "APROBADO" : p.type === "SALE_REJECTED" ? "RECHAZADO" : null; // VOID_*: sin tratamiento automático (TODO)
    const d = aObjeto(p.data);
    const id = aTexto(p.id);
    if (!estado || !id) return null;
    const monto = aObjeto(d.amount);
    return {
      referencia: aTexto(aObjeto(d.metadata).reference), idExterno: null, estado, idTransaccion: aTexto(d.payment_id),
      monto: aPesos(monto.total), moneda: aTexto(monto.currency) ?? "COP", idEventoExterno: id, // TODO: el campo de moneda no se confirmó; se asume COP.
    };
  },
};
