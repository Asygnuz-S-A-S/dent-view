import { prisma } from "@dent-view/db";
import { noEncontrado, rutaApi } from "@/lib/api-ruta";
import { nombreArchivoInforme } from "@/lib/informes";
import { registrarEvento } from "@/lib/eventos";

export const GET = rutaApi<{ id: string }>("informes:leer", async (c) => {
  const inf = await prisma.informe.findFirst({ where: { id: c.params.id, organizationId: c.organizationId, estado: "EMITIDO", vigente: true } });
  if (!inf?.pdf) return noEncontrado("Informe");
  const [pac, orden] = await Promise.all([
    prisma.pacienteTenant.findFirst({ where: { id: inf.pacienteId, organizationId: c.organizationId } }),
    inf.ordenId ? prisma.orden.findFirst({ where: { id: inf.ordenId, organizationId: c.organizationId } }) : null,
  ]);
  await registrarEvento({ organizationId: c.organizationId, pacienteId: inf.pacienteId, actorId: null, tipo: "acceso.informe", detalle: { informeId: inf.id, accion: "descarga", origen: "api", token: c.token.prefijo } });
  return new Response(Buffer.from(inf.pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nombreArchivoInforme(orden?.numero ?? null, pac?.nombre ?? "", inf.version)}"`, "Cache-Control": "private, no-store" },
  });
});
