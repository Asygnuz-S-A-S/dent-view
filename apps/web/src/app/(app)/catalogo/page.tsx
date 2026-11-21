import { prisma } from "@dent-view/db";
import { CatalogoTabs } from "@/components/catalogo/catalogo-tabs";
import { ADMIN } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";

export const dynamic = "force-dynamic";

export default async function Catalogo() {
  const ctx = await exigirContexto(ADMIN);
  const servicios = await prisma.servicio.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: [{ categoria: "asc" }, { nombre: "asc" }],
  });
  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo="Catálogo y precios" descripcion="Servicios del centro en pesos colombianos. Desactiva en vez de borrar." />
      <CatalogoTabs servicios={servicios.map(({ organizationId: _o, creadoEn: _c, ...s }) => s)} />
    </div>
  );
}
