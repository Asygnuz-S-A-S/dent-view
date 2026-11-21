import { prisma } from "@dent-view/db";
import { filtroEstudios } from "@/lib/acceso";
import { capturaDeSerie } from "@/lib/captura-dicom";
import { sinCache } from "@/lib/imagenes-servidor";
import { CLINICOS } from "@/lib/roles";
import { contextoActivo } from "@/lib/sesion";

export const dynamic = "force-dynamic";

/** JPEG de una serie del estudio (vista previa del selector de capturas). Mismo control de centro y doctor remitente que el resto de estudios. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoActivo();
  if (!ctx || ctx.usuario.debeCambiarClave) return new Response(null, { status: 401 });
  if (!(CLINICOS as readonly string[]).includes(ctx.rol)) return new Response(null, { status: 403 }); // armar capturas es trabajo clínico
  const { id } = await params;
  const estudio = await prisma.estudio.findFirst({ where: { id, ...filtroEstudios(ctx.organizationId, ctx.usuario.id, ctx.rol) }, select: { orthancId: true } });
  if (!estudio) return new Response(null, { status: 404 });
  const jpeg = await capturaDeSerie(estudio.orthancId, new URL(req.url).searchParams.get("serie"));
  return jpeg ? new Response(new Uint8Array(jpeg), { headers: { "Content-Type": "image/jpeg", ...sinCache } }) : new Response(null, { status: 404 });
}
