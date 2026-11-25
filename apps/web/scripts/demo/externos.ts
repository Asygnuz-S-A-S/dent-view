// Acceso a Orthanc (REST) y S3/MinIO para la demo. Mismo cliente S3 que usa la app (src/lib/s3.ts).
import { CreateBucketCommand, DeleteObjectsCommand, HeadBucketCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { s3 } from "../../src/lib/s3";
import type { Entorno } from "./util";

export async function asegurarBucket(bucket: string) {
  try { await s3.send(new HeadBucketCommand({ Bucket: bucket })); }
  catch { await s3.send(new CreateBucketCommand({ Bucket: bucket })); }
}

export async function subirS3(bucket: string, key: string, body: Buffer | string, contentType: string) {
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
}

/** Cuenta (y opcionalmente borra) los objetos bajo `prefijo`. */
export async function objetosS3(bucket: string, prefijo: string, borrar: boolean) {
  let total = 0;
  let token: string | undefined;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefijo, ContinuationToken: token }));
    const keys = (r.Contents ?? []).map((o) => ({ Key: o.Key! }));
    total += keys.length;
    if (borrar && keys.length) await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys, Quiet: true } }));
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return total;
}

export async function orthanc(env: Entorno, path: string, init?: RequestInit) {
  const r = await fetch(`${env.orthanc}${path}`, init);
  if (!r.ok) throw new Error(`Orthanc ${init?.method ?? "GET"} ${path}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r;
}

export async function estudiosOrthanc(env: Entorno): Promise<string[]> {
  return (await (await orthanc(env, "/studies")).json()) as string[];
}

export async function borrarEstudiosOrthanc(env: Entorno) {
  const ids = await estudiosOrthanc(env);
  for (const id of ids) await orthanc(env, `/studies/${id}`, { method: "DELETE" });
  return ids.length;
}

/** Id que Orthanc asigna a un estudio: SHA-1 de "PatientID|StudyInstanceUID" en 5 grupos de 8 hex. */
export function orthancIdEstudio(patientId: string, studyUid: string) {
  const h = createHash("sha1").update(`${patientId}|${studyUid}`).digest("hex");
  return [0, 8, 16, 24, 32].map((i) => h.slice(i, i + 8)).join("-");
}

/**
 * Sube las instancias de un estudio. La etiqueta del centro se pone tras la primera instancia, antes de que el
 * estudio sea "estable" para el worker (que usa la etiqueta para saber a qué centro pertenece).
 */
export async function subirEstudio(env: Entorno, archivos: Buffer[], etiqueta: string) {
  let estudioId = "";
  for (const [i, buf] of archivos.entries()) {
    const r = (await (await orthanc(env, "/instances", { method: "POST", headers: { "Content-Type": "application/dicom" }, body: new Uint8Array(buf) })).json()) as { ParentStudy: string };
    estudioId = r.ParentStudy;
    if (i === 0) await orthanc(env, `/studies/${estudioId}/labels/${etiqueta}`, { method: "PUT" });
  }
  return estudioId;
}
