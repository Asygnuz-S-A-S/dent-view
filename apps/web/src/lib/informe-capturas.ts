// Capturas del informe (solo servidor): resuelve cada selección a bytes JPEG para el PDF. Una captura que falla se omite; nunca impide emitir.
import { prisma } from "@dent-view/db";
import { capturaDeSerie } from "./captura-dicom";
import { claveImagenValida, claveVariante } from "./imagenes";
import { bytesS3 } from "./imagenes-servidor";

export async function cargarCapturasPdf(organizationId: string, informeId: string): Promise<{ data: Buffer; leyenda: string | null }[]> {
  const filas = await prisma.informeImagen.findMany({ where: { informeId, organizationId }, orderBy: { orden: "asc" }, include: { imagen: true } });
  const salida = await Promise.all(filas.map(async (f) => {
    let data: Buffer | null = null;
    if (f.origen === "IMAGEN" && f.imagen && f.imagen.organizationId === organizationId && claveImagenValida(f.imagen.claveS3, organizationId, f.imagen.id)) {
      data = await bytesS3(claveVariante(f.imagen.claveS3, "web"));
    } else if (f.origen === "DICOM" && f.estudioUid) {
      const est = await prisma.estudio.findFirst({ where: { studyInstanceUid: f.estudioUid, organizationId }, select: { orthancId: true } });
      data = est ? await capturaDeSerie(est.orthancId, f.serieUid) : null;
    }
    return data ? { data, leyenda: f.leyenda } : null;
  }));
  return salida.filter((c): c is { data: Buffer; leyenda: string | null } => !!c);
}
