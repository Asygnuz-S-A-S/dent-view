import { prisma } from "@dent-view/db";
import { notFound, redirect } from "next/navigation";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { EditorPresupuesto, type InicialPresupuesto } from "@/components/presupuestos/editor-presupuesto";
import { MAX_DIAS_VIGENCIA, diaIso, esEditable, fechaVigencia, numeroPresupuesto, type EstadoPres } from "@/lib/presupuestos";
import { contextoPresupuestos, opcionesEditor, presupuestoVisible } from "@/lib/presupuestos-servidor";

export const dynamic = "force-dynamic";

export default async function EditarPresupuesto({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoPresupuestos();
  const { id } = await params;
  const p = await presupuestoVisible(ctx, id);
  if (!p) notFound();
  if (!esEditable({ estado: p.estado as EstadoPres })) redirect(`/presupuestos/${id}`); // una enviada es inmutable: se duplica
  const org = ctx.organizationId;
  const [items, paciente, opciones] = await Promise.all([
    prisma.itemPresupuesto.findMany({ where: { presupuestoId: id, organizationId: org }, orderBy: { posicion: "asc" } }),
    prisma.pacienteTenant.findFirst({ where: { id: p.pacienteId, organizationId: org }, select: { nombre: true } }),
    opcionesEditor(org),
  ]);
  const inicial: InicialPresupuesto = {
    id: p.id, pacienteId: p.pacienteId, leadId: p.leadId ?? "", valoracionId: p.valoracionId ?? "", origen: paciente?.nombre ?? null, pedirDocumento: false,
    titulo: p.titulo ?? "", notas: p.notas ?? "", validoHasta: p.validoHasta ? diaIso(p.validoHasta) : fechaVigencia(15), convenioId: "",
    items: items.map((i) => ({
      servicioId: i.servicioId ?? "", descripcion: i.descripcion, cantidad: String(i.cantidad), valor: i.servicioId ? "" : String(i.valorUnitario), descuento: i.descuento ? String(i.descuento) : "",
      fase: String(i.fase), diente: i.diente ? String(i.diente) : "", costo: ctx.esAdmin && i.costoUnitario ? String(i.costoUnitario) : "",
    })),
  };
  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo={`Editar cotización ${numeroPresupuesto(p.numero)}`} descripcion="Solo un borrador se edita; una vez enviada, la cotización no cambia." />
      <EditorPresupuesto inicial={inicial} servicios={opciones.servicios} convenios={opciones.convenios} pacientes={[]} esAdmin={ctx.esAdmin} margenDefault={opciones.margenDefault}
        minFecha={fechaVigencia(0)} maxFecha={fechaVigencia(MAX_DIAS_VIGENCIA)} />
    </div>
  );
}
