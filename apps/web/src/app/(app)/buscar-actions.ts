"use server";

import { prisma, type Prisma } from "@dent-view/db";
import { numeroDeBusqueda, numeroOrden } from "@/lib/ordenes";
import { normalizarDocumento } from "@/lib/pacientes";
import { CLINICOS } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

export type Resultado = { tipo: "paciente" | "orden"; id: string; titulo: string; detalle: string };

/** Búsqueda global (⌘K): pacientes por nombre/documento y órdenes por número, siempre dentro del centro activo y según el rol. */
export async function buscarGlobal(texto: string): Promise<Resultado[]> {
  const ctx = await exigirContexto();
  const q = texto.trim().slice(0, 60);
  if (q.length < 2) return [];
  const doc = normalizarDocumento(q);
  const numero = numeroDeBusqueda(q);

  const verPacientes = (CLINICOS as readonly string[]).includes(ctx.rol);
  const where: Prisma.OrdenWhereInput = {
    organizationId: ctx.organizationId,
    ...(ctx.rol === "doctor_remitente" && { doctorRemitenteId: ctx.usuario.id }),
    OR: [
      ...(numero !== null ? [{ numero }] : []),
      { paciente: { nombre: { contains: q, mode: "insensitive" as const } } },
    ],
  };
  const [pacientes, ordenes] = await Promise.all([
    verPacientes
      ? prisma.pacienteTenant.findMany({
          where: {
            organizationId: ctx.organizationId,
            OR: [{ nombre: { contains: q, mode: "insensitive" } }, ...(doc.length >= 3 ? [{ persona: { numeroDocumento: { contains: doc } } }] : [])],
          },
          include: { persona: true },
          orderBy: { nombre: "asc" },
          take: 6,
        })
      : [],
    prisma.orden.findMany({ where, include: { paciente: true }, orderBy: { numero: "desc" }, take: 6 }),
  ]);
  return [
    ...pacientes.map((p) => ({ tipo: "paciente" as const, id: p.id, titulo: p.nombre, detalle: `${p.persona.tipoDocumento} ${p.persona.numeroDocumento}` })),
    ...ordenes.map((o) => ({ tipo: "orden" as const, id: o.id, titulo: `Orden ${numeroOrden(o.numero)}`, detalle: o.paciente.nombre })),
  ];
}
