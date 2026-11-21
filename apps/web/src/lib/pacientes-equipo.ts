// Equipo tratante derivado de las órdenes y estudios del paciente (sin I/O para poder probarlo).
export type OrdenEquipo = { doctorRemitenteId: string | null; creadoEn: Date; items: { nombre: string }[] };
export type EstudioEquipo = { doctorRemitenteId: string | null };
export type ParticipacionDoctor = { doctorId: string; ordenes: number; estudios: number; primera: Date | null; ultima: Date | null; servicios: string[] };

/** Un registro por doctor remitente: órdenes, estudios, primera/última orden y servicios solicitados. Más órdenes primero. */
export function derivarEquipo(ordenes: OrdenEquipo[], estudios: EstudioEquipo[]): ParticipacionDoctor[] {
  const por = new Map<string, ParticipacionDoctor>();
  const de = (id: string) => por.get(id) ?? por.set(id, { doctorId: id, ordenes: 0, estudios: 0, primera: null, ultima: null, servicios: [] }).get(id)!;
  for (const o of ordenes) {
    if (!o.doctorRemitenteId) continue;
    const d = de(o.doctorRemitenteId);
    d.ordenes++;
    if (!d.primera || o.creadoEn < d.primera) d.primera = o.creadoEn;
    if (!d.ultima || o.creadoEn > d.ultima) d.ultima = o.creadoEn;
    for (const i of o.items) if (!d.servicios.includes(i.nombre)) d.servicios.push(i.nombre);
  }
  for (const e of estudios) if (e.doctorRemitenteId) de(e.doctorRemitenteId).estudios++;
  return [...por.values()].sort((a, b) => b.ordenes - a.ordenes || a.doctorId.localeCompare(b.doctorId));
}
