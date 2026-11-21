// Utilidades de servidor compartidas por las rutas de imágenes (sesión, rol, origen y S3).
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { CLINICOS } from "@/lib/roles";
import { s3 } from "@/lib/s3";
import { contextoActivo } from "@/lib/sesion";

export const sinCache = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const bucket = () => process.env.S3_BUCKET_ESTUDIOS;

/** Lectura: personal clínico o doctor remitente (acotado después por filtroImagenes). Escritura: personal clínico. */
export async function contextoImagenes(escritura: boolean) {
  const ctx = await contextoActivo();
  if (!ctx || ctx.usuario.debeCambiarClave) return null;
  const clinico = (CLINICOS as readonly string[]).includes(ctx.rol);
  return clinico || (!escritura && ctx.rol === "doctor_remitente") ? ctx : null;
}

// La cookie de sesión es SameSite=Lax; además se exige mismo origen en las escrituras.
export function mismoOrigen(req: Request) {
  const origen = req.headers.get("origin");
  return !origen || origen === new URL(req.url).origin || origen === `${req.headers.get("x-forwarded-proto") ?? "http"}://${req.headers.get("host")}`;
}

export const guardarS3 = (Key: string, Body: Uint8Array, ContentType: string) => s3.send(new PutObjectCommand({ Bucket: bucket(), Key, Body, ContentType }));
export const leerS3 = (Key: string) => s3.send(new GetObjectCommand({ Bucket: bucket(), Key }));
export const borrarS3 = (Key: string) => s3.send(new DeleteObjectCommand({ Bucket: bucket(), Key })).catch((e) => console.error("No se pudo borrar", Key, e));

/** Bytes de la copia web de una imagen (para el PDF); null si falla. */
export async function bytesS3(Key: string): Promise<Buffer | null> {
  try {
    const o = await leerS3(Key);
    return Buffer.from(await o.Body!.transformToByteArray());
  } catch {
    return null;
  }
}
