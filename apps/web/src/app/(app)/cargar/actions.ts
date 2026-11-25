"use server";

import { prisma } from "@dent-view/db";
import { idsPacientesPorNombre } from "@/lib/busqueda";
import { ESTADOS_ORDEN_CARGA } from "@/lib/estudios-carga";
import { numeroOrden } from "@/lib/ordenes";
import { documentoDeBusqueda } from "@/lib/pacientes";
import { CLINICOS } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

export type PacienteOpcion = { id: string; nombre: string; documento: string };
export type OrdenOpcion = { id: string; etiqueta: string };

/** Pacientes del centro por nombre (sin tildes) o documento, para elegir a quién se cargan los archivos. */
export async function buscarPacientesCarga(texto: string): Promise<PacienteOpcion[]> {
  const ctx = await exigirContexto(CLINICOS);
  const q = texto.trim().slice(0, 60);
  if (q.length < 2) return [];
  const doc = documentoDeBusqueda(q);
  const ids = await idsPacientesPorNombre(ctx.organizationId, q);
  const filas = await prisma.pacienteTenant.findMany({
    where: { organizationId: ctx.organizationId, OR: [{ id: { in: ids } }, ...(doc.length >= 3 ? [{ persona: { numeroDocumento: { contains: doc } } }] : [])] },
    include: { persona: true },
    orderBy: { nombre: "asc" },
    take: 8,
  });
  return filas.map((p) => ({ id: p.id, nombre: p.nombre, documento: `${p.persona.tipoDocumento} ${p.persona.numeroDocumento}` }));
}

/** Órdenes abiertas (solicitada, agendada o tomada) del paciente, dentro del centro. */
export async function ordenesDeCarga(pacienteId: string): Promise<OrdenOpcion[]> {
  const ctx = await exigirContexto(CLINICOS);
  const ordenes = await prisma.orden.findMany({
    where: { organizationId: ctx.organizationId, pacienteId, estado: { in: [...ESTADOS_ORDEN_CARGA] } },
    orderBy: { numero: "desc" },
    select: { id: true, numero: true, estado: true },
  });
  return ordenes.map((o) => ({ id: o.id, etiqueta: `Orden ${numeroOrden(o.numero)} · ${o.estado.toLowerCase()}` }));
}
