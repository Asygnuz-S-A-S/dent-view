import { prisma } from "@dent-view/db";
import { z } from "zod";
import { categoriaDeClave, esDocumento } from "@/lib/estudios-carga";
import { registrarEvento } from "@/lib/eventos";
import { claveImagenValida, claveVariante, EXTENSION, filtroImagenes, nombreDescarga, type TipoImagen } from "@/lib/imagenes";
import { borrarS3, contextoImagenes, leerS3, mismoOrigen, sinCache } from "@/lib/imagenes-servidor";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };

async function cargar(id: string, escritura: boolean) {
  const ctx = await contextoImagenes(escritura);
  if (!ctx) return null;
  const img = await prisma.imagenEstudio.findFirst({ where: { id, ...filtroImagenes(ctx.organizationId, ctx.usuario.id, ctx.rol) } });
  return img && claveImagenValida(img.claveS3, ctx.organizationId, id) ? { ctx, img } : null;
}

// Nunca hay URL pública: se lee de S3 aquí, tras validar sesión, centro y rol. ?v=thumb|web (por defecto) | original; ?descargar=1 fuerza descarga.
export async function GET(req: Request, { params }: P) {
  const { id } = await params;
  const r = await cargar(id, false);
  if (!r) return new Response(null, { status: (await contextoImagenes(false)) ? 404 : 401 });
  const url = new URL(req.url);
  const v = url.searchParams.get("v");
  const original = v === "original";
  const pdf = r.img.mime === "application/pdf";
  const key = original || pdf ? r.img.claveS3 : claveVariante(r.img.claveS3, v === "thumb" ? "thumb" : "web");
  const tipo = original || pdf ? r.img.mime : "image/jpeg";
  try {
    const obj = await leerS3(key);
    const descargar = url.searchParams.get("descargar") === "1";
    if (descargar) await registrarEvento({ organizationId: r.ctx.organizationId, pacienteId: r.img.pacienteId, actorId: r.ctx.usuario.id, tipo: "imagen.descargada", detalle: { imagenId: id, version: original ? "original" : "web" } });
    return new Response(obj.Body!.transformToWebStream(), {
      headers: {
        "Content-Type": tipo,
        ...(descargar ? { "Content-Disposition": `attachment; filename="${nombreDescarga(r.img.titulo, r.img.nombreOriginal, pdf ? "pdf" : original ? EXTENSION[r.img.mime as TipoImagen] ?? "bin" : "jpg")}"` } : pdf && { "Content-Disposition": "inline", "Content-Security-Policy": "sandbox" }),
        ...sinCache,
      },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}

export async function PATCH(req: Request, { params }: P) {
  if (!mismoOrigen(req)) return Response.json({ error: "Origen no permitido" }, { status: 403 });
  const { id } = await params;
  const r = await cargar(id, true);
  if (!r) return new Response(null, { status: 404 });
  const t = z.object({ titulo: z.string().trim().max(120) }).safeParse(await req.json().catch(() => null));
  if (!t.success) return Response.json({ error: "Título inválido (máximo 120 caracteres)" }, { status: 400 });
  await prisma.imagenEstudio.update({ where: { id }, data: { titulo: t.data.titulo || null } });
  await registrarEvento({ organizationId: r.ctx.organizationId, pacienteId: r.img.pacienteId, actorId: r.ctx.usuario.id, tipo: "imagen.titulo", detalle: { imagenId: id } });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request, { params }: P) {
  if (!mismoOrigen(req)) return Response.json({ error: "Origen no permitido" }, { status: 403 });
  const { id } = await params;
  const r = await cargar(id, true);
  if (!r) return new Response(null, { status: 404 });
  // Órdenes y documentos adjuntos solo los elimina el administrador del centro.
  if (esDocumento(categoriaDeClave(r.img.claveS3)) && r.ctx.rol !== "admin_tenant") return new Response(null, { status: 403 });
  await prisma.imagenEstudio.delete({ where: { id } }); // las capturas de informes en borrador que la usan se van por cascada
  await registrarEvento({ organizationId: r.ctx.organizationId, pacienteId: r.img.pacienteId, actorId: r.ctx.usuario.id, tipo: esDocumento(categoriaDeClave(r.img.claveS3)) ? "documento.eliminado" : "imagen.eliminada", detalle: { imagenId: id, nombre: r.img.nombreOriginal } });
  await Promise.all([r.img.claveS3, claveVariante(r.img.claveS3, "web"), claveVariante(r.img.claveS3, "thumb")].map(borrarS3));
  return Response.json({ ok: true });
}
