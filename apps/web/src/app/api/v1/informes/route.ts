import { prisma } from "@dent-view/db";
import { listarApi } from "@/lib/api-lista";
import { rutaApi, textoConsulta } from "@/lib/api-ruta";
import { informeJson } from "@/lib/api-serializar";

// Solo informes EMITIDOS y vigentes: los borradores y versiones archivadas no salen por la API.
export const GET = rutaApi("informes:leer", async (c) => {
  const pacienteId = textoConsulta(c.url, "pacienteId", 40);
  const ordenId = textoConsulta(c.url, "ordenId", 40);
  return listarApi(c.url, {
    filtros: { organizationId: c.organizationId, estado: "EMITIDO", vigente: true, ...(pacienteId && { pacienteId }), ...(ordenId && { ordenId }) },
    campoActualizado: "actualizadoEn",
    consulta: (a) => prisma.informe.findMany({ ...a, omit: { pdf: true } }),
    fecha: (i) => i.creadoEn,
    mapear: informeJson,
  });
});
