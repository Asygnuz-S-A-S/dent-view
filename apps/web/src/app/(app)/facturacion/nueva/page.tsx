import { prisma } from "@dent-view/db";
import { FacturaForm } from "@/components/facturacion/factura-form";
import { numeroOrden } from "@/lib/ordenes";
import { GESTION } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";

export const dynamic = "force-dynamic";

export default async function NuevaFactura({ searchParams }: { searchParams: Promise<{ orden?: string }> }) {
  const ctx = await exigirContexto(GESTION);
  const org = ctx.organizationId;
  const { orden } = await searchParams;

  const [personas, doctores, ordenes] = await Promise.all([
    prisma.pacienteTenant.findMany({ where: { organizationId: org }, include: { persona: true }, orderBy: { nombre: "asc" } }),
    prisma.member.findMany({ where: { organizationId: org, role: "doctor_remitente" }, include: { user: true }, orderBy: { user: { name: "asc" } } }),
    // Órdenes no canceladas sin cuenta de cobro vigente (ABIERTA o PAGADA).
    prisma.orden.findMany({
      where: { organizationId: org, estado: { not: "CANCELADA" }, facturas: { none: { estado: { not: "ANULADA" } } } },
      include: { paciente: { include: { persona: true } }, items: true },
      orderBy: { numero: "desc" },
      take: 200,
    }),
  ]);

  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo="Nueva cuenta de cobro" descripcion="Cuenta de cobro interna, no es factura electrónica DIAN." />
      <FacturaForm
        ordenInicial={ordenes.some((o) => o.id === orden) ? orden : undefined}
        pacientes={personas.map((p) => ({ id: p.id, nombre: p.nombre, documento: `${p.persona.tipoDocumento} ${p.persona.numeroDocumento}` }))}
        doctores={doctores.map((m) => ({ id: m.userId, nombre: m.user.name }))}
        ordenes={ordenes.map((o) => ({
          id: o.id,
          etiqueta: `${numeroOrden(o.numero)} · ${o.paciente.nombre.toLowerCase()}`,
          items: o.items.map((i) => ({ descripcion: i.opciones ? `${i.nombre} (${i.opciones})` : i.nombre, cantidad: 1, valorUnitario: i.precio })),
        }))}
      />
    </div>
  );
}
