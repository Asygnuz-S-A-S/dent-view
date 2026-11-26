// Marco común de proveedores tecnológicos de facturación electrónica (FEV DIAN). Sin dependencias de Next.
// Agregar un proveedor = un archivo en ./proveedores + una línea en ./registro.ts (ver docs/integraciones/facturacion-electronica.md).
// Solo se llama a hosts fijos declarados por cada adaptador (nunca a URLs del usuario: SSRF).
import { createHash, timingSafeEqual } from "node:crypto";

export type Modo = "SANDBOX" | "PRODUCCION";
export type Llaves = Record<string, string>;
export type Config = Record<string, unknown>;
export type CampoLlave = { clave: string; etiqueta: string; secreto: boolean; opcional?: boolean };
export type CampoConfig = { clave: string; etiqueta: string; ayuda?: string; tipo: "texto" | "numero" | "select"; opciones?: { valor: string; etiqueta: string }[]; opcional?: boolean };
/** Todo lo que un adaptador necesita de la conexión del centro. */
export type ContextoFE = { llaves: Llaves; modo: Modo; config: Config };

export type TipoDocumentoDian = "13" | "12" | "22" | "41" | "11" | "31";
export type Impuesto = { tipo: "EXCLUIDO" | "IVA"; tarifa: number };
export type LineaFE = { descripcion: string; cantidad: number; valorUnitario: number; descuento: number; total: number; codigoCups: string | null; servicioId: string | null; impuesto: Impuesto };
export type MedioPagoFE = { codigoDian: string; valor: number; fecha: string };
export type SaludFE = { codigoPrestador: string; modalidadPago: string | null; coberturaPlanBeneficios: string; numeroContrato: string | null; copago: number; cuotaModeradora: number; anticipo: number };
export type EmisorFE = { nit: string; dv: string; razonSocial: string; nombreComercial: string | null; regimen: string | null; responsabilidadFiscal: string | null };
export type AdquirenteFE = { tipoPersona: "NATURAL" | "JURIDICA"; tipoDocumento: TipoDocumentoDian; numeroDocumento: string; dv: string | null; nombre: string; correo: string | null; direccion: string | null; celular: string | null };
export type FacturaFE = {
  referencia: string; fecha: string; prefijo: string | null; formaPago: "CONTADO" | "CREDITO"; vence: string | null;
  emisor: EmisorFE; adquirente: AdquirenteFE; lineas: LineaFE[]; mediosPago: MedioPagoFE[]; anticipos: number;
  subtotal: number; impuestos: number; total: number; observaciones: string | null; salud: SaludFE | null;
};
export type NotaFE = {
  referencia: string; fecha: string; motivoDian: "1" | "2"; motivo: string; emisor: EmisorFE; adquirente: AdquirenteFE;
  origen: { idExterno: string | null; numeroDian: string | null; cufe: string; fecha: string };
  lineas: LineaFE[]; subtotal: number; impuestos: number; total: number;
};

export type EstadoEmision = "ACEPTADA" | "RECHAZADA" | "PROCESANDO";
export type ResultadoEmision = { estado: EstadoEmision; idExterno: string | null; numeroDian?: string | null; cufe?: string | null; mensajes: string[] };
export type Descarga = { bytes: Uint8Array; contentType: string };
export type TipoDescarga = "pdf" | "xml" | "attached";
export type EventoFE = { idExterno: string; estado: EstadoEmision; numeroDian?: string | null; cufe?: string | null; mensajes: string[] };
export type EntradaWebhook = { headers: Headers; rawBody: string; llaves: Llaves; modo: Modo };

export interface ProveedorFacturacionElectronica {
  clave: string;
  nombre: string;
  descripcion: string;
  /** true = "No probado": no se permite en modo PRODUCCION. */
  bloqueadoProduccion: boolean;
  advertencia?: string;
  soportaSalud: boolean;
  soportaCuv: boolean;
  /** Solo desarrollo: no aparece ni se acepta fuera de localhost. */
  soloLocal?: boolean;
  /** Credenciales declarativas: la UI las pinta sin código específico. Se guardan cifradas. */
  campos: CampoLlave[];
  /** Ajustes no secretos del proveedor (ids de resolución, escenario…) que van en ConexionFE.configJson. */
  camposConfig?: CampoConfig[];
  probarConexion(ctx: ContextoFE): Promise<{ ok: boolean; mensaje: string }>;
  /** Un fallo transitorio (red, 5xx, tiempo) se lanza como ErrorFE{transitorio:true}; un rechazo de negocio se devuelve como RECHAZADA. */
  emitirFactura(ctx: ContextoFE, f: FacturaFE, claveIdempotencia: string): Promise<ResultadoEmision>;
  emitirNotaCredito(ctx: ContextoFE, n: NotaFE, claveIdempotencia: string): Promise<ResultadoEmision>;
  consultarEstado(ctx: ContextoFE, d: { idExterno: string; tipo: "FACTURA" | "NOTA_CREDITO" }): Promise<ResultadoEmision>;
  /** null = el proveedor no entrega ese archivo. */
  descargar(ctx: ContextoFE, d: { idExterno: string; tipo: "FACTURA" | "NOTA_CREDITO"; que: TipoDescarga }): Promise<Descarga | null>;
  verificarWebhook?(e: EntradaWebhook): boolean;
  mapearEvento?(payload: unknown, e: EntradaWebhook): EventoFE | null;
}

/** Error con mensaje apto para el admin (nunca llaves ni cuerpos de respuesta). transitorio = vale la pena reintentar. */
export class ErrorFE extends Error {
  constructor(mensaje: string, readonly transitorio = true) {
    super(mensaje);
  }
}

export const igualesSeguro = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
export const sha256Hex = (t: string | Uint8Array) => createHash("sha256").update(t).digest("hex");
export const aObjeto = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
export const aTexto = (v: unknown): string | null => (typeof v === "string" && v ? v : typeof v === "number" ? String(v) : null);
export const ultimos4 = (v: string | undefined) => (v ? `••••${v.slice(-4)}` : "—");
export const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** El simulador solo existe en localhost y con FEV_SIMULADO=1, aunque alguien deje la variable en un servidor real. */
export const esLocal = () => /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(process.env.BETTER_AUTH_URL ?? "");
export const simuladoPermitido = () => process.env.FEV_SIMULADO === "1" && esLocal();

export const TAMANO_MAX_DESCARGA = 10 * 1024 * 1024;

/** Llamada HTTPS a un host fijo, con tiempo de espera, sin redirecciones y con reintentos con backoff (solo si `reintentar`: consultas y autenticación, nunca creación de documentos). */
export async function llamarApi(
  hosts: ReadonlySet<string>, base: string, ruta: string,
  o: { metodo?: "GET" | "POST"; cabeceras?: Record<string, string>; cuerpo?: unknown; reintentar?: boolean; fetch?: typeof fetch; esperaMs?: number } = {},
): Promise<{ estado: number; json: unknown }> {
  const url = new URL(base + ruta);
  if (url.protocol !== "https:" || !hosts.has(url.hostname)) throw new ErrorFE("Destino no permitido", false);
  const intentos = o.reintentar ? 3 : 1;
  let ultimo: ErrorFE = new ErrorFE("No se pudo conectar con el proveedor");
  for (let i = 0; i < intentos; i++) {
    if (i > 0) await dormir((o.esperaMs ?? 500) * 2 ** (i - 1));
    try {
      const r = await (o.fetch ?? fetch)(url, {
        method: o.metodo ?? "GET",
        headers: { Accept: "application/json", ...(o.cuerpo ? { "Content-Type": "application/json" } : {}), ...o.cabeceras },
        body: o.cuerpo ? JSON.stringify(o.cuerpo) : undefined,
        signal: AbortSignal.timeout(20_000),
        redirect: "error",
      });
      if (r.status >= 500) {
        ultimo = new ErrorFE(`El proveedor respondió con error ${r.status}`);
        continue;
      }
      return { estado: r.status, json: await r.json().catch(() => null) };
    } catch (e) {
      ultimo = new ErrorFE(e instanceof Error && e.name === "TimeoutError" ? "El proveedor no respondió a tiempo" : "No se pudo conectar con el proveedor");
    }
  }
  throw ultimo;
}
