// Implementación independiente (sala limpia) a partir de docs/sala-limpia/01-documentos-e-informes.md
import { prisma } from "@dent-view/db";
import { registrarAcceso } from "@/lib/bitacora";
import { nombreArchivoInforme } from "@/lib/informes";
import { CLINICOS } from "@/lib/roles";
import { contextoActivo } from "@/lib/sesion";

export const dynamic = "force-dynamic";

// Descarga de la copia exacta emitida. Siempre pasa por sesión y centro; el doctor remitente solo ve lo suyo.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoActivo();
  if (!ctx || ctx.usuario.debeCambiarClave) return new Response(null, { status: 401 });
  const { id } = await params;
  const inf = await prisma.informe.findFirst({ where: { id, organizationId: ctx.organizationId } });
  const orden = inf?.ordenId ? await prisma.orden.findFirst({ where: { id: inf.ordenId, organizationId: ctx.organizationId } }) : null;
  const permitido = (CLINICOS as readonly string[]).includes(ctx.rol) || (ctx.rol === "doctor_remitente" && orden?.doctorRemitenteId === ctx.usuario.id && inf?.estado === "EMITIDO"); // misma regla que la página: el doctor solo ve emitidos
  if (!inf || !permitido) return new Response("No encontrado", { status: 404 });
  if (inf.estado === "BORRADOR") return new Response("El informe aún es un borrador", { status: 409 });
  if (!inf.pdf) return new Response("Archivo no encontrado: debe emitirse de nuevo", { status: 404 });
  const pac = await prisma.pacienteTenant.findUnique({ where: { id: inf.pacienteId } });
  await registrarAcceso(ctx, inf.pacienteId, "informe", { informeId: inf.id, accion: "descarga" });
  const nombre = nombreArchivoInforme(orden?.numero ?? null, pac?.nombre ?? "", inf.version);
  return new Response(Buffer.from(inf.pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nombre}"`, "Cache-Control": "private, no-store" } });
}
