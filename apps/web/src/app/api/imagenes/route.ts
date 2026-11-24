import { prisma } from "@dent-view/db";
import { randomUUID } from "node:crypto";
import { cuerpoExcede } from "@/lib/cuerpo";
import { limitarIp } from "@/lib/entrega";
import { registrarEvento } from "@/lib/eventos";
import { claveOriginal, claveVariante, IMG_MAX_PETICION, tipoDeImagenEstudio, validarCantidad, validarImagenEstudio } from "@/lib/imagenes";
import { ImagenInvalida, procesarImagen } from "@/lib/imagenes-proceso";
import { borrarS3, contextoImagenes, guardarS3, mismoOrigen } from "@/lib/imagenes-servidor";

export const dynamic = "force-dynamic";

const porUsuario = new Map<string, number[]>(); // shortcut: en memoria del proceso (ver limitarIp)

/** Sube hasta 20 imágenes a un paciente (opcionalmente ligadas a una orden y/o estudio). Cada archivo se valida por su firma real. */
export async function POST(req: Request) {
  const ctx = await contextoImagenes(true);
  if (!ctx) return new Response(null, { status: 401 });
  if (!mismoOrigen(req)) return Response.json({ error: "Origen no permitido" }, { status: 403 });
  if (!limitarIp(porUsuario, ctx.usuario.id, Date.now(), 10, 10 * 60_000)) return Response.json({ error: "Demasiadas subidas. Inténtalo en unos minutos." }, { status: 429 });
  if (cuerpoExcede(req, IMG_MAX_PETICION)) return Response.json({ error: "La subida es demasiado grande (máximo 150 MB por subida)" }, { status: 413 });

  const datos = await req.formData().catch(() => null);
  if (!datos) return Response.json({ error: "Solicitud inválida" }, { status: 400 });
  const archivos = datos.getAll("archivos").filter((f): f is File => f instanceof File);
  const errCantidad = validarCantidad(archivos.length);
  if (errCantidad) return Response.json({ error: errCantidad }, { status: 400 });

  const texto = (k: string) => (typeof datos.get(k) === "string" && datos.get(k) ? String(datos.get(k)) : null);
  const pacienteId = texto("pacienteId"), ordenId = texto("ordenId"), estudioId = texto("estudioId");
  if (!pacienteId) return Response.json({ error: "Falta el paciente" }, { status: 400 });
  const org = ctx.organizationId;
  // Todo acotado al centro y al mismo paciente: un id ajeno es indistinguible de uno inexistente.
  const [paciente, orden, estudio] = await Promise.all([
    prisma.pacienteTenant.findFirst({ where: { id: pacienteId, organizationId: org }, select: { id: true } }),
    ordenId ? prisma.orden.findFirst({ where: { id: ordenId, organizationId: org, pacienteId }, select: { id: true } }) : null,
    estudioId ? prisma.estudio.findFirst({ where: { id: estudioId, organizationId: org, pacienteId }, select: { id: true } }) : null,
  ]);
  if (!paciente || (ordenId && !orden) || (estudioId && !estudio)) return Response.json({ error: "Paciente, orden o estudio no encontrado" }, { status: 404 });

  let subidas = 0;
  const errores: { nombre: string; error: string }[] = [];
  for (const f of archivos) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const error = validarImagenEstudio(bytes);
    const mime = tipoDeImagenEstudio(bytes);
    if (error || !mime) { errores.push({ nombre: f.name, error: error ?? "Formato no soportado" }); continue; }
    const id = randomUUID();
    const original = claveOriginal(org, id, mime);
    const llaves = [original, claveVariante(original, "web"), claveVariante(original, "thumb")];
    try {
      const p = await procesarImagen(bytes, mime);
      await Promise.all([guardarS3(llaves[0]!, bytes, mime), guardarS3(llaves[1]!, p.web, "image/jpeg"), guardarS3(llaves[2]!, p.thumb, "image/jpeg")]);
      await prisma.imagenEstudio.create({
        data: { id, organizationId: org, pacienteId, ordenId: orden?.id ?? null, estudioId: estudio?.id ?? null, claveS3: original, nombreOriginal: f.name.slice(0, 200), mime, bytes: bytes.length, ancho: p.ancho, alto: p.alto, subidoPorId: ctx.usuario.id },
      });
      await registrarEvento({ organizationId: org, pacienteId, actorId: ctx.usuario.id, tipo: "imagen.subida", detalle: { imagenId: id, ordenId: orden?.id ?? null, estudioId: estudio?.id ?? null } });
      subidas++;
    } catch (e) {
      console.error("Subida de imagen fallida", e);
      await Promise.all(llaves.map(borrarS3));
      errores.push({ nombre: f.name, error: e instanceof ImagenInvalida ? e.message : "No se pudo procesar la imagen" });
    }
  }
  return Response.json({ subidas, errores }, { status: subidas ? 200 : 400 });
}
