// Implementación independiente (sala limpia) a partir de docs/sala-limpia/03-recordatorios-y-seguimiento.md y 04-notificaciones.md
// Variables de plantilla de cita y generación de recordatorios previos a la cita.
import { prisma } from "@dent-view/db";
import { horaTexto, utcABogota } from "./agenda";
import { encolarMensaje } from "./notificar";

export async function varsCentro(organizationId: string) {
  const [org, cfg] = await Promise.all([prisma.organization.findUnique({ where: { id: organizationId } }), prisma.configCentro.findUnique({ where: { organizationId } })]);
  return { centro: cfg?.nombre || org?.name || "", direccion: cfg?.direccion ?? "", telefono: cfg?.telefono ?? "" };
}

export function varsCita(inicio: Date, paciente: string, centro: { centro: string; direccion: string; telefono: string }) {
  const { fecha, minutos } = utcABogota(inicio);
  return { ...centro, paciente, fecha, hora: horaTexto(minutos) };
}

/**
 * Encola un recordatorio por cita PROGRAMADA que empiece dentro de la ventana (por defecto 24 h).
 * La clave por cita evita duplicados si el proceso corre varias veces. Pensado para ejecutarse cada pocos minutos.
 */
/** Sin organizationId procesa todos los centros (cron); con él, solo ese centro (acción del admin). */
export async function generarRecordatoriosCita(ahora = new Date(), organizationId?: string) {
  const configs = await prisma.configCentro.findMany({ where: organizationId ? { organizationId } : {}, select: { organizationId: true, recordatorioHoras: true } });
  const horas = new Map(configs.map((c) => [c.organizationId, c.recordatorioHoras]));
  const maxH = Math.max(24, ...horas.values());
  const citas = await prisma.cita.findMany({
    where: { ...(organizationId && { organizationId }), estado: "PROGRAMADA", pacienteId: { not: null }, inicio: { gte: ahora, lte: new Date(ahora.getTime() + maxH * 3_600_000) } },
    include: { paciente: { include: { persona: true } } },
  });
  let nuevos = 0;
  const cacheCentros = new Map<string, Awaited<ReturnType<typeof varsCentro>>>();
  for (const c of citas) {
    const h = horas.get(c.organizationId) ?? 24;
    if (c.inicio.getTime() > ahora.getTime() + h * 3_600_000 || !c.paciente) continue;
    if (!cacheCentros.has(c.organizationId)) cacheCentros.set(c.organizationId, await varsCentro(c.organizationId));
    const m = await encolarMensaje({
      organizationId: c.organizationId, tipo: "CITA_RECORDATORIO", pacienteId: c.pacienteId,
      contexto: varsCita(c.inicio, c.paciente.nombre, cacheCentros.get(c.organizationId)!), claveUnica: `cita-recordatorio-${c.id}`,
    });
    if (m) nuevos++;
  }
  return nuevos;
}
