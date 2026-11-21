import { prisma } from "@dent-view/db";
import { noEncontrado, rutaApi } from "@/lib/api-ruta";
import { estudioJson } from "@/lib/api-serializar";

export const GET = rutaApi<{ id: string }>("estudios:leer", async (c) => {
  const e = await prisma.estudio.findFirst({ where: { id: c.params.id, organizationId: c.organizationId } });
  if (!e) return noEncontrado("Estudio");
  return { status: 200, body: { estudio: estudioJson(e) } };
});
