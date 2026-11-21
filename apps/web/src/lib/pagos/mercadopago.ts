// Mercado Pago (Checkout Pro). Endpoints confirmados en el SDK oficial (mercadopago@3.6.2) y la doc de notificaciones; NO probado contra una cuenta real.
import { createHmac } from "node:crypto";
import { aObjeto, aPesos, aTexto, ErrorPasarela, igualesSeguro, llamarApi, type EstadoPago, type ProveedorPago } from "./proveedor";

const BASE = "https://api.mercadopago.com";
const ESTADOS: Record<string, EstadoPago | undefined> = {
  approved: "APROBADO", authorized: "PENDIENTE", pending: "PENDIENTE", in_process: "PENDIENTE", in_mediation: "PENDIENTE",
  rejected: "RECHAZADO", cancelled: "ANULADO",
};
const cabecera = (llaves: Record<string, string>) => ({ Authorization: `Bearer ${llaves.accessToken}` });

/** Manifiesto de x-signature (SDK oficial): `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`, omitiendo los pares ausentes. */
export function firmaMercadoPago(secreto: string, dataId: string | null, requestId: string | null, ts: string) {
  const partes = [...(dataId ? [`id:${dataId}`] : []), ...(requestId ? [`request-id:${requestId}`] : []), `ts:${ts}`];
  return createHmac("sha256", secreto).update(`${partes.join(";")};`).digest("hex");
}

async function obtenerPago(llaves: Record<string, string>, id: string) {
  const r = await llamarApi(BASE, `/v1/payments/${encodeURIComponent(id)}`, { cabeceras: cabecera(llaves) });
  if (r.estado !== 200) throw new ErrorPasarela(`Mercado Pago respondió ${r.estado} al consultar el pago`);
  return aObjeto(r.json);
}

export const mercadopago: ProveedorPago = {
  clave: "MERCADOPAGO",
  nombre: "Mercado Pago",
  descripcion: "Checkout Pro de Mercado Pago: preferencia de pago con página alojada.",
  bloqueadoProduccion: false,
  advertencia: "Implementado con la documentación y el SDK oficial; aún no probado contra una cuenta real. Úsalo primero en SANDBOX.",
  campos: [
    { clave: "accessToken", etiqueta: "Access token (TEST-… o APP_USR-…)", secreto: true },
    { clave: "secretoWebhook", etiqueta: "Clave secreta de webhooks", secreto: true },
  ],
  async crearLink(llaves, modo, e) {
    const r = await llamarApi(BASE, "/checkout/preferences", {
      metodo: "POST", cabeceras: cabecera(llaves),
      cuerpo: {
        items: [{ id: e.referencia, title: e.descripcion.slice(0, 250), quantity: 1, unit_price: e.monto, currency_id: "COP" }],
        external_reference: e.referencia,
        ...(e.urlWebhook.startsWith("https://") ? { notification_url: e.urlWebhook } : {}),
        ...(e.urlRetorno ? { back_urls: { success: e.urlRetorno, pending: e.urlRetorno, failure: e.urlRetorno } } : {}),
        ...(e.correoPagador ? { payer: { email: e.correoPagador } } : {}),
        expires: true, expiration_date_from: new Date().toISOString(), expiration_date_to: e.expiraEn.toISOString(),
      },
    });
    const j = aObjeto(r.json);
    const id = aTexto(j.id);
    const url = aTexto(modo === "SANDBOX" ? j.sandbox_init_point : j.init_point) ?? aTexto(j.init_point);
    if (r.estado >= 300 || !id || !url) throw new ErrorPasarela(`Mercado Pago rechazó la preferencia (${r.estado})`);
    return { idExterno: id, urlPago: url, expiraEn: e.expiraEn };
  },
  async consultarEstado(llaves, _modo, l) {
    // TODO: el filtro external_reference de /v1/payments/search no se confirmó en la doc consultada (sí existe el endpoint en el SDK).
    const r = await llamarApi(BASE, `/v1/payments/search?external_reference=${encodeURIComponent(l.referencia)}&sort=date_created&criteria=desc`, { cabeceras: cabecera(llaves) });
    if (r.estado !== 200) throw new ErrorPasarela(`Mercado Pago respondió ${r.estado} al buscar pagos`);
    const res = aObjeto(r.json).results;
    const pagos = (Array.isArray(res) ? res : []).map(aObjeto);
    const p = pagos.find((x) => x.status === "approved") ?? pagos[0];
    if (!p) return { estado: "PENDIENTE", monto: null, moneda: null, idTransaccion: null };
    return { estado: ESTADOS[String(p.status)] ?? "PENDIENTE", monto: aPesos(p.transaction_amount), moneda: aTexto(p.currency_id), idTransaccion: aTexto(p.id) };
  },
  async probarConexion(llaves) {
    const r = await llamarApi(BASE, "/users/me", { cabeceras: cabecera(llaves) });
    return r.estado === 200 ? { ok: true, mensaje: "Conexión correcta" } : { ok: false, mensaje: `Mercado Pago respondió ${r.estado}: revisa el access token` };
  },
  verificarWebhook({ headers, query, rawBody, llaves }) {
    const secreto = llaves.secretoWebhook;
    const partes = Object.fromEntries((headers.get("x-signature") ?? "").split(",").map((p) => [p.slice(0, p.indexOf("=")).trim().toLowerCase(), p.slice(p.indexOf("=") + 1).trim()]));
    if (!secreto || !partes.ts || !/^\d+$/.test(partes.ts) || !partes.v1) return false;
    let dataId = query.get("data.id");
    if (!dataId) {
      try {
        dataId = aTexto(aObjeto(aObjeto(JSON.parse(rawBody)).data).id);
      } catch {
        dataId = null;
      }
    }
    return igualesSeguro(firmaMercadoPago(secreto, dataId, headers.get("x-request-id"), partes.ts), partes.v1);
  },
  async mapearEvento(payload, e) {
    // El payload solo trae el id del pago: estado, monto y referencia se leen de la API con el token del centro (no se confía en el cuerpo).
    const p = aObjeto(payload);
    const id = aTexto(aObjeto(p.data).id) ?? e.query.get("data.id");
    if ((p.type ?? e.query.get("type")) !== "payment" || !id || !/^\d{1,20}$/.test(id)) return null;
    const pago = await obtenerPago(e.llaves, id);
    const estado = ESTADOS[String(pago.status)];
    if (!estado) return null; // refunded / charged_back: sin tratamiento automático (TODO)
    return {
      referencia: aTexto(pago.external_reference), idExterno: null, estado, idTransaccion: id,
      monto: aPesos(pago.transaction_amount), moneda: aTexto(pago.currency_id), idEventoExterno: `${id}:${String(pago.status)}`,
    };
  },
};
