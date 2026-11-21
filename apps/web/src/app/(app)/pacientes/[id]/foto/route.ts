import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@dent-view/db";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { registrarEvento } from "@/lib/eventos";
import { claveFoto, claveFotoValida, validarFoto } from "@/lib/pacientes-foto";
import { filtroVisibles } from "@/lib/pacientes-filtro";
import { CLINICOS, GESTION } from "@/lib/roles";
import { s3 } from "@/lib/s3";
import { contextoActivo } from "@/lib/sesion";

export const dynamic = "force-dynamic";

const sinCache = { "Cache-Control": "private, no-store" };

async function contexto(roles: readonly string[] | null) {
  const ctx = await contextoActivo();
  if (!ctx || ctx.usuario.debeCambiarClave) return null;
  // Lectura: personal clínico o el doctor remitente (solo de sus pacientes). Escritura: gestión.
  const ok = roles ? roles.includes(ctx.rol) : (CLINICOS as readonly string[]).includes(ctx.rol) || ctx.rol === "doctor_remitente";
  return ok ? ctx : null;
}

// La foto nunca tiene URL pública: se lee de S3 aquí, tras validar sesión, centro y rol.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contexto(null);
  if (!ctx) return new Response(null, { status: 401 });
  const { id } = await params;
  const p = await prisma.pacienteTenant.findFirst({ where: { id, ...filtroVisibles(ctx.organizationId, ctx.usuario.id, ctx.rol) }, select: { fotoKey: true } });
  if (!p?.fotoKey || !claveFotoValida(p.fotoKey, ctx.organizationId, id)) return new Response(null, { status: 404 });
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET_ESTUDIOS, Key: p.fotoKey }));
    return new Response(obj.Body!.transformToWebStream(), { headers: { "Content-Type": "image/jpeg", "X-Content-Type-Options": "nosniff", ...sinCache } });
  } catch {
    return new Response(null, { status: 502 });
  }
}

// Cookie de sesión SameSite=Lax ya frena el POST entre sitios; además se exige mismo origen.
function mismoOrigen(req: Request) {
  const origen = req.headers.get("origin");
  return !origen || origen === new URL(req.url).origin || origen === `${req.headers.get("x-forwarded-proto") ?? "http"}://${req.headers.get("host")}`;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contexto(GESTION);
  if (!ctx) return new Response(null, { status: 401 });
  if (!mismoOrigen(req)) return Response.json({ error: "Origen no permitido" }, { status: 403 });
  const { id } = await params;
  const p = await prisma.pacienteTenant.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true, fotoKey: true } });
  if (!p) return Response.json({ error: "Paciente no encontrado" }, { status: 404 });

  const archivo = (await req.formData().catch(() => null))?.get("foto");
  if (!(archivo instanceof File)) return Response.json({ error: "Elige una foto" }, { status: 400 });
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const error = validarFoto(bytes);
  if (error) return Response.json({ error }, { status: 400 });

  // Se re-codifica a JPEG cuadrado: sin EXIF/GPS (sharp no copia metadatos) y sin carga útil oculta.
  let jpeg: Buffer;
  try {
    jpeg = await sharp(bytes).rotate().resize(512, 512, { fit: "cover" }).jpeg({ quality: 85 }).toBuffer();
  } catch {
    return Response.json({ error: "No se pudo leer la imagen" }, { status: 400 });
  }
  const key = claveFoto(ctx.organizationId, id, randomUUID());
  try {
    await s3.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET_ESTUDIOS, Key: key, Body: jpeg, ContentType: "image/jpeg" }));
  } catch {
    return Response.json({ error: "No se pudo guardar la foto" }, { status: 502 });
  }
  await prisma.pacienteTenant.update({ where: { id }, data: { fotoKey: key } });
  await registrarEvento({ organizationId: ctx.organizationId, pacienteId: id, actorId: ctx.usuario.id, tipo: "paciente.foto_actualizada" });
  await borrarAnterior(p.fotoKey, ctx.organizationId, id);
  return Response.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contexto(GESTION);
  if (!ctx) return new Response(null, { status: 401 });
  if (!mismoOrigen(req)) return Response.json({ error: "Origen no permitido" }, { status: 403 });
  const { id } = await params;
  const p = await prisma.pacienteTenant.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { fotoKey: true } });
  if (!p) return Response.json({ error: "Paciente no encontrado" }, { status: 404 });
  if (p.fotoKey) {
    await prisma.pacienteTenant.update({ where: { id }, data: { fotoKey: null } });
    await registrarEvento({ organizationId: ctx.organizationId, pacienteId: id, actorId: ctx.usuario.id, tipo: "paciente.foto_eliminada" });
    await borrarAnterior(p.fotoKey, ctx.organizationId, id);
  }
  return Response.json({ ok: true });
}

async function borrarAnterior(key: string | null, organizationId: string, pacienteId: string) {
  if (!key || !claveFotoValida(key, organizationId, pacienteId)) return;
  await s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET_ESTUDIOS, Key: key })).catch((e) => console.error("No se pudo borrar la foto anterior", e));
}
