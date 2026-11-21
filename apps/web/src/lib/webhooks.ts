// Webhooks de salida: firma, protección SSRF, envío, reintentos y encolado. Lógica sin dependencias de Next:
// la usa también el worker (apps/worker), así que solo imports relativos con extensión y sintaxis borrable.
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { armarPayload, type EventoPublico } from "./webhooks-eventos.ts";

export const MAX_INTENTOS = 8;
export const TOPE_ESPERA_MIN = 60;
export const TOLERANCIA_FIRMA_SEG = 300;
export const TIMEOUT_MS = 10_000;
export const MAX_RESPUESTA = 64 * 1024;
export const PUERTOS_PERMITIDOS = [443, 8443, 8080];

/** WEBHOOKS_PERMITIR_LOCAL=1 habilita http y destinos loopback (solo pruebas locales); nunca redes privadas ni metadato. */
export const permitirLocalDesdeEnv = () => process.env.WEBHOOKS_PERMITIR_LOCAL === "1";

// ---- Firma ----
export const generarSecreto = () => `whsec_${randomBytes(32).toString("base64url")}`;

const hmac = (secreto: string, t: number, cuerpo: string) => createHmac("sha256", secreto).update(`${t}.${cuerpo}`).digest("hex");

/** `t=<unix>,v1=<HMAC-SHA256 hex de "<t>.<cuerpo>">` */
export const firmar = (secreto: string, cuerpo: string, t: number) => `t=${t},v1=${hmac(secreto, t, cuerpo)}`;

/** Verifica la cabecera X-DentView-Signature con tolerancia contra repetición (misma lógica que el ejemplo de la UI). */
export function verificarFirma(secreto: string, cuerpo: string, cabecera: string, ahoraSeg = Math.floor(Date.now() / 1000), tolerancia = TOLERANCIA_FIRMA_SEG) {
  const partes = Object.fromEntries(cabecera.split(",").map((p) => p.trim().split("=") as [string, string]));
  const t = Number(partes.t);
  if (!Number.isInteger(t) || !partes.v1 || Math.abs(ahoraSeg - t) > tolerancia) return false;
  const esperado = Buffer.from(hmac(secreto, t, cuerpo));
  const recibido = Buffer.from(partes.v1);
  return esperado.length === recibido.length && timingSafeEqual(esperado, recibido);
}

export const cabecerasEntrega = (p: { evento: string; entregaId: string; secreto: string; cuerpo: string; ahoraSeg: number }) => ({
  "Content-Type": "application/json",
  "User-Agent": "DentView-Webhooks/1",
  "X-DentView-Event": p.evento,
  "X-DentView-Delivery": p.entregaId,
  "X-DentView-Signature": firmar(p.secreto, p.cuerpo, p.ahoraSeg),
});

// ---- SSRF: IPs ----
const v4 = (ip: string) => ip.split(".").map(Number) as [number, number, number, number];

function v4Permitida([a, b, c]: [number, number, number, number]) {
  if (a === 0 || a === 10 || a === 127) return false; // "esta red", privada, loopback
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 169 && b === 254) return false; // link-local y metadato de nube
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // protocolo IETF, documentación
  if (a === 192 && b === 88 && c === 99) return false; // 6to4 relay
  if (a === 198 && (b === 18 || b === 19)) return false; // pruebas de red
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return a < 224; // multicast, reservado y broadcast
}

/** Expande una IPv6 (con "::" y/o cuarteto IPv4 final) a 8 grupos de 16 bits; null si es inválida o trae zona (%). */
function grupos6(ip: string): number[] | null {
  if (ip.includes("%")) return null;
  let s = ip.toLowerCase();
  const punto = s.lastIndexOf(".");
  if (punto !== -1) {
    const i = s.lastIndexOf(":");
    const q = s.slice(i + 1);
    if (isIP(q) !== 4) return null;
    const [a, b, c, d] = v4(q);
    s = `${s.slice(0, i + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const dobles = s.split("::");
  if (dobles.length > 2) return null;
  const cabeza = dobles[0] ? dobles[0].split(":") : [];
  const cola = dobles.length === 2 && dobles[1] ? dobles[1].split(":") : [];
  const faltan = 8 - cabeza.length - cola.length;
  if (dobles.length === 2 ? faltan < 1 : faltan !== 0) return null;
  const todos = [...cabeza, ...Array(dobles.length === 2 ? faltan : 0).fill("0"), ...cola];
  const n = todos.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return n.length === 8 && n.every((x) => !Number.isNaN(x)) ? n : null;
}

const v4DeGrupos = (hi: number, lo: number): [number, number, number, number] => [hi >> 8, hi & 255, lo >> 8, lo & 255];

/**
 * ¿Se puede conectar a esta IP? Rechaza loopback, privadas, link-local (incluido 169.254.169.254), CGNAT, multicast,
 * reservadas, ::1, fc00::/7, fe80::/10 e IPv4 mapeada/embebida en IPv6. Con `permitirLoopback` acepta 127/8 y ::1.
 */
export function ipPermitida(ip: string, opts: { permitirLoopback?: boolean } = {}): boolean {
  const tipo = isIP(ip);
  if (tipo === 4) {
    const p = v4(ip);
    return (opts.permitirLoopback && p[0] === 127) || v4Permitida(p);
  }
  if (tipo !== 6) return false;
  const g = grupos6(ip);
  if (!g) return false;
  if (g.every((x, i) => x === (i === 7 ? 1 : 0))) return !!opts.permitirLoopback; // ::1
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return ipPermitida(v4DeGrupos(g[6]!, g[7]!).join("."), opts); // ::ffff:a.b.c.d
  if (g[0]! >> 13 !== 1) return false; // solo unicast global 2000::/3 (descarta ::, ::/96, fc00::/7, fe80::/10, fec0::/10, ff00::/8, 64:ff9b::/96…)
  if (g[0] === 0x2001 && (g[1] === 0x0db8 || g[1] === 0)) return false; // documentación, Teredo
  if (g[0] === 0x2002) return v4Permitida(v4DeGrupos(g[1]!, g[2]!)); // 6to4 embebe una IPv4
  return true;
}

// ---- SSRF: URL ----
export function validarUrlWebhook(texto: string, permitirLocal = permitirLocalDesdeEnv()): { ok: true; url: URL } | { ok: false; error: string } {
  let url: URL;
  try { url = new URL(texto.trim()); } catch { return { ok: false, error: "La URL no es válida" }; }
  if (url.protocol !== "https:" && !(permitirLocal && url.protocol === "http:")) return { ok: false, error: "La URL debe empezar con https://" };
  if (url.username || url.password) return { ok: false, error: "La URL no puede incluir usuario ni contraseña" };
  const puerto = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (!permitirLocal && !PUERTOS_PERMITIDOS.includes(puerto)) return { ok: false, error: "Puerto no permitido: usa 443, 8443 u 8080" };
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !ipPermitida(host, { permitirLoopback: permitirLocal })) return { ok: false, error: "La dirección IP no está permitida" };
  if (!isIP(host) && !host.includes(".") && !(permitirLocal && host === "localhost")) return { ok: false, error: "Usa un nombre de dominio completo" };
  return { ok: true, url };
}

export class ErrorEnvio extends Error {}

type Resolver = (host: string) => Promise<{ address: string; family: number }[]>;
const resolverDns: Resolver = (host) => dnsLookup(host, { all: true, verbatim: true });

/** Resuelve el host y exige que TODAS las direcciones sean permitidas; devuelve la IP ya validada a la que conectar. */
export async function resolverDestino(host: string, permitirLocal: boolean, resolver: Resolver = resolverDns) {
  const h = host.replace(/^\[|\]$/g, "");
  const direcciones = isIP(h) ? [{ address: h, family: isIP(h) }] : await resolver(h);
  if (!direcciones.length) throw new ErrorEnvio("El dominio no resuelve a ninguna dirección");
  if (!direcciones.every((d) => ipPermitida(d.address, { permitirLoopback: permitirLocal }))) throw new ErrorEnvio("Destino bloqueado: resuelve a una dirección no permitida");
  return direcciones[0]!;
}

export function resumirError(e: unknown) {
  const m = e instanceof ErrorEnvio ? e.message : e instanceof Error ? ((e as { code?: string }).code ?? e.name) + (e.message ? `: ${e.message}` : "") : "Error desconocido";
  return m.replace(/whsec_[A-Za-z0-9_-]+/g, "[oculto]").slice(0, 300);
}

/** POST firmado. Conecta a la IP validada (sin segunda resolución: evita DNS rebinding), sin redirecciones, 10 s, respuesta ≤ 64 KB. */
export async function enviarWebhook(p: {
  url: string; cuerpo: string; cabeceras: Record<string, string>; permitirLocal?: boolean; resolver?: Resolver; timeoutMs?: number;
}): Promise<{ codigo: number; respuesta: string }> {
  const permitirLocal = p.permitirLocal ?? permitirLocalDesdeEnv();
  const v = validarUrlWebhook(p.url, permitirLocal);
  if (!v.ok) throw new ErrorEnvio(v.error);
  const { url } = v;
  const destino = await resolverDestino(url.hostname, permitirLocal, p.resolver);
  const esHttps = url.protocol === "https:";
  return new Promise((resolve, reject) => {
    const req = (esHttps ? https : http).request({
      host: destino.address, family: destino.family, port: url.port || (esHttps ? 443 : 80), path: `${url.pathname}${url.search}`, method: "POST",
      headers: { ...p.cabeceras, Host: url.host, "Content-Length": Buffer.byteLength(p.cuerpo) },
      servername: esHttps && !isIP(url.hostname.replace(/^\[|\]$/g, "")) ? url.hostname : undefined, // SNI y verificación del certificado por nombre
      agent: false,
    }, (res) => {
      const trozos: Buffer[] = [];
      let total = 0;
      const fin = () => { clearTimeout(timer); resolve({ codigo: res.statusCode ?? 0, respuesta: Buffer.concat(trozos).toString("utf8", 0, MAX_RESPUESTA) }); };
      res.on("data", (c: Buffer) => {
        total += c.length;
        trozos.push(c);
        if (total >= MAX_RESPUESTA) { res.destroy(); fin(); }
      });
      res.on("end", fin);
      res.on("error", fin);
    });
    const timer = setTimeout(() => req.destroy(new ErrorEnvio("Tiempo de espera agotado (10 s)")), p.timeoutMs ?? TIMEOUT_MS);
    req.on("error", (e) => { clearTimeout(timer); reject(e); });
    req.end(p.cuerpo);
  });
}

export const hace24Horas = () => new Date(Date.now() - 24 * 3600_000);

// ---- Reintentos ----
/** Minutos de espera tras el intento n (1 → 1, 2 → 2, 3 → 4, 4 → 8…), con tope de 1 h. */
export const esperaMinutos = (intentos: number) => Math.min(2 ** (Math.max(intentos, 1) - 1), TOPE_ESPERA_MIN);

/** Decide el estado tras un intento. `intentos` ya cuenta el recién hecho. 2xx = ENTREGADO. */
export function decidirTrasIntento(p: { intentos: number; codigo: number | null; ahora: Date }):
  { estado: "ENTREGADO" } | { estado: "PENDIENTE"; proximoIntento: Date } | { estado: "FALLIDO" } {
  if (p.codigo !== null && p.codigo >= 200 && p.codigo < 300) return { estado: "ENTREGADO" };
  if (p.intentos >= MAX_INTENTOS) return { estado: "FALLIDO" };
  return { estado: "PENDIENTE", proximoIntento: new Date(p.ahora.getTime() + esperaMinutos(p.intentos) * 60_000) };
}

// ---- Reparto justo y desactivación automática ----
export const MAX_POR_WEBHOOK = 2; // entregas de un mismo webhook por ciclo
export const MAX_POR_CENTRO = 10; // entregas de un mismo centro por ciclo
export const CONCURRENCIA = 5;
export const FALLOS_PARA_DESACTIVAR = 20;

/** De las vencidas (ya ordenadas por antigüedad) toma hasta `lote` respetando los máximos por webhook y por centro: un webhook lento no acapara el ciclo. */
export function repartirJusto<T extends { webhookId: string; organizationId: string }>(vencidas: T[], o: { lote: number; porWebhook?: number; porCentro?: number }): T[] {
  const porW = new Map<string, number>();
  const porC = new Map<string, number>();
  const tomadas: T[] = [];
  for (const e of vencidas) {
    if (tomadas.length >= o.lote) break;
    const w = porW.get(e.webhookId) ?? 0;
    const c = porC.get(e.organizationId) ?? 0;
    if (w >= (o.porWebhook ?? MAX_POR_WEBHOOK) || c >= (o.porCentro ?? MAX_POR_CENTRO)) continue;
    porW.set(e.webhookId, w + 1);
    porC.set(e.organizationId, c + 1);
    tomadas.push(e);
  }
  return tomadas;
}

/** `ultimos` = estados finales (ENTREGADO/FALLIDO) más recientes del webhook; se desactiva si los últimos N son todos FALLIDO. */
export const debeDesactivar = (ultimos: string[], umbral = FALLOS_PARA_DESACTIVAR) => ultimos.length >= umbral && ultimos.slice(0, umbral).every((e) => e === "FALLIDO");

/** Ejecuta `fn` sobre cada elemento con a lo sumo `limite` en vuelo a la vez. */
export async function conConcurrencia<T>(items: T[], limite: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, async () => { while (i < items.length) await fn(items[i++]!); }));
}

// ---- Encolado (lo usan registrarEvento y el worker) ----
// Estructural para aceptar el cliente de Prisma, una transacción o un doble de prueba.
type Db = {
  webhook: { findMany(a: any): Promise<any[]> };
  webhookEntrega: { createMany(a: any): Promise<unknown> };
  organization: { findUnique(a: any): Promise<any> };
  pacienteTenant: { findFirst(a: any): Promise<any> };
};

/** Inserta una entrega PENDIENTE por cada webhook activo del centro suscrito (o con "*"). `soloWebhookId` fuerza uno (prueba). */
export async function encolarWebhooks(db: Db, p: {
  organizationId: string; evento: EventoPublico; datos: Record<string, unknown>; pacienteId?: string | null; soloWebhookId?: string;
}) {
  const hooks = await db.webhook.findMany({
    where: p.soloWebhookId
      ? { id: p.soloWebhookId, organizationId: p.organizationId }
      : { organizationId: p.organizationId, activo: true, OR: [{ eventos: { has: p.evento } }, { eventos: { has: "*" } }] },
    select: { id: true },
  });
  if (!hooks.length) return 0;
  const centro = await db.organization.findUnique({ where: { id: p.organizationId }, select: { id: true, slug: true } });
  if (!centro) return 0;
  const paciente = p.pacienteId
    ? await db.pacienteTenant.findFirst({ where: { id: p.pacienteId, organizationId: p.organizationId }, select: { id: true, persona: { select: { tipoDocumento: true, numeroDocumento: true } } } })
    : null;
  const payload = armarPayload({
    id: randomUUID(), evento: p.evento, creadoEn: new Date(), centro,
    datos: p.datos, paciente: paciente && { id: paciente.id, ...paciente.persona },
  });
  await db.webhookEntrega.createMany({
    data: hooks.map((h) => ({ webhookId: h.id, organizationId: p.organizationId, evento: p.evento, payload })),
  });
  return hooks.length;
}
