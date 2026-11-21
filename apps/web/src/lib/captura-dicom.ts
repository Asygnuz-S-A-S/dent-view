// Capturas de estudios DICOM generadas en el servidor con Orthanc (que no tiene puertos publicados; se usa ORTHANC_URL).
import sharp from "sharp";
import { instanciaCentral } from "./imagenes";

export type SerieDicom = { serieUid: string; descripcion: string | null; modalidad: string | null; instancias: number };
type SerieOrthanc = { ID: string; MainDicomTags?: { SeriesInstanceUID?: string; SeriesDescription?: string; Modality?: string }; Instances?: string[] };

const base = () => process.env.ORTHANC_URL;
async function orthanc(ruta: string, accept = "application/json") {
  const url = base();
  if (!url) throw new Error("ORTHANC_URL no configurado");
  const r = await fetch(`${url}${ruta}`, { headers: { Accept: accept }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`Orthanc ${r.status}`);
  return r;
}

const seriesOrthanc = async (orthancId: string) => (await (await orthanc(`/studies/${encodeURIComponent(orthancId)}/series`)).json()) as SerieOrthanc[];

/** Series del estudio con su descripción; [] si Orthanc no responde (el selector sigue funcionando con las imágenes subidas). */
export async function seriesDeEstudio(orthancId: string): Promise<SerieDicom[]> {
  try {
    return (await seriesOrthanc(orthancId)).flatMap((s) =>
      s.MainDicomTags?.SeriesInstanceUID ? [{ serieUid: s.MainDicomTags.SeriesInstanceUID, descripcion: s.MainDicomTags.SeriesDescription ?? null, modalidad: s.MainDicomTags.Modality ?? null, instancias: s.Instances?.length ?? 0 }] : [],
    );
  } catch {
    return [];
  }
}

/**
 * JPEG de la instancia central de la serie (sin serie: la más grande del estudio). Para CBCT es el corte axial del medio.
 * shortcut: no reconstruye panorámica ni MPR; se actualizaría con un render propio si hace falta. Devuelve null si no hay imagen.
 */
export async function capturaDeSerie(orthancId: string, serieUid?: string | null): Promise<Buffer | null> {
  try {
    const series = await seriesOrthanc(orthancId);
    const serie = serieUid
      ? series.find((s) => s.MainDicomTags?.SeriesInstanceUID === serieUid)
      : [...series].sort((a, b) => (b.Instances?.length ?? 0) - (a.Instances?.length ?? 0))[0];
    if (!serie) return null;
    const inst = instanciaCentral((await (await orthanc(`/series/${serie.ID}/instances`)).json()) as { ID: string; IndexInSeries?: number }[]);
    if (!inst) return null;
    const img = Buffer.from(await (await orthanc(`/instances/${inst.ID}/rendered?width=1600`, "image/png")).arrayBuffer());
    return await sharp(img).flatten({ background: "#000000" }).resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  } catch {
    return null;
  }
}
