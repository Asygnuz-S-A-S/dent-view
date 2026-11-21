// Filtros del listado de estudios (puro). El filtro de acceso (`base`, de filtroEstudios) siempre va en un AND:
// ningún parámetro de URL puede ampliar ni sustituir la organización ni la restricción del doctor remitente.
import type { Prisma } from "@dent-view/db";

export const ESTADOS_ESTUDIO = ["POR_ASIGNAR", "ASIGNADO", "PUBLICADO"] as const;
export type EstadoEstudioFiltro = (typeof ESTADOS_ESTUDIO)[number];
export type ParamsEstudios = { tab?: string; q?: string; modalidad?: string; estado?: string; doctor?: string; desde?: string; hasta?: string };

const DIA = /^\d{4}-\d{2}-\d{2}$/;
/** Fecha YYYY-MM-DD válida (como UTC, igual que se muestra fechaEstudio) o null. */
export function diaUtc(v: string | undefined) {
  if (!v || !DIA.test(v)) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : d;
}

export function filtroListadoEstudios(base: Prisma.EstudioWhereInput, p: ParamsEstudios): Prisma.EstudioWhereInput {
  const estado = (ESTADOS_ESTUDIO as readonly string[]).includes(p.estado ?? "") ? (p.estado as EstadoEstudioFiltro) : p.tab === "por-asignar" ? "POR_ASIGNAR" : null;
  const desde = diaUtc(p.desde), hasta = diaUtc(p.hasta);
  const q = (p.q ?? "").trim();
  const fin = hasta && new Date(hasta.getTime() + 86_400_000);
  return {
    AND: [
      base,
      ...(estado ? [{ estado }] : []),
      ...(p.modalidad ? [{ modalidad: p.modalidad }] : []),
      ...(p.doctor ? [{ doctorRemitenteId: p.doctor }] : []),
      ...(desde || fin ? [{ fechaEstudio: { ...(desde && { gte: desde }), ...(fin && { lt: fin }) } }] : []),
      ...(q ? [{ paciente: { OR: [{ nombre: { contains: q, mode: "insensitive" as const } }, { persona: { numeroDocumento: { contains: q } } }] } }] : []),
    ],
  };
}
