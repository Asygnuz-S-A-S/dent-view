"use server";

import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DIAS_VENCIMIENTO } from "@/lib/entrega";
import { registrarEvento } from "@/lib/eventos";
import { crearEnlace, encolarEntrega, urlBase } from "@/lib/resultados";
import { CLINICOS } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

const esquema = z.object({
  informeId: z.string().min(1).optional(),
  estudioId: z.string().min(1).optional(),
  nombre: z.string().trim().min(2, "Escribe el nombre del destinatario").max(120),
  correo: z.union([z.literal(""), z.string().trim().email("Correo no válido").max(160)]),
  dias: z.number().int("El vencimiento debe ser un número entero de días").min(1, "El vencimiento es de 1 a 90 días").max(90, "El vencimiento es de 1 a 90 días").default(DIAS_VENCIMIENTO),
});

export type ResultadoEntrega = { error: string } | { enlace: string; codigo: string; enviado: boolean; venceEn: string };

/** Entrega al paciente desde un informe emitido o un estudio publicado. El token y el código en claro se devuelven una sola vez. */
export async function entregarResultados(entrada: z.input<typeof esquema>): Promise<ResultadoEntrega> {
  const ctx = await exigirContexto(CLINICOS);
  const r = esquema.safeParse(entrada);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const { informeId, estudioId, nombre, correo, dias } = r.data;
  const org = ctx.organizationId;
  if (!informeId && !estudioId) return { error: "Falta el informe o el estudio" };

  let informe = informeId ? await prisma.informe.findFirst({ where: { id: informeId, organizationId: org } }) : null;
  if (informeId && (!informe || informe.estado !== "EMITIDO")) return { error: "Solo se entregan informes emitidos" };
  const estudio = estudioId ? await prisma.estudio.findFirst({ where: { id: estudioId, organizationId: org } }) : null;
  if (estudioId && (!estudio || estudio.estado !== "PUBLICADO" || !estudio.pacienteId)) return { error: "Solo se entregan estudios publicados con paciente" };
  const pacienteId = (informe?.pacienteId ?? estudio?.pacienteId)!;
  if (!informe && estudio) {
    informe = await prisma.informe.findFirst({
      where: { organizationId: org, estado: "EMITIDO", vigente: true, pacienteId, OR: [{ estudioId: estudio.id }, ...(estudio.ordenId ? [{ ordenId: estudio.ordenId }] : [])] },
      orderBy: { emitidoEn: "desc" },
    });
  }
  const estudios = estudio
    ? [estudio]
    : await prisma.estudio.findMany({ where: { organizationId: org, pacienteId, OR: [...(informe?.estudioId ? [{ id: informe.estudioId }] : []), ...(informe?.ordenId ? [{ ordenId: informe.ordenId }] : [])] } });
  if (!informe && estudios.length === 0) return { error: "No hay nada que entregar" };

  const [pac, centro, config] = await Promise.all([
    prisma.pacienteTenant.findFirstOrThrow({ where: { id: pacienteId, organizationId: org }, include: { persona: true } }),
    prisma.organization.findUniqueOrThrow({ where: { id: org } }),
    prisma.configCentro.findUnique({ where: { organizationId: org } }),
  ]);
  const venceEn = new Date(Date.now() + dias * 86_400_000);
  const { enlace, token, codigo } = await crearEnlace({
    organizationId: org, pacienteId, informeId: informe?.id, estudioUids: estudios.map((e) => e.studyInstanceUid),
    tipo: "PACIENTE", nombre, correo: correo || null, creadoPorId: ctx.usuario.id, venceEn,
  });
  const enviado = correo
    ? await encolarEntrega({
        enlaceId: enlace.id, organizationId: org, pacienteId, token, codigo, centro: config?.nombre || centro.name, paciente: pac.nombre,
        destinatario: nombre, venceEn, direccion: correo === pac.correo ? null : correo,
      })
    : false;
  await registrarEvento({ organizationId: org, pacienteId, actorId: ctx.usuario.id, tipo: "resultados.entregados", detalle: { enlaceId: enlace.id, informeId: informe?.id ?? null, estudios: estudios.length, vence: venceEn.toISOString(), enviado } });
  revalidatePath("/informes/" + (informe?.id ?? ""));
  revalidatePath(`/pacientes/${pacienteId}`);
  return { enlace: `${urlBase()}/resultados/${token}`, codigo, enviado, venceEn: venceEn.toISOString() };
}

export async function revocarEnlace(id: string): Promise<{ error?: string }> {
  const ctx = await exigirContexto(CLINICOS);
  // Revoca también los enlaces que el paciente derivó a un doctor desde este.
  const { count } = await prisma.enlaceEntrega.updateMany({
    where: { organizationId: ctx.organizationId, revocadoEn: null, OR: [{ id }, { origenId: id }] },
    data: { revocadoEn: new Date() },
  });
  if (!count) return { error: "Enlace no encontrado o ya revocado" };
  const e = await prisma.enlaceEntrega.findFirst({ where: { id, organizationId: ctx.organizationId } });
  await registrarEvento({ organizationId: ctx.organizationId, pacienteId: e?.pacienteId, actorId: ctx.usuario.id, tipo: "resultados.revocados", detalle: { enlaceId: id } });
  if (e?.informeId) revalidatePath(`/informes/${e.informeId}`);
  if (e) revalidatePath(`/pacientes/${e.pacienteId}`);
  return {};
}
