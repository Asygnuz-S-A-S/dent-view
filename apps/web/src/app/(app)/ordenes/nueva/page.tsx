import { prisma } from "@dent-view/db";
import { OrdenForm } from "@/components/ordenes/orden-form";
import { convenioVigente, hoyBogota } from "@/lib/precios";
import { cargarConvenios, cargarTarifasDoctor } from "@/lib/precios-datos";
import { GESTION } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";

export const dynamic = "force-dynamic";

export default async function NuevaOrden({ searchParams }: { searchParams: Promise<{ paciente?: string }> }) {
  const ctx = await exigirContexto([...GESTION, "doctor_remitente"]);
  const org = ctx.organizationId;
  const esDoctor = ctx.rol === "doctor_remitente";
  const { paciente } = await searchParams;
  const fecha = hoyBogota();

  const [personas, doctores, servicios] = await Promise.all([
    prisma.pacienteTenant.findMany({
      // Un doctor remitente solo ve a los pacientes de sus propias órdenes (más los que cree en el momento).
      where: { organizationId: org, ...(esDoctor ? { ordenes: { some: { doctorRemitenteId: ctx.usuario.id } } } : {}) },
      include: { persona: true },
      orderBy: { nombre: "asc" },
    }),
    esDoctor
      ? []
      : prisma.member.findMany({ where: { organizationId: org, role: "doctor_remitente" }, include: { user: true }, orderBy: { user: { name: "asc" } } }),
    prisma.servicio.findMany({ where: { organizationId: org, activo: true }, orderBy: { nombre: "asc" } }),
  ]);

  const [convenios, tarifasDoctor] = await Promise.all([
    esDoctor ? [] : cargarConvenios(org).then((l) => l.filter((c) => convenioVigente(c, fecha))),
    cargarTarifasDoctor(org, esDoctor ? [ctx.usuario.id] : doctores.map((m) => m.userId)),
  ]);

  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo="Nueva orden de remisión" descripcion="Ficha digital de remisión: selecciona el paciente y los estudios solicitados." />
      <OrdenForm
        esDoctor={esDoctor}
        pacienteInicial={personas.some((p) => p.id === paciente) ? paciente : undefined}
        pacientes={personas.map((p) => ({ id: p.id, nombre: p.nombre, documento: `${p.persona.tipoDocumento} ${p.persona.numeroDocumento}` }))}
        convenios={convenios}
        tarifasDoctor={tarifasDoctor}
        doctorPropioId={esDoctor ? ctx.usuario.id : undefined}
        fecha={fecha}
        doctores={doctores.map((m) => ({ id: m.userId, nombre: m.user.name }))}
        servicios={servicios.map(({ id, categoria, nombre, descripcion, precioImpreso, precioDigital, descuento }) => ({
          id, categoria, nombre, descripcion, precioImpreso, precioDigital, descuento,
        }))}
      />
    </div>
  );
}
