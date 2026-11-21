import { prisma } from "@dent-view/db";
import { ConveniosLista } from "@/components/convenios/convenios-lista";
import { SelectorDoctor } from "@/components/convenios/selector-doctor";
import { TarifasTabla } from "@/components/convenios/tarifas-tabla";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cargarTarifasDoctor } from "@/lib/precios-datos";
import { ADMIN } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";

export const dynamic = "force-dynamic";

export default async function Convenios({ searchParams }: { searchParams: Promise<{ tab?: string; doctor?: string }> }) {
  const ctx = await exigirContexto(ADMIN);
  const org = ctx.organizationId;
  const { tab, doctor } = await searchParams;
  const [convenios, miembros, servicios] = await Promise.all([
    prisma.convenio.findMany({ where: { organizationId: org }, include: { _count: { select: { tarifas: true } } }, orderBy: [{ activo: "desc" }, { nombre: "asc" }] }),
    prisma.member.findMany({ where: { organizationId: org, role: "doctor_remitente" }, include: { user: true }, orderBy: { user: { name: "asc" } } }),
    prisma.servicio.findMany({ where: { organizationId: org, activo: true }, orderBy: [{ categoria: "asc" }, { nombre: "asc" }] }),
  ]);
  const doctores = miembros.map((m) => ({ id: m.userId, nombre: m.user.name }));
  const elegido = doctores.find((d) => d.id === doctor);
  const tarifas = elegido ? ((await cargarTarifasDoctor(org, [elegido.id]))[elegido.id] ?? {}) : {};
  const dia = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;

  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo="Convenios y tarifas" descripcion="Precios especiales por convenio o por doctor remitente. La tarifa del doctor tiene prioridad sobre la del convenio." />
      <Tabs defaultValue={tab === "doctores" ? "doctores" : "convenios"} className="space-y-4">
        <TabsList>
          <TabsTrigger value="convenios">Convenios</TabsTrigger>
          <TabsTrigger value="doctores">Tarifas por doctor</TabsTrigger>
        </TabsList>
        <TabsContent value="convenios" className="space-y-4">
          <ConveniosLista
            convenios={convenios.map((c) => ({
              id: c.id, nombre: c.nombre, nit: c.nit, contacto: c.contacto, descuentoGeneral: c.descuentoGeneral, activo: c.activo,
              vigenteDesde: dia(c.vigenteDesde), vigenteHasta: dia(c.vigenteHasta), tarifas: c._count.tarifas,
            }))}
          />
        </TabsContent>
        <TabsContent value="doctores" className="space-y-4">
          {doctores.length === 0 ? (
            <p className="text-sm text-muted-foreground">El centro aún no tiene doctores remitentes.</p>
          ) : (
            <SelectorDoctor doctores={doctores} actual={elegido?.id} />
          )}
          {elegido && <TarifasTabla key={elegido.id} destino={{ doctorId: elegido.id }} servicios={servicios} tarifas={tarifas} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
