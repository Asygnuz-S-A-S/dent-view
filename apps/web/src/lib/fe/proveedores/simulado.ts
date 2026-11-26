// Proveedor SIMULADO (solo desarrollo): no llama a nadie. Acepta con un CUFE falso determinístico y genera PDF/XML de ejemplo.
// Escenarios (ConexionFE.configJson.escenario): ACEPTAR | RECHAZAR | ERROR_TRANSITORIO | LENTO | PROCESANDO.
import { createHash, createHmac } from "node:crypto";
import { aObjeto, aTexto, dormir, ErrorFE, igualesSeguro, simuladoPermitido, type ContextoFE, type ProveedorFacturacionElectronica, type ResultadoEmision } from "../proveedor";

export const MARCA_SIMULADO = "SIMULADO — SIN VALIDEZ FISCAL";
const guardia = () => {
  if (!simuladoPermitido()) throw new ErrorFE("El proveedor simulado solo existe en localhost", false);
};
const escenario = (ctx: ContextoFE) => aTexto(ctx.config.escenario) ?? "ACEPTAR";
export const cufeSimulado = (clave: string) => createHash("sha384").update(`SIMULADO:${clave}`).digest("hex");
const numeroSimulado = (clave: string) => `SIM${(parseInt(createHash("sha256").update(clave).digest("hex").slice(0, 8), 16) % 100_000_000).toString().padStart(8, "0")}`;
const idDe = (clave: string) => `SIM-${createHash("sha256").update(clave).digest("hex").slice(0, 16)}`;

function aceptada(clave: string): ResultadoEmision {
  return { estado: "ACEPTADA", idExterno: idDe(clave), numeroDian: numeroSimulado(clave), cufe: cufeSimulado(clave), mensajes: [MARCA_SIMULADO] };
}
async function emitir(ctx: ContextoFE, clave: string): Promise<ResultadoEmision> {
  guardia();
  const e = escenario(ctx);
  if (e === "LENTO") await dormir(3000);
  if (e === "ERROR_TRANSITORIO") throw new ErrorFE("Error simulado del proveedor (transitorio)");
  if (e === "RECHAZAR") return { estado: "RECHAZADA", idExterno: idDe(clave), mensajes: ["Rechazo simulado: el NIT del adquirente no coincide con el registro (escenario RECHAZAR)", MARCA_SIMULADO] };
  if (e === "PROCESANDO") return { estado: "PROCESANDO", idExterno: idDe(clave), mensajes: [] };
  return aceptada(clave);
}

/** PDF mínimo válido de una página (texto en WinAnsi: la raya larga va como \227). */
export function pdfSimulado(lineas: string[]): Uint8Array {
  const esc = (t: string) => t.replace(/[\\()]/g, "\\$&").replace(/—/g, "\\227");
  const contenido = `BT /F1 12 Tf 50 780 Td 16 TL ${lineas.map((l) => `(${esc(l)}) Tj T*`).join(" ")} ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(contenido, "latin1")} >>\nstream\n${contenido}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  let out = "%PDF-1.4\n";
  const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(out, "latin1")); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
const xmlSimulado = (id: string, cufe: string, tipo: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<!-- ${MARCA_SIMULADO} -->\n<Documento tipo="${tipo}" simulado="true"><ID>${id}</ID><CUFE>${cufe}</CUFE><Aviso>${MARCA_SIMULADO}</Aviso></Documento>\n`;

export const firmaWebhookSimulado = (cuerpo: string, secreto: string) => createHmac("sha256", secreto).update(cuerpo).digest("hex");

export const simulado: ProveedorFacturacionElectronica = {
  clave: "SIMULADO",
  nombre: "Simulado (desarrollo)",
  descripcion: "Proveedor de pruebas locales: no envía nada a la DIAN. Genera documentos de ejemplo sin validez fiscal.",
  bloqueadoProduccion: true,
  soloLocal: true,
  soportaSalud: true,
  soportaCuv: false,
  advertencia: MARCA_SIMULADO,
  campos: [{ clave: "secretoWebhook", etiqueta: "Secreto del webhook", secreto: true }],
  camposConfig: [{
    clave: "escenario", etiqueta: "Escenario simulado", tipo: "select",
    opciones: [{ valor: "ACEPTAR", etiqueta: "Aceptar" }, { valor: "RECHAZAR", etiqueta: "Rechazar" }, { valor: "ERROR_TRANSITORIO", etiqueta: "Error transitorio" }, { valor: "LENTO", etiqueta: "Respuesta lenta (3 s)" }, { valor: "PROCESANDO", etiqueta: "Procesando (se resuelve al consultar)" }],
  }],
  async probarConexion() {
    guardia();
    return { ok: true, mensaje: "Conexión simulada (FEV_SIMULADO activo)" };
  },
  emitirFactura: (ctx, _f, clave) => emitir(ctx, clave),
  emitirNotaCredito: (ctx, _n, clave) => emitir(ctx, clave),
  async consultarEstado(ctx, d) {
    guardia();
    if (!d.idExterno.startsWith("SIM-")) throw new ErrorFE("Documento desconocido para el simulador", false);
    if (escenario(ctx) === "RECHAZAR") return { estado: "RECHAZADA", idExterno: d.idExterno, mensajes: ["Rechazo simulado", MARCA_SIMULADO] };
    return { estado: "ACEPTADA", idExterno: d.idExterno, numeroDian: numeroSimulado(d.idExterno), cufe: cufeSimulado(d.idExterno), mensajes: [MARCA_SIMULADO] };
  },
  async descargar(_ctx, d) {
    guardia();
    const cufe = cufeSimulado(d.idExterno);
    if (d.que === "xml") return { bytes: Buffer.from(xmlSimulado(d.idExterno, cufe, d.tipo), "utf8"), contentType: "application/xml" };
    if (d.que === "pdf") return { bytes: pdfSimulado([MARCA_SIMULADO, "", d.tipo === "FACTURA" ? "Factura electrónica de venta (ejemplo)" : "Nota crédito electrónica (ejemplo)", `Id: ${d.idExterno}`, `CUFE: ${cufe.slice(0, 48)}`, `      ${cufe.slice(48)}`]), contentType: "application/pdf" };
    return null;
  },
  verificarWebhook({ headers, rawBody, llaves }) {
    const recibido = headers.get("x-fe-signature");
    const secreto = llaves.secretoWebhook;
    return !!recibido && !!secreto && igualesSeguro(firmaWebhookSimulado(rawBody, secreto), recibido.trim().toLowerCase());
  },
  mapearEvento(payload) {
    const p = aObjeto(payload);
    const id = aTexto(p.idExterno);
    const estado = p.estado === "ACEPTADA" || p.estado === "RECHAZADA" ? p.estado : null;
    if (!id || !estado) return null;
    return { idExterno: id, estado, numeroDian: aTexto(p.numeroDian), cufe: aTexto(p.cufe), mensajes: Array.isArray(p.mensajes) ? p.mensajes.filter((m): m is string => typeof m === "string").slice(0, 20) : [] };
  },
};
