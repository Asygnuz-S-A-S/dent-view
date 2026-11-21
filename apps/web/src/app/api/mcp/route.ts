// Servidor MCP (Model Context Protocol), transporte Streamable HTTP sin estado. Ver docs/integraciones/mcp.md.
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { autenticarMcp } from "@/lib/mcp/autenticacion";
import { crearServidorMcp } from "@/lib/mcp/servidor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const json = (estado: number, cuerpo: object, extra: HeadersInit = {}) =>
  Response.json(cuerpo, { status: estado, headers: { "Cache-Control": "no-store", ...extra } });

export async function POST(req: Request) {
  const auth = await autenticarMcp(req.headers.get("authorization"));
  if (!auth.ok) {
    return auth.estado === 429
      ? json(429, { error: "Demasiadas peticiones" }, { "Retry-After": "60" })
      : json(401, { error: "No autorizado" }, { "WWW-Authenticate": "Bearer" });
  }
  const transporte = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 64 * 1024 });
  const servidor = crearServidorMcp(auth.ctx);
  try {
    await servidor.connect(transporte);
    return await transporte.handleRequest(req);
  } catch {
    return json(500, { jsonrpc: "2.0", error: { code: -32603, message: "Error interno" }, id: null });
  } finally {
    await servidor.close().catch(() => {});
  }
}

// Sin estado: no hay sesiones ni flujo SSE que abrir o cerrar.
const noPermitido = () => json(405, { error: "Método no permitido" }, { Allow: "POST" });
export const GET = noPermitido;
export const DELETE = noPermitido;
