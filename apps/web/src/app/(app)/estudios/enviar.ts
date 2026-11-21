"use server";

import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { limitarIp } from "@/lib/entrega";
import { claveEnvioEstudio, DIAS_ENLACE_ESTUDIO, MAX_ENVIOS } from "@/lib/entrega-estudio";
import { registrarEvento } from "@/lib/eventos";
import { crearEnlace, encolarEntrega } from "@/lib/resultados";
import { CLINICOS } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

const esquema = z.object({
  estudioId: z.string().min(1),
  destino: z.discriminatedUnion("tipo", [
    z.object({ tipo: z.literal("DOCTOR"), doctorId: z.string().min(1, "Elige un doctor") }),
    z.object({ tipo: z.literal("CORREO"), nombre: z.string().trim().min(2, "Escribe el nombre del destinatario").max(120), correo: z.string().trim().email("Correo no válido").max(160) }),
  ]),
});

export type ResultadoEnvio = { ok: true; yaEnviado?: boolean; enviado: boolean } | { ok: false; error: string };

const porUsuario = new Map<string, number[]>(); // shortcut: en memoria del proceso (ver limitarIp)

/** Comparte un estudio (y su informe emitido, si existe) con un doctor del centro o con un correo libre: enlace + código por correo, sin datos del paciente en el cuerpo. */
export async function enviarEstudio(entrada: z.input<typeof esquema>): Promise<ResultadoEnvio> {
  const ctx = await exigirContexto(CLINICOS);
  const r = esquema.safeParse(entrada);
  if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const { estudioId, destino } = r.data;
  const org = ctx.organizationId;
  if (!limitarIp(porUsuario, ctx.usuario.id, Date.now(), MAX_ENVIOS, 60 * 60_000)) return { ok: false, error: "Demasiados envíos. Inténtalo de nuevo más tarde." };

  const estudio = await prisma.estudio.findFirst({ where: { id: estudioId, organizationId: org } });
  if (!estudio || estudio.estado !== "PUBLICADO" || !estudio.pacienteId) return { ok: false, error: "Solo se envían estudios publicados con paciente" };

  let nombre: string, correo: string, doctorId: string | null = null;
  if (destino.tipo === "DOCTOR") {
    const m = await prisma.member.findFirst({ where: { organizationId: org, userId: destino.doctorId, role: "doctor_remitente" }, include: { user: true } });
    if (!m) return { ok: false, error: "Doctor no válido" };
    nombre = m.user.name; correo = m.user.email; doctorId = m.userId;
  } else {
    nombre = destino.nombre; correo = destino.correo;
  }

  // Idempotencia: el mismo estudio al mismo destino dentro de la ventana no se reenvía (doble clic, reintento).
  const clave = claveEnvioEstudio(estudio.id, correo, Date.now());
  if (await prisma.mensaje.findFirst({ where: { organizationId: org, claveUnica: `${clave}-enlace` }, select: { id: true } })) return { ok: true, yaEnviado: true, enviado: true };

  const [informe, centro, config] = await Promise.all([
    prisma.informe.findFirst({
      where: { organizationId: org, estado: "EMITIDO", vigente: true, pacienteId: estudio.pacienteId, OR: [{ estudioId: estudio.id }, ...(estudio.ordenId ? [{ ordenId: estudio.ordenId }] : [])] },
      orderBy: { emitidoEn: "desc" },
    }),
    prisma.organization.findUniqueOrThrow({ where: { id: org } }),
    prisma.configCentro.findUnique({ where: { organizationId: org } }),
  ]);
  const venceEn = new Date(Date.now() + DIAS_ENLACE_ESTUDIO * 86_400_000);
  const { enlace, token, codigo } = await crearEnlace({
    organizationId: org, pacienteId: estudio.pacienteId, informeId: informe?.id, estudioUids: [estudio.studyInstanceUid],
    tipo: doctorId ? "DOCTOR" : "PACIENTE", nombre, correo, creadoPorId: ctx.usuario.id, venceEn,
  });
  const enviado = await encolarEntrega({
    enlaceId: enlace.id, organizationId: org, pacienteId: estudio.pacienteId, token, codigo, centro: config?.nombre || centro.name,
    paciente: "", destinatario: nombre, venceEn, direccion: correo, generico: true, claveBase: clave,
  });
  await registrarEvento({
    organizationId: org, pacienteId: estudio.pacienteId, actorId: ctx.usuario.id, tipo: "estudio.compartido",
    detalle: { estudioId: estudio.id, enlaceId: enlace.id, destino: destino.tipo, destinatarioId: doctorId, informeId: informe?.id ?? null, vence: venceEn.toISOString(), enviado },
  });
  revalidatePath("/estudios");
  return { ok: true, enviado };
}
