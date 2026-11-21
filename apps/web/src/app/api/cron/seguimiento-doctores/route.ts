import { prisma } from "@dent-view/db";
import { generarSeguimientos } from "@/lib/seguimiento-doctores-datos";

export const dynamic = "force-dynamic";

// Proceso semanal (cron externo): genera las tareas de doctores en riesgo de cada centro radiológico. Requiere CRON_SECRET.
export async function POST(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get("authorization") !== `Bearer ${secreto}`) return new Response(null, { status: 401 });
  const [orgs, otros] = await Promise.all([
    prisma.organization.findMany({ where: { members: { some: { role: "doctor_remitente" } } }, select: { id: true } }),
    // Sin fila de ConfigCentro rige CENTRO_RADIOLOGICO; los demás tipos de centro no usan esta sección.
    prisma.configCentro.findMany({ where: { tipoCentro: { not: "CENTRO_RADIOLOGICO" } }, select: { organizationId: true } }),
  ]);
  const excluidos = new Set(otros.map((c) => c.organizationId));
  let creados = 0, centros = 0;
  for (const o of orgs) {
    if (excluidos.has(o.id)) continue;
    centros++;
    creados += await generarSeguimientos(o.id, null).catch((e) => { console.error("seguimiento-doctores", o.id, e); return 0; });
  }
  return Response.json({ centros, creados });
}
