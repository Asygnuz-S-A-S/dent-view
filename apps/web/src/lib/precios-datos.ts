import { prisma } from "@dent-view/db";
import type { TarifaEspecial } from "./precios";

export type ConvenioOpcion = {
  id: string;
  nombre: string;
  activo: boolean;
  descuentoGeneral: number | null;
  vigenteDesde: string | null;
  vigenteHasta: string | null;
  /** servicioId → tarifa especial del convenio */
  tarifas: Record<string, TarifaEspecial>;
};
/** doctorId → servicioId → tarifa especial */
export type TarifasDoctor = Record<string, Record<string, TarifaEspecial>>;

const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const aMapa = (l: { servicioId: string; precioImpreso: number | null; precioDigital: number | null }[]) =>
  Object.fromEntries(l.map((t) => [t.servicioId, { precioImpreso: t.precioImpreso, precioDigital: t.precioDigital }]));

/** Convenios activos del centro con sus tarifas (la vigencia la evalúa resolverPrecio). */
export async function cargarConvenios(organizationId: string, id?: string): Promise<ConvenioOpcion[]> {
  const l = await prisma.convenio.findMany({
    where: { organizationId, activo: true, ...(id ? { id } : {}) },
    include: { tarifas: true },
    orderBy: { nombre: "asc" },
  });
  return l.map((c) => ({
    id: c.id, nombre: c.nombre, activo: c.activo, descuentoGeneral: c.descuentoGeneral,
    vigenteDesde: dia(c.vigenteDesde), vigenteHasta: dia(c.vigenteHasta), tarifas: aMapa(c.tarifas),
  }));
}

export async function cargarTarifasDoctor(organizationId: string, doctorIds: string[]): Promise<TarifasDoctor> {
  if (!doctorIds.length) return {};
  const l = await prisma.tarifaEspecial.findMany({ where: { organizationId, doctorId: { in: doctorIds } } });
  const r: TarifasDoctor = {};
  for (const t of l) (r[t.doctorId!] ??= {})[t.servicioId] = { precioImpreso: t.precioImpreso, precioDigital: t.precioDigital };
  return r;
}
