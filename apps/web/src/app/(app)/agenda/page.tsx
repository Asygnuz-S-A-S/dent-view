import { prisma } from "@dent-view/db";
import { AgendaDia } from "@/components/agenda/agenda-dia";
import { bogotaAUtc, esFecha, hoyBogota, utcABogota } from "@/lib/agenda";
import { CLINICOS } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";

export const dynamic = "force-dynamic";

export default async function Agenda({ searchParams }: { searchParams: Promise<{ fecha?: string; orden?: string }> }) {
  const ctx = await exigirContexto(CLINICOS);
  const org = ctx.organizationId;
  const { fecha: f, orden: ordenId } = await searchParams;
  const fecha = esFecha(f) ? f : hoyBogota();

  const [salas, citas, pacientes, ordenes] = await Promise.all([
    prisma.sala.findMany({ where: { organizationId: org, activa: true }, orderBy: { nombre: "asc" } }),
    prisma.cita.findMany({
      where: { organizationId: org, inicio: { gte: bogotaAUtc(fecha, 0), lt: bogotaAUtc(fecha, 24 * 60) } },
      include: { paciente: { include: { persona: true } }, orden: { include: { items: true } } },
    }),
    prisma.pacienteTenant.findMany({ where: { organizationId: org }, include: { persona: true }, orderBy: { nombre: "asc" } }),
    prisma.orden.findMany({
      where: { organizationId: org, estado: { in: ["SOLICITADA", "AGENDADA", "TOMADA"] } },
      include: { items: true },
      orderBy: { numero: "desc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo="Agenda" descripcion="Citas por sala. Toca una franja libre para agendar." />
      <AgendaDia
        fecha={fecha}
        hoy={hoyBogota()}
        salas={salas.map((s) => ({ id: s.id, nombre: s.nombre, color: s.color }))}
        pacientes={pacientes.map((p) => ({ id: p.id, nombre: p.nombre, documento: `${p.persona.tipoDocumento} ${p.persona.numeroDocumento}` }))}
        alertasPacientes={Object.fromEntries(pacientes.flatMap((p) => (p.alertas ? [[p.id, p.alertas]] : [])))}
        // /agenda?orden=<id> abre «Nueva cita» con ese paciente y orden.
        ordenInicial={ordenes.find((o) => o.id === ordenId)?.id ?? null}
        ordenes={ordenes.map((o) => ({ id: o.id, numero: o.numero, pacienteId: o.pacienteId, servicios: o.items.map((i) => i.nombre) }))}
        citas={citas.map((c) => ({
          id: c.id,
          salaId: c.salaId,
          pacienteId: c.pacienteId ?? "",
          pacienteNombre: c.paciente?.nombre ?? "Sin paciente",
          ordenId: c.ordenId,
          servicios: c.orden?.items.map((i) => i.nombre) ?? [],
          inicioMin: utcABogota(c.inicio).minutos,
          duracion: Math.round((c.fin.getTime() - c.inicio.getTime()) / 60_000),
          estado: c.estado,
          notas: c.notas,
          alertas: c.paciente?.alertas ?? null,
        }))}
      />
    </div>
  );
}
