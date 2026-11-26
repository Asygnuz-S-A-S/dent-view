import { prisma } from "@dent-view/db";
import { OrdenForm } from "@/components/ordenes/orden-form";
import { convenioVigente, hoyBogota } from "@/lib/precios";
import { cargarConvenios, cargarTarifasDoctor } from "@/lib/precios-datos";
import { GESTION } from "@/lib/roles";
import { exigirContexto, modulosHabilitadoEnCentro } from "@/lib/sesion";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";

export const dynamic = "force-dynamic";

export default async function NuevaOrden({ searchParams }: { searchParams: Promise<{ paciente?: string; remision?: string; plan?: string }> }) {
  const ctx = await exigirContexto([...GESTION, "doctor_remitente"]);
  const org = ctx.organizationId;
  const esDoctor = ctx.rol === "doctor_remitente";
  const { paciente, remision, plan: planId } = await searchParams;
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

  // Plan de tratamiento activo con ítems pendientes: el indicado en la URL o, si hay paciente, el más reciente del paciente.
  const pacienteElegido = personas.find((p) => p.id === paciente)?.id;
  const planBd = !esDoctor && (planId || pacienteElegido) && (await modulosHabilitadoEnCentro(org, "planes"))
    ? await prisma.planTratamiento.findFirst({
        where: { organizationId: org, estado: "ACTIVO", ...(planId ? { id: planId } : { pacienteId: pacienteElegido }), items: { some: { estado: "PENDIENTE" } } },
        orderBy: { creadoEn: "desc" },
        include: { items: { where: { estado: "PENDIENTE" }, orderBy: [{ fase: "asc" }, { posicion: "asc" }] }, presupuesto: { select: { numero: true } } },
      })
    : null;
  const pacienteInicial = planBd?.pacienteId ?? pacienteElegido;

  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo="Nueva orden de remisión" descripcion="Ficha digital de remisión: selecciona el paciente y los estudios solicitados." />
      <OrdenForm
        esDoctor={esDoctor}
        remisionId={esDoctor ? undefined : remision}
        pacienteInicial={pacienteInicial && personas.some((p) => p.id === pacienteInicial) ? pacienteInicial : undefined}
        plan={planBd ? { id: planBd.id, titulo: planBd.titulo ?? (planBd.presupuesto ? `Cotización P-${String(planBd.presupuesto.numero).padStart(4, "0")}` : "Plan manual"), items: planBd.items.map((i) => ({ id: i.id, descripcion: i.descripcion, diente: i.diente, fase: i.fase, precio: i.precio })) } : undefined}
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
