import { CLINICOS } from "@/lib/roles";
import { generarYGuardarRips } from "@/lib/rips/servicio";
import { contextoActivo } from "@/lib/sesion";

export const dynamic = "force-dynamic";

// Genera, valida localmente, guarda (S3 + EnvioRips) y descarga el RIPS de una orden. Validado local NO es aprobado por el Ministerio (CUV).
export async function GET(_req: Request, { params }: { params: Promise<{ ordenId: string }> }) {
  const ctx = await contextoActivo();
  if (!ctx || ctx.usuario.debeCambiarClave) return new Response(null, { status: 401 });
  if (!(CLINICOS as readonly string[]).includes(ctx.rol)) return new Response(null, { status: 403 });
  const { ordenId } = await params;
  const r = await generarYGuardarRips({ organizationId: ctx.organizationId, actorId: ctx.usuario.id, ordenId });
  if (r.estado === "no_encontrada" || r.estado === "desactivado") return new Response(null, { status: 404 });
  if (r.estado === "sin_almacenamiento") return Response.json({ error: "No se pudo guardar el RIPS" }, { status: 502 });
  if (r.estado === "incompleta") return Response.json({ error: "El RIPS tiene errores", errores: r.errores, advertencias: r.advertencias }, { status: 422, headers: { "Cache-Control": "private, no-store" } });
  return new Response(JSON.stringify(r.json, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${r.nombre}"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    },
  });
}
