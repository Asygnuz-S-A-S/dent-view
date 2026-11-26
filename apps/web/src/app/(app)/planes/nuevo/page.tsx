import { prisma } from "@dent-view/db";
import { notFound } from "next/navigation";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { FormularioPlanManual } from "@/components/planes/formulario-plan-manual";
import { contextoPlanes } from "@/lib/planes-servidor";
import { hoyBogota, resolverPrecio } from "@/lib/precios";

export const dynamic = "force-dynamic";

export default async function NuevoPlan({ searchParams }: { searchParams: Promise<{ paciente?: string }> }) {
  const ctx = await contextoPlanes();
  const { paciente: id } = await searchParams;
  const org = ctx.organizationId;
  const paciente = id ? await prisma.pacienteTenant.findFirst({ where: { id, organizationId: org }, select: { id: true, nombre: true } }) : null;
  if (!paciente) notFound();
  const servicios = await prisma.servicio.findMany({ where: { organizationId: org, activo: true }, orderBy: [{ categoria: "asc" }, { nombre: "asc" }], take: 500 });
  const opciones = servicios.flatMap((s) => {
    const precio = resolverPrecio({ servicio: s, entrega: "DIGITAL", fecha: hoyBogota() }).precio;
    return precio === null ? [] : [{ id: s.id, nombre: s.nombre, precio }];
  });
  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo="Nuevo plan de tratamiento" descripcion={`Para ${paciente.nombre}. Los precios del catálogo de hoy quedan congelados al crear el plan.`} />
      <FormularioPlanManual pacienteId={paciente.id} servicios={opciones} />
    </div>
  );
}
