import { describe, expect, it } from "vitest";
import { bold, firmaBold } from "./bold";
import { decidirEvento, estadoEfectivoLink, linkActivo } from "./decision";
import { epayco, firmaEpayco } from "./epayco";
import { firmaMercadoPago, mercadopago } from "./mercadopago";
import { firmaPayu, nuevoValorPayu, payu } from "./payu";
import { llamarApi, ErrorPasarela, type EntradaWebhook, type Modo } from "./proveedor";
import { checksumWompi, wompi } from "./wompi";

// Vectores calculados a mano (node:crypto / openssl) siguiendo los pasos de cada documentación.
const entrada = (o: { rawBody?: string; headers?: Record<string, string>; query?: string; llaves?: Record<string, string>; modo?: Modo }): EntradaWebhook => ({
  rawBody: o.rawBody ?? "", headers: new Headers(o.headers), query: new URLSearchParams(o.query), llaves: o.llaves ?? {}, modo: o.modo ?? "SANDBOX",
});

describe("Wompi", () => {
  const SECRETO = "prod_events_OcHnIzeBl5socpwByQ4hA52Em3USQ93Z";
  const evento = (over: Record<string, unknown> = {}) => ({
    event: "transaction.updated", environment: "prod", timestamp: 1530291411,
    data: { transaction: { id: "1234-1610641025-49201", status: "APPROVED", amount_in_cents: 4490000, currency: "COP", payment_link_id: "LINK1", reference: "x" } },
    signature: { properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"], checksum: "" },
    ...over,
  });
  // SHA256("1234-1610641025-49201" + "APPROVED" + "4490000" + "1530291411" + secreto). Nota: el checksum de ejemplo de la doc (3476DD…) no se reproduce con su propia cadena.
  const CHECKSUM = "5a18ec5e8fdb7df463e9f94774cba8f583ba21bd04a09ceff2ea68a4bc0aefbe";
  const firmado = (over?: Record<string, unknown>) => { const e = evento(over); (e.signature as { checksum: string }).checksum = CHECKSUM.toUpperCase(); return e; };

  it("calcula el checksum según los pasos de la doc", () => expect(checksumWompi(evento(), SECRETO)).toBe(CHECKSUM));
  it("acepta un evento válido (checksum en mayúsculas)", () => expect(wompi.verificarWebhook(entrada({ rawBody: JSON.stringify(firmado()), llaves: { secretoEventos: SECRETO } }))).toBe(true));
  it("rechaza monto alterado, secreto distinto o checksum ausente", () => {
    const alterado = firmado();
    (alterado.data.transaction as { amount_in_cents: number }).amount_in_cents = 1;
    expect(wompi.verificarWebhook(entrada({ rawBody: JSON.stringify(alterado), llaves: { secretoEventos: SECRETO } }))).toBe(false);
    expect(wompi.verificarWebhook(entrada({ rawBody: JSON.stringify(firmado()), llaves: { secretoEventos: "otro" } }))).toBe(false);
    expect(wompi.verificarWebhook(entrada({ rawBody: JSON.stringify(evento()), llaves: { secretoEventos: SECRETO } }))).toBe(false);
    expect(wompi.verificarWebhook(entrada({ rawBody: "no json", llaves: { secretoEventos: SECRETO } }))).toBe(false);
  });
  it("exige que el checksum cubra id, estado y monto", () => {
    const e = firmado({ signature: { properties: ["transaction.id"], checksum: "x" } });
    expect(checksumWompi(e, SECRETO)).toBeNull();
    expect(wompi.verificarWebhook(entrada({ rawBody: JSON.stringify(e), llaves: { secretoEventos: SECRETO } }))).toBe(false);
  });
  it("mapea el evento: monto en pesos, link y estado", async () => {
    const ev = await wompi.mapearEvento(firmado(), entrada({ modo: "PRODUCCION" }));
    expect(ev).toMatchObject({ estado: "APROBADO", monto: 44900, moneda: "COP", idExterno: "LINK1", idEventoExterno: "1234-1610641025-49201:APPROVED" });
  });
  it("ignora eventos de otro ambiente y montos con centavos", async () => {
    expect(await wompi.mapearEvento(firmado(), entrada({ modo: "SANDBOX" }))).toBeNull();
    const e = firmado();
    (e.data.transaction as { amount_in_cents: number }).amount_in_cents = 4490050;
    expect((await wompi.mapearEvento(e, entrada({ modo: "PRODUCCION" })))?.monto).toBeNull();
  });
});

describe("Mercado Pago", () => {
  const H = { "x-request-id": "bb56a2f1-6aae-46ac-982e-9dcd3581d08e", "x-signature": "ts=1742505638,v1=368a21f417285fb1822d68d16282199a7221feeda0ca0f40eb38d903d57bfa37" };
  const llaves = { secretoWebhook: "secreto_mp_prueba" };
  it("arma el manifiesto id/request-id/ts del SDK oficial", () =>
    expect(firmaMercadoPago("secreto_mp_prueba", "123456", H["x-request-id"], "1742505638")).toBe("368a21f417285fb1822d68d16282199a7221feeda0ca0f40eb38d903d57bfa37"));
  it("verifica con data.id de la query o del cuerpo", () => {
    expect(mercadopago.verificarWebhook(entrada({ headers: H, query: "data.id=123456&type=payment", llaves }))).toBe(true);
    expect(mercadopago.verificarWebhook(entrada({ headers: H, rawBody: '{"data":{"id":"123456"}}', llaves }))).toBe(true);
  });
  it("rechaza id distinto, secreto distinto o cabecera mal formada", () => {
    expect(mercadopago.verificarWebhook(entrada({ headers: H, query: "data.id=999", llaves }))).toBe(false);
    expect(mercadopago.verificarWebhook(entrada({ headers: H, query: "data.id=123456", llaves: { secretoWebhook: "x" } }))).toBe(false);
    expect(mercadopago.verificarWebhook(entrada({ headers: { "x-signature": "basura" }, query: "data.id=123456", llaves }))).toBe(false);
    expect(mercadopago.verificarWebhook(entrada({ query: "data.id=123456", llaves }))).toBe(false);
  });
  it("no consulta la API con ids que no son numéricos (evita manipular la ruta)", async () => {
    expect(await mercadopago.mapearEvento({ type: "payment", data: { id: "../users/me" } }, entrada({}))).toBeNull();
  });
});

describe("Bold", () => {
  const CUERPO = '{"id":"abc-123","type":"SALE_APPROVED","subject":"TX1","data":{"payment_id":"TX1","amount":{"total":50000},"metadata":{"reference":"dvREF"}}}';
  it("firma HMAC-SHA256 del cuerpo en Base64 (llave vacía en pruebas)", () => {
    expect(firmaBold(CUERPO, "")).toBe("4475ce01947f8c95c81464ec67a1bd9906175c091e085bf545984182f1741f36");
    expect(firmaBold(CUERPO, "llave_secreta_bold")).toBe("bdc402f6c771cf749528432f1f572c22940cd5e1617c58315c4201a486476053");
  });
  it("verifica según el modo y rechaza firma ajena", () => {
    expect(bold.verificarWebhook(entrada({ rawBody: CUERPO, headers: { "x-bold-signature": "4475ce01947f8c95c81464ec67a1bd9906175c091e085bf545984182f1741f36" }, modo: "SANDBOX" }))).toBe(true);
    expect(bold.verificarWebhook(entrada({ rawBody: CUERPO, headers: { "x-bold-signature": "bdc402f6c771cf749528432f1f572c22940cd5e1617c58315c4201a486476053" }, llaves: { llaveSecreta: "llave_secreta_bold" }, modo: "PRODUCCION" }))).toBe(true);
    expect(bold.verificarWebhook(entrada({ rawBody: CUERPO, headers: { "x-bold-signature": "00" }, llaves: { llaveSecreta: "llave_secreta_bold" }, modo: "PRODUCCION" }))).toBe(false);
    expect(bold.verificarWebhook(entrada({ rawBody: CUERPO, headers: { "x-bold-signature": "4475ce01947f8c95c81464ec67a1bd9906175c091e085bf545984182f1741f36" }, llaves: { llaveSecreta: "llave_secreta_bold" }, modo: "PRODUCCION" }))).toBe(false);
  });
  it("mapea ventas aprobadas y rechazadas; ignora el resto", async () => {
    expect(await bold.mapearEvento(JSON.parse(CUERPO), entrada({}))).toMatchObject({ estado: "APROBADO", referencia: "dvREF", monto: 50000, idEventoExterno: "abc-123" });
    expect(await bold.mapearEvento({ id: "1", type: "VOID_APPROVED", data: {} }, entrada({}))).toBeNull();
  });
});

describe("PayU", () => {
  it("redondea new_value según la doc", () => {
    expect([nuevoValorPayu("150.00"), nuevoValorPayu("150.26"), nuevoValorPayu("150.25"), nuevoValorPayu("50000.00")]).toEqual(["150.0", "150.26", "150.25", "50000.0"]);
  });
  it("firma md5 con ApiKey~merchant~referencia~valor~moneda~estado", () => {
    const f = { apiKey: "4Vj8eK4rloUd272L48hsrarnUA", merchantId: "508029", referencia: "TestPayU04", valor: "150.00", moneda: "USD", estado: "6" };
    expect(firmaPayu(f, "md5")).toBe("df67936f918887b2aa31688a77a10fe1");
  });
  it("verifica la confirmación y rechaza firma alterada", () => {
    const cuerpo = (sign: string) => `reference_sale=TestPayU04&value=150.00&currency=USD&state_pol=6&sign=${sign}&transaction_id=T1`;
    const llaves = { apiKey: "4Vj8eK4rloUd272L48hsrarnUA", merchantId: "508029" };
    expect(payu.verificarWebhook(entrada({ rawBody: cuerpo("df67936f918887b2aa31688a77a10fe1"), llaves }))).toBe(true);
    expect(payu.verificarWebhook(entrada({ rawBody: cuerpo("df67936f918887b2aa31688a77a10fe2"), llaves }))).toBe(false);
  });
});

describe("ePayco (fórmula sin reconfirmar en la doc vigente)", () => {
  const f = { pCustId: "123456", pKey: "clave_p", refPayco: "9988", idTransaccion: "TX77", monto: "50000", moneda: "COP" };
  it("firma sha256 con separador ^", () => expect(firmaEpayco(f)).toBe("33d4dac0986ac22b4cec497e83658763ff2128dd7698141c5bb0243874711a38"));
  it("verifica y rechaza", () => {
    const q = (s: string) => `x_ref_payco=9988&x_transaction_id=TX77&x_amount=50000&x_currency_code=COP&x_signature=${s}`;
    expect(epayco.verificarWebhook(entrada({ rawBody: q(firmaEpayco(f)), llaves: { pCustId: "123456", pKey: "clave_p" } }))).toBe(true);
    expect(epayco.verificarWebhook(entrada({ rawBody: q("0"), llaves: { pCustId: "123456", pKey: "clave_p" } }))).toBe(false);
  });
});

describe("decidirEvento (monto, moneda y estados)", () => {
  const link = { monto: 50000, moneda: "COP", estado: "CREADO" };
  const ev = { estado: "APROBADO" as const, monto: 50000, moneda: "COP" };
  it("aplica un pago aprobado que coincide", () => expect(decidirEvento(link, ev)).toEqual({ accion: "APLICAR" }));
  it("no aplica si el monto o la moneda no coinciden (o el monto falta)", () => {
    expect(decidirEvento(link, { ...ev, monto: 49999 })).toEqual({ accion: "IGNORAR", motivo: "monto_no_coincide" });
    expect(decidirEvento(link, { ...ev, monto: null })).toEqual({ accion: "IGNORAR", motivo: "monto_no_coincide" });
    expect(decidirEvento(link, { ...ev, moneda: "USD" })).toEqual({ accion: "IGNORAR", motivo: "moneda_no_coincide" });
  });
  it("un link ya aprobado nunca vuelve a aplicarse", () => expect(decidirEvento({ ...link, estado: "APROBADO" }, ev)).toEqual({ accion: "IGNORAR", motivo: "link_ya_aprobado" }));
  it("un link anulado o vencido igual recibe un pago aprobado (el dinero llegó)", () => {
    expect(decidirEvento({ ...link, estado: "ANULADO" }, ev).accion).toBe("APLICAR");
    expect(decidirEvento({ ...link, estado: "EXPIRADO" }, ev).accion).toBe("APLICAR");
  });
  it("transiciones de estado sin pago", () => {
    expect(decidirEvento(link, { ...ev, estado: "RECHAZADO" })).toEqual({ accion: "ESTADO", estado: "RECHAZADO" });
    expect(decidirEvento(link, { ...ev, estado: "PENDIENTE" })).toEqual({ accion: "ESTADO", estado: "PENDIENTE" });
    expect(decidirEvento({ ...link, estado: "PENDIENTE" }, { ...ev, estado: "PENDIENTE" }).accion).toBe("IGNORAR");
    expect(decidirEvento({ ...link, estado: "ANULADO" }, { ...ev, estado: "RECHAZADO" }).accion).toBe("IGNORAR");
  });
  it("estado efectivo: un link sin pagar vencido se ve EXPIRADO", () => {
    const pasado = new Date(Date.now() - 1000);
    expect(estadoEfectivoLink({ estado: "CREADO", expiraEn: pasado })).toBe("EXPIRADO");
    expect(estadoEfectivoLink({ estado: "APROBADO", expiraEn: pasado })).toBe("APROBADO");
    expect(linkActivo({ estado: "PENDIENTE", expiraEn: new Date(Date.now() + 60_000) })).toBe(true);
  });
});

describe("SSRF", () => {
  it("solo llama a hosts fijos de los proveedores", async () => {
    await expect(llamarApi("https://evil.example.com", "/x")).rejects.toBeInstanceOf(ErrorPasarela);
    await expect(llamarApi("http://api.mercadopago.com", "/x")).rejects.toBeInstanceOf(ErrorPasarela);
    await expect(llamarApi("https://api.mercadopago.com", "@evil.example.com/x")).rejects.toBeInstanceOf(ErrorPasarela);
  });
});
