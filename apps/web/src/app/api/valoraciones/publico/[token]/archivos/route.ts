// Subida del paciente (enlace + código): una foto o video por petición, para poder mostrar progreso y reintentar por archivo.
import { prisma } from "@dent-view/db";
import { randomUUID } from "node:crypto";
import { limitarIp } from "@/lib/entrega";
import { registrarEvento } from "@/lib/eventos";
import { procesarImagen } from "@/lib/imagenes-proceso";
import { borrarS3, guardarS3, mismoOrigen } from "@/lib/imagenes-servidor";
import {
  ANGULOS, EXT_VIDEO, MAX_SUBIDAS_VENTANA, VIDEO_MAX_BYTES, VIDEO_MAX_SEG, claveCopia, claveMedia, claveValida, pacienteEdita,
  tipoDeVideo, validarCupo, validarFotoValoracion, validarVideo, type Angulo,
} from "@/lib/valoraciones";
import { valoracionDelPaciente } from "@/lib/valoraciones-servidor";
import { EXTENSION, tipoDeImagenEstudio } from "@/lib/imagenes";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ token: string }> };
const porValoracion = new Map<string, number[]>(); // shortcut: en memoria del proceso (ver limitarIp)

const err = (error: string, status: number) => Response.json({ error }, { status });

export async function POST(req: Request, { params }: P) {
  const { token } = await params;
  const v = await valoracionDelPaciente(token);
  if (!v) return err("Tu sesión venció. Vuelve a ingresar el código.", 401);
  if (!mismoOrigen(req)) return err("Origen no permitido", 403);
  if (!v.consentimientoEn) return err("Primero acepta el consentimiento.", 403);
  if (!pacienteEdita(v)) return err("Esta valoración ya no admite más archivos.", 409);
  if (!limitarIp(porValoracion, v.id, Date.now(), MAX_SUBIDAS_VENTANA, 10 * 60_000)) return err("Demasiadas subidas. Inténtalo en unos minutos.", 429);
  if (Number(req.headers.get("content-length") ?? 0) > VIDEO_MAX_BYTES + 1_000_000) return err("El archivo es demasiado grande", 413);

  const datos = await req.formData().catch(() => null);
  const archivo = datos?.get("archivo");
  const angulo = String(datos?.get("angulo") ?? "");
  if (!(archivo instanceof File) || !(ANGULOS as readonly string[]).includes(angulo)) return err("Solicitud inválida", 400);
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const esVideo = angulo === "VIDEO_APERTURA";
  // El tipo se decide por la firma real de los bytes, no por lo que declara el navegador.
  const error = esVideo ? validarVideo(bytes) : validarFotoValoracion(bytes);
  if (error) return err(error, 400);

  const org = v.organizationId;
  const existentes = await prisma.valoracionMedia.findMany({ where: { valoracionId: v.id, organizationId: org }, select: { id: true, tipo: true, angulo: true, claveS3: true, claveMiniatura: true } });
  const cupo = validarCupo(existentes, { tipo: esVideo ? "VIDEO" : "FOTO", angulo });
  if (cupo) return err(cupo, 409);

  const id = randomUUID();
  const llaves: string[] = [];
  try {
    let datosMedia;
    if (esVideo) {
      const mime = tipoDeVideo(bytes)!;
      const original = claveMedia(org, v.id, id, EXT_VIDEO[mime]);
      llaves.push(original);
      await guardarS3(original, bytes, mime);
      // shortcut: la duración la informa el navegador (no hay ffprobe en el servidor); se acota a VIDEO_MAX_SEG y el tamaño sí se valida aquí.
      const dur = Math.round(Number(datos?.get("duracion")));
      datosMedia = { tipo: "VIDEO" as const, mime, claveS3: original, claveMiniatura: null, duracionSeg: Number.isFinite(dur) ? Math.min(Math.max(dur, 0), VIDEO_MAX_SEG) : null, ancho: null, alto: null };
    } else {
      const mime = tipoDeImagenEstudio(bytes)!;
      const original = claveMedia(org, v.id, id, EXTENSION[mime]);
      const web = claveCopia(original, "web"), thumb = claveCopia(original, "thumb");
      llaves.push(original, web, thumb);
      // procesarImagen re-codifica sin EXIF/GPS: las copias web/miniatura son las que ve el paciente; el original solo lo ve el personal.
      const p = await procesarImagen(bytes, mime);
      await Promise.all([guardarS3(original, bytes, mime), guardarS3(web, p.web, "image/jpeg"), guardarS3(thumb, p.thumb, "image/jpeg")]);
      datosMedia = { tipo: "FOTO" as const, mime, claveS3: original, claveMiniatura: thumb, duracionSeg: null, ancho: p.ancho, alto: p.alto };
    }
    // Repetir un ángulo único reemplaza la foto anterior.
    const previas = existentes.filter((m) => m.tipo === "FOTO" && m.angulo === angulo && !esVideo && angulo !== "OTRO");
    await prisma.$transaction([
      prisma.valoracionMedia.deleteMany({ where: { id: { in: previas.map((m) => m.id) }, valoracionId: v.id } }),
      prisma.valoracionMedia.create({ data: { id, organizationId: org, valoracionId: v.id, angulo: angulo as Angulo, bytes: bytes.length, ...datosMedia } }),
    ]);
    await Promise.all(previas.flatMap((m) => [m.claveS3, claveCopia(m.claveS3, "web"), claveCopia(m.claveS3, "thumb")].filter((k) => claveValida(k, org, v.id)).map(borrarS3)));
    await registrarEvento({ organizationId: org, pacienteId: v.pacienteId, tipo: "valoracion.archivo_subido", detalle: { valoracionId: v.id, medioId: id, angulo, tipo: datosMedia.tipo } });
    return Response.json({ id, angulo, tipo: datosMedia.tipo, bytes: bytes.length });
  } catch (e) {
    console.error("Subida de valoración fallida", e);
    await Promise.all(llaves.map(borrarS3));
    return err("No se pudo procesar el archivo. Inténtalo de nuevo.", 500);
  }
}

/** El paciente quita un archivo suyo mientras la valoración admite cambios. */
export async function DELETE(req: Request, { params }: P) {
  const { token } = await params;
  const v = await valoracionDelPaciente(token);
  if (!v) return err("Tu sesión venció. Vuelve a ingresar el código.", 401);
  if (!mismoOrigen(req)) return err("Origen no permitido", 403);
  if (!pacienteEdita(v)) return err("Esta valoración ya no admite cambios.", 409);
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const m = await prisma.valoracionMedia.findFirst({ where: { id, valoracionId: v.id, organizationId: v.organizationId } });
  if (!m || !claveValida(m.claveS3, v.organizationId, v.id)) return err("Archivo no encontrado", 404);
  await prisma.valoracionMedia.delete({ where: { id: m.id } });
  await Promise.all([m.claveS3, claveCopia(m.claveS3, "web"), claveCopia(m.claveS3, "thumb")].map(borrarS3));
  await registrarEvento({ organizationId: v.organizationId, pacienteId: v.pacienteId, tipo: "valoracion.archivo_quitado", detalle: { valoracionId: v.id, medioId: id } });
  return Response.json({ ok: true });
}
