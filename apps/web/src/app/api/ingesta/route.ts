import { prisma } from "@dent-view/db";
import {
  CONTENT_TYPE, CuerpoDemasiadoGrande, decidirEstudio, etiquetaCentro, inspeccionarCuerpo, MAX_BYTES_DEFECTO, tipoDeclarado,
} from "@/lib/ingesta";
import { autenticarEstacion } from "@/lib/ingesta-estacion";

export const dynamic = "force-dynamic";

type InstanciaOrthanc = { ID: string; ParentStudy: string; Status: string };

const orthanc = (path: string, init?: RequestInit) => fetch(`${process.env.ORTHANC_URL}${path}`, init);

/**
 * Recibe un DICOM o un ZIP de una estación, lo reenvía a Orthanc en streaming y etiqueta cada estudio con el centro de la
 * estación (el worker asigna el centro a partir de esa etiqueta).
 */
export async function POST(req: Request) {
  const r = await autenticarEstacion(req);
  if (r.error) return r.error;
  const { estacion } = r;

  const declarado = tipoDeclarado(req.headers.get("content-type"));
  if (!declarado || !req.body) return Response.json({ error: "Envía application/dicom o application/zip" }, { status: 415 });
  const max = Number(process.env.INGESTA_MAX_BYTES) || MAX_BYTES_DEFECTO;
  if (Number(req.headers.get("content-length")) > max) return Response.json({ error: "Archivo demasiado grande" }, { status: 413 });

  const { tipo, flujo } = await inspeccionarCuerpo(req.body, max);
  if (tipo !== declarado) {
    await flujo.cancel();
    return Response.json({ error: "El contenido no es un DICOM ni un ZIP válido" }, { status: 415 });
  }

  let instancias: InstanciaOrthanc[];
  try {
    const res = await orthanc("/instances", {
      method: "POST",
      body: flujo,
      headers: { "Content-Type": CONTENT_TYPE[tipo] },
      duplex: "half",
    } as RequestInit);
    if (res.status === 400) return Response.json({ error: "Orthanc rechazó el archivo" }, { status: 422 });
    if (!res.ok) return Response.json({ error: "Orthanc no disponible" }, { status: 502 });
    const json = (await res.json()) as InstanciaOrthanc | InstanciaOrthanc[];
    instancias = Array.isArray(json) ? json : [json];
  } catch (e) {
    if (e instanceof CuerpoDemasiadoGrande || (e as Error).cause instanceof CuerpoDemasiadoGrande) {
      return Response.json({ error: "Archivo demasiado grande" }, { status: 413 });
    }
    console.error("ingesta: error enviando a Orthanc", e);
    return Response.json({ error: "Orthanc no disponible" }, { status: 502 });
  }

  const estudios = [];
  for (const studyId of new Set(instancias.map((i) => i.ParentStudy))) {
    const est = await orthanc(`/studies/${studyId}`).then((x) => x.json() as Promise<{ Labels?: string[]; MainDicomTags: { StudyInstanceUID: string } }>);
    const studyInstanceUid = est.MainDicomTags.StudyInstanceUID;
    const enBd = await prisma.estudio.findUnique({ where: { studyInstanceUid }, select: { organizationId: true } });
    const deEsteEstudio = instancias.filter((i) => i.ParentStudy === studyId);
    const decision = decidirEstudio({ etiquetas: est.Labels, organizationIdBd: enBd?.organizationId ?? null, organizationId: estacion.organizationId });
    if (decision === "conflicto") {
      // StudyInstanceUID de otro centro: se retiran solo las instancias que esta subida agregó; nunca las existentes.
      for (const i of deEsteEstudio.filter((i) => i.Status === "Success")) await orthanc(`/instances/${i.ID}`, { method: "DELETE" });
      console.warn(`ingesta: estación ${estacion.id} envió instancias de un estudio de otro centro (${studyInstanceUid})`);
      estudios.push({ studyInstanceUid, instancias: deEsteEstudio.length, estado: "rechazado" as const });
      continue;
    }
    const lbl = await orthanc(`/studies/${studyId}/labels/${etiquetaCentro(estacion.organizationId)}`, { method: "PUT" });
    if (!lbl.ok) return Response.json({ error: "No se pudo etiquetar el estudio" }, { status: 502 });
    estudios.push({ studyInstanceUid, instancias: deEsteEstudio.length, estado: "recibido" as const });
  }

  await prisma.evento.create({
    data: { organizationId: estacion.organizationId, tipo: "ingesta.recibida", detalle: { estacionId: estacion.id, tipo, estudios } },
  });
  const rechazado = estudios.length > 0 && estudios.every((e) => e.estado === "rechazado");
  return Response.json({ estudios }, { status: rechazado ? 409 : 200 });
}
