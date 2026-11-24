// Lectura de un archivo por el personal (sesión, centro y rol; el especialista solo ve las suyas). ?v=thumb|web (por defecto) | original. Video con Range.
import { prisma } from "@dent-view/db";
import { registrarEvento } from "@/lib/eventos";
import { respuestaSinModulo } from "@/lib/sesion";
import { claveCopia, claveValida } from "@/lib/valoraciones";
import { contextoValoraciones, servirObjeto, valoracionVisible } from "@/lib/valoraciones-servidor";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string; mediaId: string }> }) {
  const { id, mediaId } = await params;
  const ctx = await contextoValoraciones();
  if (!ctx) return new Response(null, { status: 401 });
  const sinModulo = await respuestaSinModulo(ctx, "valoraciones");
  if (sinModulo) return sinModulo;
  // Fotos y video son datos de salud: solo quien valora (no recepción).
  if (!ctx.puedeValorar) return new Response(null, { status: 403 });
  const v = await valoracionVisible(ctx, id);
  const m = v ? await prisma.valoracionMedia.findFirst({ where: { id: mediaId, valoracionId: v.id, organizationId: ctx.organizationId } }) : null;
  if (!v || !m || !claveValida(m.claveS3, ctx.organizationId, v.id)) return new Response(null, { status: 404 });
  const version = new URL(req.url).searchParams.get("v");
  if (m.tipo === "VIDEO" || version === "original") {
    // Solo la primera petición de un video (sin Range o desde el inicio) cuenta como acceso, para no llenar la bitácora.
    if (!req.headers.get("range") || req.headers.get("range") === "bytes=0-") {
      await registrarEvento({ organizationId: ctx.organizationId, pacienteId: v.pacienteId, actorId: ctx.usuario.id, tipo: "acceso.valoracion", detalle: { valoracionId: v.id, medioId: m.id, version: "original" } });
    }
    return servirObjeto(req, m.claveS3, m.mime);
  }
  return servirObjeto(req, claveCopia(m.claveS3, version === "thumb" ? "thumb" : "web"), "image/jpeg");
}
