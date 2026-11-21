import { prisma } from "@dent-view/db";
import { paginar } from "@/lib/api-paginacion";
import { parametrosLista, rutaApi } from "@/lib/api-ruta";
import { salaJson } from "@/lib/api-serializar";

// La sala no tiene fecha de creación: el orden estable es por id y el cursor lleva una fecha fija.
const EPOCA = new Date(0);
export const GET = rutaApi("citas:leer", async (c) => {
  const { limite, cursor } = parametrosLista(c.url);
  const filas = await prisma.sala.findMany({
    where: { organizationId: c.organizationId, ...(cursor && { id: { gt: cursor.id } }) },
    orderBy: { id: "asc" },
    take: limite + 1,
  });
  const { datos, siguiente } = paginar(filas, limite, () => EPOCA);
  return { status: 200, body: { datos: datos.map(salaJson), siguienteCursor: siguiente } };
});
