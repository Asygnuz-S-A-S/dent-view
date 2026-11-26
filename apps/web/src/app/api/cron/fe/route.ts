import { cronAutorizado } from "@/lib/cron";
import { procesarPendientes } from "@/lib/fe/servicio";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Proceso programado (lo llama el planificador del worker cada 5 min): reintenta y concilia los documentos electrónicos pendientes. Requiere CRON_SECRET.
export async function POST(req: Request) {
  if (!cronAutorizado(req)) return new Response(null, { status: 401 });
  return Response.json(await procesarPendientes());
}
