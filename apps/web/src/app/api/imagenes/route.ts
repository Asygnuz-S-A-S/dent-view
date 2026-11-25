import { prisma } from "@dent-view/db";
import { randomUUID } from "node:crypto";
import { cuerpoExcede } from "@/lib/cuerpo";
import { limitarIp } from "@/lib/entrega";
import { registrarEvento } from "@/lib/eventos";
import { CATEGORIAS, claveCarga, esDocumento, validarCarga, type Categoria } from "@/lib/estudios-carga";
import { claveVariante, EXTENSION, IMG_MAX_PETICION, tipoDeImagenEstudio, validarCantidad } from "@/lib/imagenes";
import { ImagenInvalida, procesarImagen } from "@/lib/imagenes-proceso";
import { borrarS3, contextoCarga, guardarS3, mismoOrigen } from "@/lib/imagenes-servidor";

export const dynamic = "force-dynamic";

const porUsuario = new Map<string, number[]>(); // shortcut: en memoria del proceso (ver limitarIp)

/**
 * Sube hasta 20 archivos a un paciente (opcionalmente ligados a una orden y/o estudio): imágenes y PDF (orden médica / documento).
 * Cada archivo se valida por su firma real. `categoria` (foto|radiografia|orden|documento) se guarda en la clave S3 (ver claveCarga).
 * El doctor remitente solo puede adjuntar la orden médica a una orden suya.
 */
export async function POST(req: Request) {
  const ctx = await contextoCarga();
  if (!ctx) return new Response(null, { status: 401 });
  if (!mismoOrigen(req)) return Response.json({ error: "Origen no permitido" }, { status: 403 });
  const esDoctor = ctx.rol === "doctor_remitente";
  if (!limitarIp(porUsuario, ctx.usuario.id, Date.now(), esDoctor ? 10 : 60, 10 * 60_000)) return Response.json({ error: "Demasiadas subidas. Inténtalo en unos minutos." }, { status: 429 });
  if (cuerpoExcede(req, IMG_MAX_PETICION)) return Response.json({ error: "La subida es demasiado grande (máximo 150 MB por subida)" }, { status: 413 });

  const datos = await req.formData().catch(() => null);
  if (!datos) return Response.json({ error: "Solicitud inválida" }, { status: 400 });
  const archivos = datos.getAll("archivos").filter((f): f is File => f instanceof File);
  const errCantidad = validarCantidad(archivos.length);
  if (errCantidad) return Response.json({ error: errCantidad }, { status: 400 });
  const cat = datos.get("categoria") ?? "radiografia";
  if (!CATEGORIAS.includes(cat as Categoria)) return Response.json({ error: "Tipo de archivo inválido" }, { status: 400 });
  const categoria = cat as Categoria;
  if (esDoctor && (categoria !== "orden" || archivos.length > 3)) return Response.json({ error: "Solo puedes adjuntar la orden médica (máximo 3 archivos)" }, { status: 403 });

  const texto = (k: string) => (typeof datos.get(k) === "string" && datos.get(k) ? String(datos.get(k)) : null);
  const pacienteId = texto("pacienteId"), ordenId = texto("ordenId"), estudioId = texto("estudioId");
  if (!pacienteId || (esDoctor && !ordenId)) return Response.json({ error: "Falta el paciente" }, { status: 400 });
  const org = ctx.organizationId;
  // Todo acotado al centro y al mismo paciente: un id ajeno es indistinguible de uno inexistente.
  const [paciente, orden, estudio] = await Promise.all([
    prisma.pacienteTenant.findFirst({ where: { id: pacienteId, organizationId: org }, select: { id: true } }),
    ordenId ? prisma.orden.findFirst({ where: { id: ordenId, organizationId: org, pacienteId, ...(esDoctor && { doctorRemitenteId: ctx.usuario.id }) }, select: { id: true } }) : null,
    estudioId ? prisma.estudio.findFirst({ where: { id: estudioId, organizationId: org, pacienteId }, select: { id: true } }) : null,
  ]);
  if (!paciente || (ordenId && !orden) || (estudioId && !estudio)) return Response.json({ error: "Paciente, orden o estudio no encontrado" }, { status: 404 });

  let subidas = 0;
  const errores: { nombre: string; error: string }[] = [];
  for (const f of archivos) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const v = validarCarga(categoria, bytes.subarray(0, 1024), bytes.length);
    if (!v.ok || v.destino === "dicom") { errores.push({ nombre: f.name, error: v.ok ? "Los DICOM y ZIP se suben por la carga de estudios" : v.error }); continue; }
    const pdf = v.tipo.tipo === "pdf";
    const mime = pdf ? "application/pdf" : tipoDeImagenEstudio(bytes)!;
    const id = randomUUID();
    const original = claveCarga(org, id, categoria, pdf ? "pdf" : EXTENSION[mime as keyof typeof EXTENSION]);
    const llaves = pdf ? [original] : [original, claveVariante(original, "web"), claveVariante(original, "thumb")];
    try {
      // shortcut: el PDF no tiene miniatura (la UI muestra un ícono); rasterizar la primera página requeriría una librería nueva.
      const p = pdf ? null : await procesarImagen(bytes, mime as Parameters<typeof procesarImagen>[1]);
      await Promise.all([guardarS3(original, bytes, mime), ...(p ? [guardarS3(llaves[1]!, p.web, "image/jpeg"), guardarS3(llaves[2]!, p.thumb, "image/jpeg")] : [])]);
      await prisma.imagenEstudio.create({
        data: { id, organizationId: org, pacienteId, ordenId: orden?.id ?? null, estudioId: estudio?.id ?? null, claveS3: original, nombreOriginal: f.name.slice(0, 200), mime, bytes: bytes.length, ancho: p?.ancho, alto: p?.alto, subidoPorId: ctx.usuario.id },
      });
      await registrarEvento({ organizationId: org, pacienteId, actorId: ctx.usuario.id, tipo: esDocumento(categoria) ? "documento.cargado" : "imagen.subida", detalle: { imagenId: id, categoria, ordenId: orden?.id ?? null, estudioId: estudio?.id ?? null } });
      subidas++;
    } catch (e) {
      console.error("Subida de imagen fallida", e);
      await Promise.all(llaves.map(borrarS3));
      errores.push({ nombre: f.name, error: e instanceof ImagenInvalida ? e.message : "No se pudo procesar la imagen" });
    }
  }
  return Response.json({ subidas, errores }, { status: subidas ? 200 : 400 });
}
