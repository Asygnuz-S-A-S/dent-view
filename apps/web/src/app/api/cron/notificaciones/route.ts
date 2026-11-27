// Implementación independiente (sala limpia) a partir de docs/sala-limpia/04-notificaciones.md
import { cronAutorizado } from "@/lib/cron";
import { despachar } from "@/lib/notificar";
import { generarRecordatoriosCita } from "@/lib/recordatorios";
import { generarRecordatoriosValoracion } from "@/lib/valoraciones-servidor";

export const dynamic = "force-dynamic";

// Proceso programado (cron externo cada pocos minutos): genera recordatorios y despacha la cola. Requiere CRON_SECRET.
export async function POST(req: Request) {
  if (!cronAutorizado(req)) return new Response(null, { status: 401 });
  const recordatorios = await generarRecordatoriosCita();
  const valoraciones = await generarRecordatoriosValoracion();
  return Response.json({ recordatorios, valoraciones, ...(await despachar()) });
}
