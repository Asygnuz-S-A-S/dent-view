// Marco común de pasarelas de pago. El dinero va a la cuenta del centro; aquí no se tocan datos de tarjeta (checkout alojado por la pasarela).
// Sin dependencias de Next. Solo se llama a hosts fijos de cada proveedor (nunca a URLs del usuario: SSRF).
import { createHash, timingSafeEqual } from "node:crypto";

export const PROVEEDORES = ["WOMPI", "EPAYCO", "PAYU", "MERCADOPAGO", "BOLD"] as const;
export type ClaveProveedor = (typeof PROVEEDORES)[number];
export type Modo = "SANDBOX" | "PRODUCCION";
export type EstadoPago = "PENDIENTE" | "APROBADO" | "RECHAZADO" | "EXPIRADO" | "ANULADO";
export type Llaves = Record<string, string>;
export type CampoLlave = { clave: string; etiqueta: string; secreto: boolean };

export type EntradaLink = {
  referencia: string; monto: number; descripcion: string; expiraEn: Date;
  /** https o null: la pasarela exige https para redirección y notificación. */
  urlRetorno: string | null; urlWebhook: string; correoPagador?: string | null;
};
export type LinkCreado = { idExterno: string; urlPago: string; expiraEn: Date };
export type EventoMapeado = {
  /** Nuestra referencia (LinkPago.referencia) si el proveedor la devuelve. */
  referencia: string | null;
  /** Id del link/preferencia en el proveedor si no hay referencia (Wompi: payment_link_id). */
  idExterno: string | null;
  estado: EstadoPago;
  /** En pesos COP enteros; null si el proveedor no lo trae. */
  monto: number | null;
  moneda: string | null;
  /** Identifica el evento para idempotencia (se prefija con la pasarela en la ruta). */
  idEventoExterno: string;
  idTransaccion: string | null;
};
export type EntradaWebhook = { headers: Headers; rawBody: string; query: URLSearchParams; llaves: Llaves; modo: Modo };

export interface ProveedorPago {
  clave: ClaveProveedor;
  nombre: string;
  descripcion: string;
  /** true = adaptador "No probado" (solo con la doc): no se permite en modo PRODUCCION. Wompi y Mercado Pago tampoco se probaron con cuenta real, pero se permiten (ver advertencia). */
  bloqueadoProduccion: boolean;
  advertencia?: string;
  campos: CampoLlave[];
  crearLink(llaves: Llaves, modo: Modo, e: EntradaLink): Promise<LinkCreado>;
  /** null = el proveedor no permite consultar (conciliación no disponible). */
  consultarEstado(llaves: Llaves, modo: Modo, l: { idExterno: string; referencia: string }): Promise<{ estado: EstadoPago; monto: number | null; moneda: string | null; idTransaccion: string | null } | null>;
  probarConexion(llaves: Llaves, modo: Modo): Promise<{ ok: boolean; mensaje: string }>;
  verificarWebhook(e: EntradaWebhook): boolean;
  mapearEvento(payload: unknown, e: EntradaWebhook): Promise<EventoMapeado | null>;
}

/** Error con mensaje apto para mostrar al admin: nunca incluye llaves ni cuerpos de respuesta. */
export class ErrorPasarela extends Error {}

/** Comparación en tiempo constante (hash previo para igualar longitudes). */
export const igualesSeguro = (a: string, b: string) =>
  timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

export const sha256Hex = (t: string) => createHash("sha256").update(t).digest("hex");

const HOSTS = new Set(["sandbox.wompi.co", "production.wompi.co", "api.mercadopago.com", "integrations.api.bold.co"]);

/** Llamada JSON a un host fijo del proveedor, con tiempo de espera y sin seguir redirecciones. */
export async function llamarApi(base: string, ruta: string, o: { metodo?: "GET" | "POST"; cabeceras?: Record<string, string>; cuerpo?: unknown; fetch?: typeof fetch } = {}): Promise<{ estado: number; json: unknown }> {
  const url = new URL(base + ruta);
  if (url.protocol !== "https:" || !HOSTS.has(url.hostname)) throw new ErrorPasarela("Destino no permitido");
  try {
    const r = await (o.fetch ?? fetch)(url, {
      method: o.metodo ?? "GET",
      headers: { Accept: "application/json", ...(o.cuerpo ? { "Content-Type": "application/json" } : {}), ...o.cabeceras },
      body: o.cuerpo ? JSON.stringify(o.cuerpo) : undefined,
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
    return { estado: r.status, json: await r.json().catch(() => null) };
  } catch (e) {
    throw new ErrorPasarela(e instanceof Error && e.name === "TimeoutError" ? "La pasarela no respondió a tiempo" : "No se pudo conectar con la pasarela");
  }
}

export const aObjeto = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
export const aTexto = (v: unknown): string | null => (typeof v === "string" && v ? v : typeof v === "number" ? String(v) : null);

/** Peso entero desde un valor numérico o de texto; null si no es un entero exacto. */
export function aPesos(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && Number.isInteger(n) ? n : null;
}

/** Simulación (solo desarrollo): sustituye las llamadas salientes en modo SANDBOX; las firmas siguen verificándose de verdad. */
// Defensa extra: el simulador solo existe si la app corre en localhost, aunque alguien deje PAGOS_SIMULADO=1 en un servidor real.
const esLocal = () => /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(process.env.BETTER_AUTH_URL ?? "");
export const simulacionActiva = (modo: Modo) => process.env.PAGOS_SIMULADO === "1" && modo === "SANDBOX" && esLocal();

/** Últimos 4 caracteres para mostrar en la UI (nunca el valor completo). */
export const ultimos4 = (v: string | undefined) => (v ? `••••${v.slice(-4)}` : "—");
