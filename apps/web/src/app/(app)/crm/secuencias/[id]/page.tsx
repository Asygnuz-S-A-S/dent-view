import { prisma } from "@dent-view/db";
import { notFound } from "next/navigation";
import { Eliminar, Simular, ToggleActiva } from "@/components/crm/acciones-secuencia";
import { EDITOR_VACIO, EditorSecuencia, type EstadoEditor } from "@/components/crm/editor-secuencia";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { leerFiltro, type Etapa } from "@/lib/crm";
import { GESTION } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

export const dynamic = "force-dynamic";

export default async function EditarSecuencia({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirContexto(GESTION);
  const { id } = await params;
  if (id === "nueva") return <div className="space-y-6"><EncabezadoPagina titulo="Nueva secuencia" descripcion="Define cuándo se inscribe a alguien y qué pasa en cada paso." /><EditorSecuencia id={null} inicial={EDITOR_VACIO} /></div>;
  const s = await prisma.secuenciaCRM.findFirst({ where: { id, organizationId: ctx.organizationId }, include: { pasos: { orderBy: { orden: "asc" } } } });
  if (!s) notFound();
  const f = leerFiltro(s.filtro);
  const inicial: EstadoEditor = {
    nombre: s.nombre, descripcion: s.descripcion ?? "", disparador: s.disparador, diasInactividad: s.diasInactividad?.toString() ?? "",
    filtro: { origen: f.origen ?? "", interes: f.interes ?? "", enlace: f.enlace ?? "", transaccional: !!f.transaccional },
    pasos: s.pasos.map((p) => ({ esperaDias: p.esperaDias, esperaHoras: p.esperaHoras, accion: p.accion, asunto: p.asunto ?? "", cuerpo: p.cuerpo ?? "", etapaDestino: (p.etapaDestino ?? "CONTACTADO") as Etapa, tareaTitulo: p.tareaTitulo ?? "" })),
  };
  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo={s.nombre} descripcion="Edita los pasos, simula quién sería contactado hoy y actívala cuando estés lista." acciones={<><ToggleActiva id={s.id} activa={s.activa} nombre={s.nombre} /><Simular id={s.id} /><Eliminar id={s.id} nombre={s.nombre} /></>} />
      <EditorSecuencia id={s.id} inicial={inicial} />
    </div>
  );
}
