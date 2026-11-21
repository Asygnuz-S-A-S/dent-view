// Envoltorio común de las rutas /api/v1: autenticación, permiso, límite de peticiones, errores uniformes,
// lectura/validación del cuerpo e idempotencia de los POST.
import { prisma } from "@dent-view/db";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { autenticarApi, ErrorApi, type ContextoApi } from "./api-auth";
import { claveValida, decidirIdempotencia, huellaPeticion, VIDA_CLAVE_MS } from "./api-idempotencia";
import { limitarToken, type ResultadoLimite } from "./api-limite";
import { decodificarCursor, limiteValido, type Cursor } from "./api-paginacion";
import type { Permiso } from "./api-token";

export type RespuestaApi = { status: number; body: unknown; cabeceras?: Record<string, string> };
export const MAX_CUERPO = 100_000;

export type CtxRuta<P> = ContextoApi & {
  req: Request;
  url: URL;
  params: P;
  /** Lee y valida el JSON del cuerpo (zod) y aplica `Idempotency-Key` si viene. */
  escribir: <S extends z.ZodType>(esquema: S, fn: (datos: z.output<S>) => Promise<RespuestaApi>) => Promise<RespuestaApi>;
};

const cuerpoError = (codigo: string, mensaje: string, detalles?: unknown) => ({ error: { codigo, mensaje, ...(detalles ? { detalles } : {}) } });

function aRespuesta(r: RespuestaApi, limite: ResultadoLimite | null) {
  const res = NextResponse.json(r.body, { status: r.status, headers: { "Cache-Control": "private, no-store", ...r.cabeceras } });
  if (limite) {
    res.headers.set("RateLimit-Limit", String(limite.limite));
    res.headers.set("RateLimit-Remaining", String(limite.restantes));
    res.headers.set("RateLimit-Reset", String(limite.restablecerEnSeg));
  }
  return res;
}

function deError(e: unknown): RespuestaApi {
  if (e instanceof ErrorApi) return { status: e.status, body: cuerpoError(e.codigo, e.message, e.detalles), cabeceras: e.cabeceras };
  console.error("[api/v1]", e); // el detalle queda en el log; el cliente solo ve un mensaje genérico
  return { status: 500, body: cuerpoError("error_interno", "Error interno del servidor.") };
}

export const noEncontrado = (que: string): never => {
  throw new ErrorApi(404, "no_encontrado", `No se encontró: ${que.toLowerCase()} en este centro.`);
};

export function rutaApi<P = Record<string, never>>(permiso: Permiso, fn: (c: CtxRuta<P>) => Promise<RespuestaApi | Response>) {
  return async (req: Request, seg?: { params: Promise<P> }): Promise<Response> => {
    let limite: ResultadoLimite | null = null;
    try {
      const auth = await autenticarApi(req, permiso);
      limite = limitarToken(auth.token.id);
      if (!limite.permitido) throw new ErrorApi(429, "demasiadas_peticiones", "Demasiadas peticiones; reintenta más tarde.", { "Retry-After": String(limite.restablecerEnSeg) });
      const url = new URL(req.url);
      const escribir: CtxRuta<P>["escribir"] = (esquema, hacer) => escribirIdempotente(req, url, auth, esquema, hacer);
      const r = await fn({ ...auth, req, url, params: (await seg?.params) as P, escribir });
      if (r instanceof Response) {
        r.headers.set("RateLimit-Limit", String(limite.limite));
        r.headers.set("RateLimit-Remaining", String(limite.restantes));
        r.headers.set("RateLimit-Reset", String(limite.restablecerEnSeg));
        return r;
      }
      return aRespuesta(r, limite);
    } catch (e) {
      return aRespuesta(deError(e), limite);
    }
  };
}

async function escribirIdempotente<S extends z.ZodType>(
  req: Request, url: URL, auth: ContextoApi, esquema: S, fn: (d: z.output<S>) => Promise<RespuestaApi>,
): Promise<RespuestaApi> {
  const clave = req.headers.get("idempotency-key");
  if (clave !== null && !claveValida(clave)) throw new ErrorApi(400, "clave_idempotencia_invalida", "Idempotency-Key debe tener entre 1 y 80 caracteres imprimibles.");
  const texto = await req.text();
  if (texto.length > MAX_CUERPO) throw new ErrorApi(413, "cuerpo_muy_grande", "El cuerpo supera el tamaño máximo.");
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new ErrorApi(400, "json_invalido", "El cuerpo no es JSON válido.");
  }
  const r = esquema.safeParse(json);
  if (!r.success) {
    throw new ErrorApi(422, "validacion", "Datos inválidos.", undefined, r.error.issues.slice(0, 10).map((i) => ({ campo: i.path.join("."), mensaje: i.message })));
  }
  if (clave === null) return fn(r.data);

  const org = auth.organizationId;
  const huella = huellaPeticion(req.method, url.pathname, json);
  // Borrado perezoso de claves de más de 24 h.
  await prisma.claveIdempotencia.deleteMany({ where: { organizationId: org, creadoEn: { lt: new Date(Date.now() - VIDA_CLAVE_MS) } } });
  const guardado = await prisma.claveIdempotencia.findUnique({ where: { organizationId_clave: { organizationId: org, clave } } });
  const decision = decidirIdempotencia(guardado, huella);
  if (decision === "CONFLICTO") throw new ErrorApi(422, "idempotencia_conflicto", "Esa Idempotency-Key ya se usó con una petición distinta.");
  if (decision === "REPETIR" && guardado) return { status: guardado.estadoHttp, body: guardado.respuesta, cabeceras: { "Idempotent-Replayed": "true" } };

  const res = await fn(r.data);
  // shortcut: sin bloqueo entre "buscar" y "guardar"; dos peticiones simultáneas con la misma clave podrían ejecutarse ambas (la segunda no se guarda). Usar advisory lock si importa.
  if (res.status < 300) {
    await prisma.claveIdempotencia
      .create({ data: { organizationId: org, tokenId: auth.token.id, clave, metodoRuta: huella, estadoHttp: res.status, respuesta: res.body as object } })
      .catch(() => {});
  }
  return res;
}

/** `limite`, `cursor` y `actualizadoDesde` de las listas. 400 si alguno es inválido. */
export function parametrosLista(url: URL): { limite: number; cursor: Cursor | null; desde: Date | null } {
  const limite = limiteValido(url.searchParams.get("limite"));
  if (limite === null) throw new ErrorApi(400, "limite_invalido", "limite debe ser un entero entre 1 y 100.");
  const c = url.searchParams.get("cursor");
  const cursor = c ? decodificarCursor(c) : null;
  if (c && !cursor) throw new ErrorApi(400, "cursor_invalido", "cursor inválido.");
  const d = url.searchParams.get("actualizadoDesde");
  const desde = d ? new Date(d) : null;
  if (desde && Number.isNaN(desde.getTime())) throw new ErrorApi(400, "fecha_invalida", "actualizadoDesde debe ser una fecha ISO 8601.");
  return { limite, cursor, desde };
}

/** Parámetro de consulta opcional validado contra una lista de valores. */
export function enumConsulta<T extends string>(url: URL, nombre: string, valores: readonly T[]): T | undefined {
  const v = url.searchParams.get(nombre);
  if (v === null || v === "") return undefined;
  if (!(valores as readonly string[]).includes(v)) throw new ErrorApi(400, "parametro_invalido", `${nombre} debe ser uno de: ${valores.join(", ")}.`);
  return v as T;
}

export const textoConsulta = (url: URL, nombre: string, max = 100) => {
  const v = url.searchParams.get(nombre)?.trim();
  if (!v) return undefined;
  if (v.length > max) throw new ErrorApi(400, "parametro_invalido", `${nombre} es demasiado largo.`);
  return v;
};
