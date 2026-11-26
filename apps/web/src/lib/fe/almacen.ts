// Archivos de documentos electrónicos en S3 (tenants/{org}/fe/{documento}/...). Nunca tienen URL pública: se sirven por ruta autenticada.
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "@/lib/s3";
import { sha256Hex, TAMANO_MAX_DESCARGA } from "./proveedor";

export const EXTENSION = { pdf: "pdf", xml: "xml", attached: "xml" } as const;
export const claveArchivo = (org: string, documentoId: string, que: keyof typeof EXTENSION) => `tenants/${org}/fe/${documentoId}/${que}.${EXTENSION[que]}`;
export const claveValida = (key: string, org: string) => key.startsWith(`tenants/${org}/fe/`) && !key.includes("..");

export async function guardarArchivo(key: string, bytes: Uint8Array, contentType: string) {
  if (bytes.byteLength > TAMANO_MAX_DESCARGA) throw new Error("Archivo demasiado grande");
  await s3.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET_ESTUDIOS, Key: key, Body: bytes, ContentType: contentType }));
  return sha256Hex(bytes);
}
export async function leerArchivo(key: string): Promise<Uint8Array> {
  const o = await s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET_ESTUDIOS, Key: key }));
  return o.Body!.transformToByteArray();
}
