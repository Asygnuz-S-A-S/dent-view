import { timingSafeEqual } from "node:crypto";
import { centrosConCrm, correrCrmCentro } from "@/lib/crm-motor-datos";

export const dynamic = "force-dynamic";

/** Comparación en tiempo constante del secreto Bearer (sin filtrar la longitud del secreto por tiempo de respuesta). */
function autorizado(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  const dado = Buffer.from(req.headers.get("authorization") ?? ""), esperado = Buffer.from(`Bearer ${secreto}`);
  return dado.length === esperado.length && timingSafeEqual(dado, esperado);
}

// Proceso programado (lo llama el planificador del worker cada 5 min): mantenimiento de fidelización, disparos y ejecución de pasos por centro.
// Un error en un centro no frena a los demás. Requiere CRON_SECRET.
export async function POST(req: Request) {
  if (!autorizado(req)) return new Response(null, { status: 401 });
  const resultados: Record<string, unknown> = {};
  let errores = 0;
  for (const org of await centrosConCrm()) {
    try { resultados[org] = await correrCrmCentro(org); }
    catch (e) { errores++; resultados[org] = { error: true }; console.error("cron/crm", org, e instanceof Error ? e.message : e); }
  }
  return Response.json({ centros: Object.keys(resultados).length, errores, resultados });
}
