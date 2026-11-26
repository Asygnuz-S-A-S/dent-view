import { prisma } from "@dent-view/db";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { EditorPresupuesto, type InicialPresupuesto } from "@/components/presupuestos/editor-presupuesto";
import { alcanceLeads } from "@/lib/crm-datos";
import { DIAS_VIGENCIA, MAX_DIAS_VIGENCIA, borradorDeValoracion, fechaVigencia } from "@/lib/presupuestos";
import { contextoPresupuestos, opcionesEditor } from "@/lib/presupuestos-servidor";
import { filtroValoraciones } from "@/lib/valoraciones";
import { contextoValoraciones } from "@/lib/valoraciones-servidor";

export const dynamic = "force-dynamic";

/** Cotización en blanco, o precargada desde una valoración completada (?valoracion=), un lead (?lead=) o un paciente (?paciente=). */
export default async function NuevoPresupuesto({ searchParams }: { searchParams: Promise<{ valoracion?: string; lead?: string; paciente?: string }> }) {
  const ctx = await contextoPresupuestos();
  const org = ctx.organizationId;
  const q = await searchParams;
  const opciones = await opcionesEditor(org);
  const base: InicialPresupuesto = { id: null, pacienteId: "", leadId: "", valoracionId: "", origen: null, pedirDocumento: false, titulo: "", notas: "", validoHasta: fechaVigencia(DIAS_VIGENCIA), convenioId: "", items: [] };
  let inicial = base;
  let descripcion = "Ítems del catálogo con precio resuelto por el servidor, o ítems libres; luego la envías al paciente con enlace y código.";

  if (q.valoracion) {
    const v = await prisma.valoracion.findFirst({ where: { id: q.valoracion, ...filtroValoraciones(org, ctx.usuario.id, ctx.rol), estado: "COMPLETADA" } });
    const lead = v && !v.pacienteId && v.leadId ? await prisma.lead.findFirst({ where: { id: v.leadId, organizationId: org }, select: { pacienteId: true } }) : null;
    if (v) {
      const clinico = (await contextoValoraciones())?.puedeValorar ?? false;
      inicial = { ...base, ...borradorDeValoracion(v, clinico), pacienteId: v.pacienteId ?? lead?.pacienteId ?? "", leadId: v.leadId ?? "", valoracionId: v.id, origen: v.nombre, pedirDocumento: !v.pacienteId && !!v.leadId && !lead?.pacienteId };
      descripcion = "Precargada desde una valoración completada; el presupuesto estimado queda como nota.";
    }
  } else if (q.lead) {
    const lead = await prisma.lead.findFirst({ where: { id: q.lead, ...alcanceLeads(ctx) } });
    if (lead) inicial = { ...base, titulo: `Cotización de ${lead.nombre}`.slice(0, 120), pacienteId: lead.pacienteId ?? "", leadId: lead.id, origen: lead.nombre, pedirDocumento: !lead.pacienteId };
  } else if (q.paciente) {
    const p = await prisma.pacienteTenant.findFirst({ where: { id: q.paciente, organizationId: org }, select: { id: true, nombre: true } });
    if (p) inicial = { ...base, pacienteId: p.id, origen: p.nombre };
  }
  const pideOrigen = !inicial.pacienteId && !inicial.leadId;
  const pacientes = pideOrigen
    ? (await prisma.pacienteTenant.findMany({ where: { organizationId: org }, include: { persona: true }, orderBy: { nombre: "asc" }, take: 2000 })).map((p) => ({ id: p.id, nombre: p.nombre, documento: `${p.persona.tipoDocumento} ${p.persona.numeroDocumento}` }))
    : [];
  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo="Nueva cotización" descripcion={descripcion} />
      <EditorPresupuesto inicial={inicial} servicios={opciones.servicios} convenios={opciones.convenios} pacientes={pacientes} esAdmin={ctx.esAdmin} margenDefault={opciones.margenDefault}
        minFecha={fechaVigencia(0)} maxFecha={fechaVigencia(MAX_DIAS_VIGENCIA)} />
    </div>
  );
}
