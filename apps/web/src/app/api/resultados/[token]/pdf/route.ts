import { prisma } from "@dent-view/db";
import { PREFIJO_ACCESO } from "@/lib/bitacora";
import { hashToken } from "@/lib/entrega";
import { registrarEvento } from "@/lib/eventos";
import { nombreArchivoInforme } from "@/lib/informes";
import { enlaceDeCookie } from "@/lib/resultados";

export const dynamic = "force-dynamic";

// Descarga del PDF para quien entró con enlace + código: la cookie debe corresponder a este token.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const enlace = await enlaceDeCookie();
  if (!enlace || enlace.tokenHash !== hashToken(token) || !enlace.informeId) return new Response(null, { status: 401 });
  const inf = await prisma.informe.findFirst({ where: { id: enlace.informeId, organizationId: enlace.organizationId, estado: "EMITIDO", vigente: true, pacienteId: enlace.pacienteId } });
  if (!inf?.pdf) return new Response("No encontrado", { status: 404 });
  const [pac, orden] = await Promise.all([
    prisma.pacienteTenant.findUnique({ where: { id: inf.pacienteId }, include: { persona: true } }),
    inf.ordenId ? prisma.orden.findUnique({ where: { id: inf.ordenId }, select: { numero: true } }) : null,
  ]);
  await registrarEvento({ organizationId: enlace.organizationId, pacienteId: enlace.pacienteId, tipo: `${PREFIJO_ACCESO}resultados`, detalle: { accion: "descarga", enlaceId: enlace.id } });
  const nombre = nombreArchivoInforme(orden?.numero ?? null, pac?.nombre ?? "", inf.version);
  return new Response(Buffer.from(inf.pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nombre}"`, "Cache-Control": "private, no-store" } });
}
