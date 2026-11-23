import { prisma } from "@dent-view/db";
import Link from "next/link";
import { TareaCheck } from "@/components/crm/ficha-lead";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { EstadoVacio } from "@/components/comunes/estado-vacio";
import { FiltrosUrl } from "@/components/comunes/filtros-url";
import { Badge } from "@/components/ui/badge";
import { cargarResponsables, esGestion } from "@/lib/crm-datos";
import { fechaCorta, fechaIso } from "@/lib/fechas";
import { CLINICOS } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

export const dynamic = "force-dynamic";

export default async function Tareas({ searchParams }: { searchParams: Promise<{ responsable?: string }> }) {
  const ctx = await exigirContexto(CLINICOS);
  const gestion = esGestion(ctx.rol);
  const { responsable } = await searchParams;
  const responsables = gestion ? await cargarResponsables(ctx.organizationId) : [];
  const asignado = gestion ? (responsable === "sin" ? null : responsable || undefined) : ctx.usuario.id;
  const tareas = await prisma.tareaCRM.findMany({
    where: { organizationId: ctx.organizationId, estado: "PENDIENTE", ...(asignado !== undefined ? { asignadoId: asignado } : {}) },
    orderBy: [{ vence: "asc" }, { creadoEn: "asc" }], take: 300,
    include: { lead: { select: { id: true, nombre: true } }, paciente: { select: { id: true, nombre: true } }, asignado: { select: { name: true } } },
  });
  const hoy = fechaIso(new Date());
  const grupo = (t: (typeof tareas)[number]) => (!t.vence ? "sin" : fechaIso(t.vence) < hoy ? "vencidas" : fechaIso(t.vence) === hoy ? "hoy" : "proximas");
  const grupos = [["vencidas", "Vencidas"], ["hoy", "Para hoy"], ["proximas", "Próximas"], ["sin", "Sin fecha"]] as const;

  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo="Tareas del CRM" descripcion={gestion ? "Pendientes de seguimiento, manuales y automáticas. Marca cada una cuando la hagas." : "Tus pendientes de seguimiento."} />
      {gestion && <FiltrosUrl filtros={[{ tipo: "select", clave: "responsable", etiqueta: "Responsable", todos: "Todos los responsables", opciones: [{ valor: "sin", texto: "Sin asignar" }, ...responsables.map((r) => ({ valor: r.id, texto: r.nombre }))], ancho: "w-56" }]} />}
      {tareas.length === 0 ? <EstadoVacio titulo="No hay tareas pendientes" descripcion="Las tareas se crean desde la ficha de cada lead o automáticamente desde las secuencias." /> : (
        grupos.map(([clave, titulo]) => {
          const items = tareas.filter((t) => grupo(t) === clave);
          return items.length ? (
            <section key={clave} aria-labelledby={`g-${clave}`} className="space-y-2">
              <h2 id={`g-${clave}`} className="text-sm font-semibold">{titulo} <span className="font-normal text-muted-foreground tabular-nums">{items.length}</span></h2>
              <ul className="divide-y rounded-lg border bg-card">
                {items.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <TareaCheck id={t.id} titulo={t.titulo} hecha={false} />
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {t.automatica && <Badge variant="secondary">Automática</Badge>}
                      {t.vence && <span className={clave === "vencidas" ? "text-danger-ink" : ""}>{fechaCorta(t.vence)}</span>}
                      {t.asignado && <span>{t.asignado.name}</span>}
                      {t.lead && <Link className="underline" href={`/crm/leads/${t.lead.id}`}>{t.lead.nombre}</Link>}
                      {t.paciente && <Link className="underline" href={`/pacientes/${t.paciente.id}`}>{t.paciente.nombre}</Link>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null;
        })
      )}
    </div>
  );
}
