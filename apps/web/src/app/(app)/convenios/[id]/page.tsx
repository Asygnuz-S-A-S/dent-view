import { prisma } from "@dent-view/db";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TarifasTabla } from "@/components/convenios/tarifas-tabla";
import { Badge } from "@/components/ui/badge";
import { ADMIN } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

export const dynamic = "force-dynamic";

export default async function DetalleConvenio({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirContexto(ADMIN);
  const { id } = await params;
  const convenio = await prisma.convenio.findFirst({ where: { id, organizationId: ctx.organizationId }, include: { tarifas: true } });
  if (!convenio) notFound();
  const servicios = await prisma.servicio.findMany({ where: { organizationId: ctx.organizationId, activo: true }, orderBy: [{ categoria: "asc" }, { nombre: "asc" }] });
  const tarifas = Object.fromEntries(convenio.tarifas.map((t) => [t.servicioId, { precioImpreso: t.precioImpreso, precioDigital: t.precioDigital }]));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href="/convenios" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"><ArrowLeft className="size-4" /> Convenios</Link>
        <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
          {convenio.nombre} {!convenio.activo && <Badge variant="secondary">Inactivo</Badge>}
        </h1>
        <p className="text-sm text-muted-foreground">
          {convenio.descuentoGeneral ? `Descuento general ${convenio.descuentoGeneral} % sobre el catálogo en los servicios sin tarifa propia. ` : "Sin descuento general. "}
          Deja un precio vacío para usar el del catálogo (o el descuento general).
        </p>
      </div>
      <TarifasTabla destino={{ convenioId: convenio.id }} servicios={servicios} tarifas={tarifas} />
    </div>
  );
}
