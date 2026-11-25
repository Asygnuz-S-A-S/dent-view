// Consulta de imágenes y documentos adjuntos de un paciente u orden, ya clasificados por categoría (ver claveCarga).
import { prisma, type Prisma } from "@dent-view/db";
import { categoriaDeClave, esDocumento, type Categoria } from "./estudios-carga";
import { filtroImagenes } from "./imagenes";

export type DocVista = { id: string; titulo: string | null; nombreOriginal: string; mime: string; bytes: number; creadoEn: Date; quien: string | null; categoria: Categoria };

/** Imágenes/documentos visibles para el rol (el doctor remitente solo ve los de sus órdenes y estudios), con quién los subió. */
export async function cargarArchivos(ctx: { organizationId: string; usuario: { id: string }; rol: string }, donde: Prisma.ImagenEstudioWhereInput) {
  const filas = await prisma.imagenEstudio.findMany({
    where: { AND: [donde, filtroImagenes(ctx.organizationId, ctx.usuario.id, ctx.rol)] },
    orderBy: { creadoEn: "desc" },
    select: { id: true, titulo: true, nombreOriginal: true, mime: true, bytes: true, claveS3: true, creadoEn: true, subidoPorId: true },
  });
  const ids = [...new Set(filas.flatMap((f) => (f.subidoPorId ? [f.subidoPorId] : [])))];
  const nombres = new Map((ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : []).map((u) => [u.id, u.name]));
  const todas: DocVista[] = filas.map((f) => ({ id: f.id, titulo: f.titulo, nombreOriginal: f.nombreOriginal, mime: f.mime, bytes: f.bytes, creadoEn: f.creadoEn, quien: f.subidoPorId ? nombres.get(f.subidoPorId) ?? null : null, categoria: categoriaDeClave(f.claveS3) }));
  return {
    fotos: todas.filter((d) => d.categoria === "foto"),
    radiografias: todas.filter((d) => d.categoria === "radiografia"),
    documentos: todas.filter((d) => esDocumento(d.categoria)),
    todas,
  };
}
