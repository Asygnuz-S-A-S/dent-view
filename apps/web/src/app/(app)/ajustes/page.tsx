import { prisma } from "@dent-view/db";
import { MarcaCentro } from "@/components/ajustes/marca-centro";
import { SalasAdmin } from "@/components/agenda/salas-admin";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { ADMIN } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

export const dynamic = "force-dynamic";

export default async function Ajustes() {
  const ctx = await exigirContexto(ADMIN);
  const [salas, config, org] = await Promise.all([
    prisma.sala.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { nombre: "asc" } }),
    prisma.configCentro.findUnique({ where: { organizationId: ctx.organizationId }, select: { nombre: true, logo: true, colorPrimario: true } }),
    prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { name: true } }),
  ]);
  return (
    <div className="space-y-8">
      <EncabezadoPagina titulo="Salas y ajustes" descripcion="La marca de tu centro y las salas o equipos donde se toman los estudios." />
      <MarcaCentro nombreOrg={org.name} inicial={{ nombre: config?.nombre ?? "", logo: config?.logo ?? null, color: config?.colorPrimario ?? "" }} />
      <section aria-labelledby="titulo-salas" className="space-y-3">
        <div>
          <h2 id="titulo-salas" className="text-base font-semibold">Salas</h2>
          <p className="text-sm text-muted-foreground">Aparecen como columnas en la agenda.</p>
        </div>
        <SalasAdmin salas={salas.map(({ id, nombre, color, activa }) => ({ id, nombre, color, activa }))} />
      </section>
    </div>
  );
}
