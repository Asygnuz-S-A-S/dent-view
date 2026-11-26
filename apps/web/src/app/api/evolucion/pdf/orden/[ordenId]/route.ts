import { prisma } from "@dent-view/db";
import { responderPdfHistoria } from "@/lib/evolucion-exportar";
import { contextoActivo } from "@/lib/sesion";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ ordenId: string }> }) {
  const ctx = await contextoActivo();
  if (!ctx) return new Response(null, { status: 401 });
  const orden = await prisma.orden.findFirst({ where: { id: (await params).ordenId, organizationId: ctx.organizationId }, select: { id: true, pacienteId: true } });
  if (!orden) return new Response("No encontrado", { status: 404 });
  return responderPdfHistoria(orden.pacienteId, orden.id);
}
