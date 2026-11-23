// Lectura de un archivo por el paciente (cookie del enlace + código), solo de SU valoración. Fotos: copia web sin EXIF o miniatura; nunca el original.
import { prisma } from "@dent-view/db";
import { claveCopia, claveValida } from "@/lib/valoraciones";
import { servirObjeto, valoracionDelPaciente } from "@/lib/valoraciones-servidor";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string; mediaId: string }> }) {
  const { token, mediaId } = await params;
  const v = await valoracionDelPaciente(token);
  if (!v) return new Response(null, { status: 401 });
  const m = await prisma.valoracion.findFirst({ where: { id: v.id }, select: { medios: { where: { id: mediaId, organizationId: v.organizationId } } } }).then((x) => x?.medios[0]);
  if (!m || !claveValida(m.claveS3, v.organizationId, v.id)) return new Response(null, { status: 404 });
  if (m.tipo === "VIDEO") return servirObjeto(req, m.claveS3, m.mime);
  return servirObjeto(req, claveCopia(m.claveS3, new URL(req.url).searchParams.get("v") === "thumb" ? "thumb" : "web"), "image/jpeg");
}
