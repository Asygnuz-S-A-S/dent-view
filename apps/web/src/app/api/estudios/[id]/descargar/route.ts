import { prisma } from "@dent-view/db";
import { puedeDescargarEstudio } from "@/lib/acceso";
import { limitarIp } from "@/lib/entrega";
import { nombreZip } from "@/lib/entrega-estudio";
import { registrarEvento } from "@/lib/eventos";
import { contextoActivo } from "@/lib/sesion";

export const dynamic = "force-dynamic";

const porUsuario = new Map<string, number[]>(); // shortcut: en memoria del proceso (ver limitarIp)

/** Zip DICOM del estudio en streaming desde Orthanc (que no tiene puertos publicados). Solo personal del centro del estudio. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoActivo();
  if (!ctx || ctx.usuario.debeCambiarClave) return new Response(null, { status: 401 });
  const { id } = await params;
  // Acotado por centro: un id de otro centro es indistinguible de uno inexistente (404).
  const estudio = await prisma.estudio.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { id: true, organizationId: true, doctorRemitenteId: true, orthancId: true, pacienteId: true, fechaEstudio: true },
  });
  if (!estudio) return new Response(null, { status: 404 });
  if (!puedeDescargarEstudio(ctx.usuario.id, ctx.rol, estudio)) return new Response(null, { status: 403 });
  if (!limitarIp(porUsuario, ctx.usuario.id, Date.now(), 20, 10 * 60_000)) return new Response("Demasiadas descargas. Inténtalo más tarde.", { status: 429 });
  const base = process.env.ORTHANC_URL;
  if (!base) return new Response(null, { status: 503 });
  try {
    const r = await fetch(`${base}/studies/${encodeURIComponent(estudio.orthancId)}/archive`, { signal: req.signal });
    if (!r.ok || !r.body) return new Response(null, { status: 502 });
    await registrarEvento({ organizationId: estudio.organizationId, pacienteId: estudio.pacienteId, actorId: ctx.usuario.id, tipo: "estudio.descargado", detalle: { estudioId: estudio.id } });
    return new Response(r.body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${nombreZip(estudio)}"`,
        ...(r.headers.get("content-length") && { "Content-Length": r.headers.get("content-length")! }),
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
