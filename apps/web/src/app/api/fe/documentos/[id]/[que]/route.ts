// Descarga autenticada de PDF/XML de un documento electrónico (GESTION, solo del centro activo). Nunca hay URL pública.
import { contarPeticion } from "@/lib/api-limite";
import { descargarDocumento } from "@/lib/fe/servicio";
import { GESTION } from "@/lib/roles";
import { contextoActivo } from "@/lib/sesion";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const limites = new Map<string, { inicio: number; cuenta: number }>();
const QUE = new Set(["pdf", "xml", "attached"]);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; que: string }> }) {
  const ctx = await contextoActivo();
  if (!ctx || ctx.usuario.debeCambiarClave || !(GESTION as readonly string[]).includes(ctx.rol)) return new Response(null, { status: 401 });
  if (!contarPeticion(limites, ctx.usuario.id, Date.now(), 60).permitido) return new Response(null, { status: 429 });
  const { id, que } = await params;
  if (!QUE.has(que) || !/^[A-Za-z0-9_-]{1,40}$/.test(id)) return new Response(null, { status: 404 });
  try {
    const d = await descargarDocumento(id, ctx.organizationId, que as "pdf" | "xml" | "attached");
    if (!d) return new Response(null, { status: 404 });
    return new Response(Buffer.from(d.bytes), { headers: { "Content-Type": d.contentType, "Content-Disposition": `attachment; filename="${d.nombre}"`, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("fe: descarga falló", e instanceof Error ? e.message : "error");
    return new Response(null, { status: 502 });
  }
}
