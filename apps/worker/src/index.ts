import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ordenParaVincular, prisma } from '@dent-view/db';
import { encolarWebhooks } from '../../web/src/lib/webhooks.ts';
import { iniciarEntregaWebhooks } from './webhooks.ts';
import { iniciarSyncIntegraciones } from './sync-integraciones.ts';
import { centroDeEtiquetas, extraerMallaPly, formatearNombre, SOP_RAW_DATA } from './dicom.ts';

const env = (k: string) => process.env[k] ?? (() => { throw new Error(`Falta ${k}`); })();
const ORTHANC = env('ORTHANC_URL');
const BUCKET = env('S3_BUCKET_ESTUDIOS');
const s3 = new S3Client({
  endpoint: env('S3_ENDPOINT'),
  region: 'us-east-1',
  forcePathStyle: true,
  credentials: { accessKeyId: env('S3_ACCESS_KEY'), secretAccessKey: env('S3_SECRET_KEY') },
});

async function orthanc<T>(path: string): Promise<T> {
  const r = await fetch(`${ORTHANC}${path}`);
  if (!r.ok) throw new Error(`Orthanc ${path}: ${r.status}`);
  return r.json() as Promise<T>;
}

// DICOM DA "YYYYMMDD" -> Date
const fecha = (da?: string) => (da && /^\d{8}$/.test(da) ? new Date(`${da.slice(0, 4)}-${da.slice(4, 6)}-${da.slice(6)}T00:00:00Z`) : null);

async function ingerir(orthancId: string) {
  const est = await orthanc<any>(`/studies/${orthancId}`);
  // El centro sale de la etiqueta que puso /api/ingesta; sin etiqueta (carga de muestras), del centro por defecto.
  const centro = centroDeEtiquetas(est.Labels);
  if (centro === 'varios') return console.error(`Estudio ${orthancId} con etiquetas de varios centros: no se ingiere`);
  const org = centro
    ? await prisma.organization.findUnique({ where: { id: centro } })
    : await prisma.organization.findUnique({ where: { slug: env('INGESTA_TENANT_SLUG') } });
  if (!org) throw new Error(`No existe la organización ${centro ?? env('INGESTA_TENANT_SLUG')}`);

  const studyInstanceUid: string = est.MainDicomTags.StudyInstanceUID;
  const series = await orthanc<any[]>(`/studies/${orthancId}/series`);
  const modalidad = [...new Set(series.map((s) => s.MainDicomTags.Modality).filter(Boolean))].join('/') || null;

  let pacienteId: string | null = null;
  const cedula: string | undefined = est.PatientMainDicomTags?.PatientID?.trim();
  if (cedula) {
    const persona = await prisma.persona.upsert({
      where: { tipoDocumento_numeroDocumento: { tipoDocumento: 'CC', numeroDocumento: cedula } },
      update: {},
      create: { tipoDocumento: 'CC', numeroDocumento: cedula },
    });
    const pt = await prisma.pacienteTenant.upsert({
      where: { organizationId_personaId: { organizationId: org.id, personaId: persona.id } },
      update: {},
      create: { organizationId: org.id, personaId: persona.id, nombre: formatearNombre(est.PatientMainDicomTags.PatientName ?? '') || cedula },
    });
    pacienteId = pt.id;
  }

  // Malla facial Carestream: primera instancia Raw Data (OSS) de la que se pueda extraer el PLY.
  let superficieKey: string | undefined;
  const instancias = await orthanc<any[]>(`/studies/${orthancId}/instances?expand&requestedTags=SOPClassUID`);
  for (const i of instancias.filter((i) => i.RequestedTags?.SOPClassUID === SOP_RAW_DATA)) {
    const r = await fetch(`${ORTHANC}/instances/${i.ID}/file`);
    const ply = extraerMallaPly(new Uint8Array(await r.arrayBuffer()));
    if (!ply) continue;
    superficieKey = `tenants/${org.id}/superficies/${studyInstanceUid}.ply`;
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: superficieKey, Body: ply, ContentType: 'text/plain' }));
    break;
  }

  const datos = {
    orthancId,
    modalidad,
    descripcion: est.MainDicomTags.StudyDescription ?? null,
    fechaEstudio: fecha(est.MainDicomTags.StudyDate),
    ...(superficieKey && { superficieKey }),
  };
  // N4: al reingerir solo se actualizan datos técnicos; el paciente se asigna solo si el estudio sigue POR_ASIGNAR,
  // así una reasignación o publicación manual no se deshace en cada reinicio del worker.
  const existia = !!(await prisma.estudio.findUnique({ where: { studyInstanceUid }, select: { id: true } }));
  let estudio = await prisma.estudio.upsert({
    where: { studyInstanceUid },
    update: datos,
    create: { ...datos, studyInstanceUid, organizationId: org.id, pacienteId, estado: pacienteId ? 'ASIGNADO' : 'POR_ASIGNAR' },
  });
  if (pacienteId && estudio.estado === 'POR_ASIGNAR' && !estudio.pacienteId) {
    await prisma.estudio.updateMany({ where: { id: estudio.id, estado: 'POR_ASIGNAR' }, data: { pacienteId, estado: 'ASIGNADO' } });
    estudio = { ...estudio, pacienteId, estado: 'ASIGNADO' };
  }

  if (!existia) {
    // Webhook estudio.recibido (solo la primera vez); un fallo al encolar no debe frenar la ingesta.
    await encolarWebhooks(prisma, { organizationId: org.id, evento: 'estudio.recibido', pacienteId: estudio.pacienteId, datos: { estudioId: estudio.id, modalidad, estado: estudio.estado } })
      .catch((e) => console.error('No se pudo encolar estudio.recibido', e));
  }

  // Vinculación automática a la orden abierta más reciente (mismo criterio que la app); no pisa una vinculación existente.
  let ordenId: string | null = null;
  if (estudio.pacienteId && !estudio.ordenId) {
    ordenId = await ordenParaVincular(prisma, org.id, estudio.pacienteId);
    if (ordenId) {
      await prisma.$transaction([
        prisma.estudio.update({ where: { id: estudio.id }, data: { ordenId } }),
        prisma.orden.updateMany({ where: { id: ordenId, estado: 'AGENDADA' }, data: { estado: 'TOMADA' } }),
        prisma.evento.create({ data: { organizationId: org.id, pacienteId: estudio.pacienteId, tipo: 'estudio.vinculado', detalle: { estudioId: estudio.id, ordenId, origen: 'ingesta' } } }),
      ]);
    }
  }
  console.log(`Estudio ${studyInstanceUid} ingerido (${estudio.estado}${superficieKey ? ', con superficie' : ''}${ordenId ? ', vinculado a orden' : ''})`);
}

// shortcut: el cursor vive en memoria y arranca en 0; los upserts son idempotentes. Persistirlo (tabla o archivo) cuando el volumen de /changes haga lenta la relectura al reiniciar.
iniciarEntregaWebhooks();
iniciarSyncIntegraciones();
let since = 0;
for (;;) {
  try {
    const c = await orthanc<{ Changes: any[]; Last: number; Done: boolean }>(`/changes?since=${since}&limit=100`);
    for (const ch of c.Changes) if (ch.ChangeType === 'StableStudy') await ingerir(ch.ID);
    since = c.Last;
    if (!c.Done) continue;
  } catch (e) {
    console.error(e);
  }
  await new Promise((r) => setTimeout(r, 3000));
}
