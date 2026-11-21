import { autenticarEstacion } from "@/lib/ingesta-estacion";

export const dynamic = "force-dynamic";

// El agente local verifica su token y reporta que sigue en línea.
export async function GET(req: Request) {
  const r = await autenticarEstacion(req);
  if (r.error) return r.error;
  return Response.json({ ok: true, estacion: r.estacion.nombre });
}
