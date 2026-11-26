import { prisma } from "@dent-view/db";
import { registrarAcceso } from "@/lib/bitacora";
import { nombreArchivoInforme } from "@/lib/informes";
import { CLINICOS } from "@/lib/roles";
import { contextoActivo, respuestaSinModulo } from "@/lib/sesion";

export const dynamic = "force-dynamic";

const NO_ENCONTRADO = () => new Response("No encontrado", { status: 404 });

// El centro origen descarga el informe emitido que el destino devolvió en su remisión. Cualquier otro caso es 404 (sin distinguir el motivo).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoActivo();
  if (!ctx || ctx.usuario.debeCambiarClave) return new Response(null, { status: 401 });
  if (!(CLINICOS as readonly string[]).includes(ctx.rol) || (await respuestaSinModulo(ctx, "remisiones"))) return NO_ENCONTRADO();
  const { id } = await params;
  const rem = await prisma.remision.findFirst({
    where: { id, origenId: ctx.organizationId, estado: "DEVUELTA", informeId: { not: null } },
    select: { id: true, destinoId: true, informeId: true, pacienteOrigenId: true, nombre: true },
  });
  if (!rem?.informeId) return NO_ENCONTRADO();
  const devuelto = await prisma.informe.findFirst({ where: { id: rem.informeId, organizationId: rem.destinoId }, select: { grupoId: true } });
  if (!devuelto) return NO_ENCONTRADO();
  // Versión vigente emitida del mismo informe (si el destino lo corrigió después de devolverlo).
  const inf = await prisma.informe.findFirst({
    where: { grupoId: devuelto.grupoId, organizationId: rem.destinoId, estado: "EMITIDO", vigente: true },
    orderBy: { version: "desc" },
    select: { version: true, pdf: true },
  });
  if (!inf?.pdf) return NO_ENCONTRADO();
  await registrarAcceso(ctx, rem.pacienteOrigenId, "informe", { remisionId: rem.id });
  const nombre = nombreArchivoInforme(null, rem.nombre, inf.version);
  return new Response(Buffer.from(inf.pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nombre}"`, "Cache-Control": "private, no-store" } });
}
