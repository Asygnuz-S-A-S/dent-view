import { prisma } from "@dent-view/db";
import { listarApi } from "@/lib/api-lista";
import { enumConsulta, rutaApi, textoConsulta } from "@/lib/api-ruta";
import { estudioJson } from "@/lib/api-serializar";

// Solo metadatos y estado: nunca bytes DICOM, ids de Orthanc ni claves de almacenamiento.
export const GET = rutaApi("estudios:leer", async (c) => {
  const estado = enumConsulta(c.url, "estado", ["POR_ASIGNAR", "ASIGNADO", "PUBLICADO"] as const);
  const pacienteId = textoConsulta(c.url, "pacienteId", 40);
  const ordenId = textoConsulta(c.url, "ordenId", 40);
  return listarApi(c.url, {
    filtros: { organizationId: c.organizationId, ...(estado && { estado }), ...(pacienteId && { pacienteId }), ...(ordenId && { ordenId }) },
    campoActualizado: "actualizadoEn",
    consulta: (a) => prisma.estudio.findMany(a),
    fecha: (e) => e.creadoEn,
    mapear: estudioJson,
  });
});
