import { prisma } from "@dent-view/db";
import { DICOM_MAX_BYTES, ESTADOS_ORDEN_CARGA, normalizarPatientId } from "@/lib/estudios-carga";
import { extraerDicomDeZip, ZipInvalido } from "@/lib/estudios-zip";
import { limitarIp } from "@/lib/entrega";
import { registrarEvento } from "@/lib/eventos";
import { sincronizarPlanConOrden } from "@/lib/planes-servidor";
import { mismoOrigen } from "@/lib/imagenes-servidor";
import { CONTENT_TYPE, CuerpoDemasiadoGrande, decidirEstudio, etiquetaCentro, inspeccionarCuerpo, tipoDeclarado } from "@/lib/ingesta";
import { CLINICOS } from "@/lib/roles";
import { contextoActivo } from "@/lib/sesion";
import { encolarWebhooks } from "@/lib/webhooks";

export const dynamic = "force-dynamic";

type Instancia = { ID: string; ParentStudy: string; Status: string };
const porUsuario = new Map<string, number[]>(); // shortcut: en memoria del proceso (ver limitarIp)
const orthanc = (path: string, init?: RequestInit) => fetch(`${process.env.ORTHANC_URL}${path}`, init);
const fechaDicom = (da?: string) => (da && /^\d{8}$/.test(da) ? new Date(`${da.slice(0, 4)}-${da.slice(4, 6)}-${da.slice(6)}T00:00:00Z`) : null);

/**
 * Carga de un DICOM (.dcm) o un ZIP de DICOM desde la web (hasta 1 GB), por streaming hacia Orthanc.
 * ?pacienteId=…&ordenId=… (la orden es opcional). Regla de PatientID: el estudio queda SIEMPRE con el documento del paciente elegido
 * (si el DICOM trae otro PatientID se reescribe en Orthanc conservando los UID) y con la etiqueta del centro de la sesión, así que
 * nunca puede quedar asociado a un paciente de otro centro. El resto de los datos clínicos del DICOM no se modifica.
 */
export async function POST(req: Request) {
  const ctx = await contextoActivo();
  if (!ctx || ctx.usuario.debeCambiarClave) return new Response(null, { status: 401 });
  if (!(CLINICOS as readonly string[]).includes(ctx.rol)) return new Response(null, { status: 403 });
  if (!mismoOrigen(req)) return Response.json({ error: "Origen no permitido" }, { status: 403 });
  if (!limitarIp(porUsuario, ctx.usuario.id, Date.now(), 30, 10 * 60_000)) return Response.json({ error: "Demasiadas subidas. Inténtalo en unos minutos." }, { status: 429 });
  if (Number(req.headers.get("content-length")) > DICOM_MAX_BYTES) return Response.json({ error: "El archivo supera 1 GB" }, { status: 413 });

  const q = new URL(req.url).searchParams;
  const pacienteId = q.get("pacienteId"), ordenId = q.get("ordenId") || null;
  const org = ctx.organizationId;
  // Todo acotado al centro: un id ajeno es indistinguible de uno inexistente.
  const [paciente, orden] = await Promise.all([
    pacienteId ? prisma.pacienteTenant.findFirst({ where: { id: pacienteId, organizationId: org }, select: { id: true, persona: { select: { tipoDocumento: true, numeroDocumento: true } } } }) : null,
    pacienteId && ordenId ? prisma.orden.findFirst({ where: { id: ordenId, organizationId: org, pacienteId, estado: { in: [...ESTADOS_ORDEN_CARGA] } }, select: { id: true, estado: true } }) : null,
  ]);
  if (!paciente || (ordenId && !orden)) return Response.json({ error: "Paciente u orden no encontrado" }, { status: 404 });
  const patientId = normalizarPatientId(paciente.persona.numeroDocumento);
  // El worker vincula por PatientID asumiendo tipo CC: con otro tipo de documento crearía un paciente duplicado.
  if (!patientId || paciente.persona.tipoDocumento !== "CC") return Response.json({ error: "Los estudios DICOM solo se cargan por la web a pacientes con cédula (CC). Usa la estación de ingesta." }, { status: 422 });

  const declarado = tipoDeclarado(req.headers.get("content-type"));
  if (!declarado || !req.body) return Response.json({ error: "Envía application/dicom o application/zip" }, { status: 415 });
  const { tipo, flujo } = await inspeccionarCuerpo(req.body, DICOM_MAX_BYTES);
  if (tipo !== declarado) { await flujo.cancel(); return Response.json({ error: "El contenido no es un DICOM ni un ZIP válido" }, { status: 415 }); }

  const etiqueta = etiquetaCentro(org);
  const nuevas = new Map<string, Instancia>(); // instancias que ESTA subida agregó (para retirarlas si algo falla)
  const etiquetados = new Set<string>();
  const subirInstancia = async (cuerpo: BodyInit, nombre: string) => {
    const res = await orthanc("/instances", { method: "POST", body: cuerpo, headers: { "Content-Type": CONTENT_TYPE.dicom }, duplex: "half" } as RequestInit);
    if (res.status === 400) throw new ZipInvalido(`Orthanc rechazó ${nombre}`);
    if (!res.ok) throw new Error("Orthanc no disponible");
    const i = (await res.json()) as Instancia;
    if (i.Status === "Success") nuevas.set(i.ID, i);
    // Se etiqueta de inmediato: un estudio sin etiqueta podría ser asignado por el worker al centro por defecto.
    if (!etiquetados.has(i.ParentStudy)) {
      // Si el estudio ya es de otro centro (mismo StudyInstanceUID) no se etiqueta: se rechaza antes de tocar sus etiquetas.
      const previo = (await (await orthanc(`/studies/${i.ParentStudy}`)).json()) as { Labels?: string[] };
      if (decidirEstudio({ etiquetas: previo.Labels, organizationIdBd: null, organizationId: org }) === "conflicto") throw new ZipInvalido("Este estudio ya está registrado para otro paciente o centro");
      if (!(await orthanc(`/studies/${i.ParentStudy}/labels/${etiqueta}`, { method: "PUT" })).ok) throw new Error("No se pudo etiquetar el estudio");
      etiquetados.add(i.ParentStudy);
    }
    return i;
  };
  const retirar = () => Promise.all([...nuevas.values()].map((i) => orthanc(`/instances/${i.ID}`, { method: "DELETE" }).catch(() => null)));

  const estudiosOrthanc = new Set<string>();
  try {
    if (tipo === "dicom") estudiosOrthanc.add((await subirInstancia(flujo, "el archivo")).ParentStudy);
    else await extraerDicomDeZip(flujo, async (nombre, datos) => void estudiosOrthanc.add((await subirInstancia(datos as unknown as BodyInit, nombre)).ParentStudy));
  } catch (e) {
    await retirar();
    if (e instanceof CuerpoDemasiadoGrande || (e as Error).cause instanceof CuerpoDemasiadoGrande) return Response.json({ error: "El archivo supera 1 GB" }, { status: 413 });
    if (e instanceof ZipInvalido) return Response.json({ error: e.message }, { status: 422 });
    console.error("cargar estudio: error enviando a Orthanc", e);
    return Response.json({ error: "No se pudo cargar el estudio" }, { status: 502 });
  }

  const resultado: { studyInstanceUid: string; estudioId: string; instancias: number }[] = [];
  try {
    for (const studyId of estudiosOrthanc) {
      const est = (await (await orthanc(`/studies/${studyId}`)).json()) as { Labels?: string[]; MainDicomTags: { StudyInstanceUID: string; StudyDescription?: string; StudyDate?: string }; PatientMainDicomTags?: { PatientID?: string } };
      const uid = est.MainDicomTags.StudyInstanceUID;
      const enBd = await prisma.estudio.findUnique({ where: { studyInstanceUid: uid }, select: { id: true, organizationId: true, pacienteId: true, ordenId: true } });
      // Choque de UID con otro centro (etiquetas o BD) o ya registrado para otro paciente: se retira lo que se subió y no se toca lo existente.
      const choque = decidirEstudio({ etiquetas: est.Labels, organizationIdBd: enBd?.organizationId ?? null, organizationId: org }) === "conflicto"
        || (enBd && enBd.pacienteId && enBd.pacienteId !== paciente.id);
      if (choque) throw new ZipInvalido("Este estudio ya está registrado para otro paciente o centro");

      let id = studyId;
      if ((est.PatientMainDicomTags?.PatientID ?? "").trim() !== patientId) {
        const m = await orthanc(`/studies/${studyId}/modify`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ Replace: { PatientID: patientId }, Keep: ["StudyInstanceUID", "SeriesInstanceUID", "SOPInstanceUID"], Force: true, KeepSource: false }),
        });
        if (!m.ok) throw new Error(`Orthanc no pudo asociar el estudio al paciente (${m.status})`);
        id = ((await m.json()) as { ID: string }).ID;
        if (!(await orthanc(`/studies/${id}/labels/${etiqueta}`, { method: "PUT" })).ok) throw new Error("No se pudo etiquetar el estudio");
      }
      const series = (await (await orthanc(`/studies/${id}/series`)).json()) as { MainDicomTags: { Modality?: string } }[];
      const modalidad = [...new Set(series.map((s) => s.MainDicomTags.Modality).filter(Boolean))].join("/") || null;
      // Se registra ya (el worker solo completa datos técnicos): así la orden elegida se respeta y no se vincula "la más reciente".
      const estudio = enBd
        ? await prisma.estudio.update({ where: { id: enBd.id }, data: { orthancId: id, pacienteId: paciente.id, ...(orden && !enBd.ordenId && { ordenId: orden.id }) } })
        : await prisma.estudio.create({ data: { organizationId: org, pacienteId: paciente.id, ordenId: orden?.id ?? null, studyInstanceUid: uid, orthancId: id, modalidad, descripcion: est.MainDicomTags.StudyDescription ?? null, fechaEstudio: fechaDicom(est.MainDicomTags.StudyDate), estado: "ASIGNADO" } });
      if (orden?.estado === "AGENDADA") {
        const o = orden;
        await prisma.$transaction(async (tx) => {
          const { count } = await tx.orden.updateMany({ where: { id: o.id, estado: "AGENDADA" }, data: { estado: "TOMADA" } });
          if (count === 1) await sincronizarPlanConOrden(tx, { organizationId: org, ordenId: o.id, estadoOrden: "TOMADA" });
        });
      }
      if (!enBd) await encolarWebhooks(prisma, { organizationId: org, evento: "estudio.recibido", pacienteId: paciente.id, datos: { estudioId: estudio.id, modalidad, estado: "ASIGNADO" } }).catch((e) => console.error("No se pudo encolar estudio.recibido", e));
      await registrarEvento({ organizationId: org, pacienteId: paciente.id, actorId: ctx.usuario.id, tipo: "estudio.cargado", detalle: { estudioId: estudio.id, ordenId: orden?.id ?? null, origen: "web", tipo } });
      resultado.push({ studyInstanceUid: uid, estudioId: estudio.id, instancias: [...nuevas.values()].filter((i) => i.ParentStudy === studyId).length });
    }
  } catch (e) {
    await retirar();
    if (e instanceof ZipInvalido) return Response.json({ error: e.message }, { status: 409 });
    console.error("cargar estudio: error registrando", e);
    return Response.json({ error: "No se pudo registrar el estudio" }, { status: 502 });
  }
  return Response.json({ estudios: resultado });
}
