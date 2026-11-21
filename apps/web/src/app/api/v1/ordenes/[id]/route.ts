import { prisma } from "@dent-view/db";
import { noEncontrado, rutaApi } from "@/lib/api-ruta";
import { ordenJson } from "@/lib/api-serializar";

export const GET = rutaApi<{ id: string }>("ordenes:leer", async (c) => {
  const o = await prisma.orden.findFirst({ where: { id: c.params.id, organizationId: c.organizationId }, include: { items: true } });
  if (!o) return noEncontrado("Orden");
  return { status: 200, body: { orden: ordenJson(o) } };
});
