// Servidor MCP sin estado: se crea uno por petición con las herramientas que permite el token.
import { prisma } from "@dent-view/db";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ContextoMcp } from "./autenticacion";
import { AVISO, herramientasVisibles } from "./herramientas";

const respuesta = (texto: string, esError = false) => ({ content: [{ type: "text" as const, text: texto }], ...(esError ? { isError: true } : {}) });

/** Auditoría: herramienta y prefijo del token; nunca los argumentos (pueden contener datos personales). */
export const registrarLlamada = (ctx: ContextoMcp, herramienta: string) =>
  prisma.evento.create({ data: { organizationId: ctx.organizationId, tipo: "mcp.llamada", detalle: { herramienta, token: ctx.prefijo } } });

export function crearServidorMcp(ctx: ContextoMcp) {
  const servidor = new McpServer(
    { name: "dent-view", version: "1.0.0" },
    { instructions: `Servidor de solo lectura de dent-view. ${AVISO}` },
  );
  for (const h of herramientasVisibles(ctx.permisos)) {
    servidor.registerTool(
      h.nombre,
      { description: h.descripcion, inputSchema: h.esquema, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
      async (args: unknown) => {
        try {
          await registrarLlamada(ctx, h.nombre);
          return respuesta(JSON.stringify({ aviso: AVISO, ...(await h.ejecutar(ctx, args as never)) }));
        } catch (e) {
          // Sin detalles internos hacia el cliente; el detalle queda en el log del servidor.
          console.error("[mcp]", h.nombre, e instanceof Error ? e.message : "error");
          return respuesta("No se pudo completar la consulta.", true);
        }
      },
    );
  }
  return servidor;
}
