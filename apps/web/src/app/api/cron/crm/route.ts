import { cronAutorizado } from "@/lib/cron";
import { centrosConCrm, correrCrmCentro } from "@/lib/crm-motor-datos";

export const dynamic = "force-dynamic";

// Proceso programado (lo llama el planificador del worker cada 5 min): mantenimiento de fidelización, disparos y ejecución de pasos por centro.
// Un error en un centro no frena a los demás. Requiere CRON_SECRET.
export async function POST(req: Request) {
  if (!cronAutorizado(req)) return new Response(null, { status: 401 });
  const resultados: Record<string, unknown> = {};
  let errores = 0;
  for (const org of await centrosConCrm()) {
    try { resultados[org] = await correrCrmCentro(org); }
    catch (e) { errores++; resultados[org] = { error: true }; console.error("cron/crm", org, e instanceof Error ? e.message : e); }
  }
  return Response.json({ centros: Object.keys(resultados).length, errores, resultados });
}
