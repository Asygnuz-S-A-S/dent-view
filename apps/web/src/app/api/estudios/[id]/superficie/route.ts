import { GetObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@dent-view/db";
import { puedeVerEstudio } from "@/lib/acceso";
import { s3 } from "@/lib/s3";
import { contextoActivo } from "@/lib/sesion";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoActivo();
  if (!ctx || ctx.usuario.debeCambiarClave) return new Response(null, { status: 401 });
  const { id } = await params;
  const estudio = await prisma.estudio.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { organizationId: true, doctorRemitenteId: true, superficieKey: true },
  });
  const key = estudio?.superficieKey;
  if (!estudio || !key || !puedeVerEstudio(ctx.usuario.id, ctx.rol, estudio)) return new Response(null, { status: 404 });
  if (!key.startsWith(`tenants/${estudio.organizationId}/`)) return new Response(null, { status: 404 });
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET_ESTUDIOS, Key: key }));
    return new Response(obj.Body!.transformToWebStream(), {
      headers: {
        "Content-Type": "application/octet-stream",
        ...(obj.ContentLength != null && { "Content-Length": String(obj.ContentLength) }),
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
