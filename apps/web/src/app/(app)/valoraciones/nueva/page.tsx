import { prisma } from "@dent-view/db";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { NuevaSolicitud } from "@/components/valoraciones/nueva-solicitud";
import { exigirContexto } from "@/lib/sesion";
import { ROLES_CREAR_VALORACION } from "@/lib/valoraciones";
import { odontologosDelCentro } from "@/lib/valoraciones-servidor";

export const dynamic = "force-dynamic";

export default async function NuevaValoracion({ searchParams }: { searchParams: Promise<{ paciente?: string; lead?: string }> }) {
  const ctx = await exigirContexto(ROLES_CREAR_VALORACION);
  const org = ctx.organizationId;
  const { paciente, lead: leadId } = await searchParams;
  const [pacientes, odontologos, lead] = await Promise.all([
    prisma.pacienteTenant.findMany({ where: { organizationId: org }, include: { persona: true }, orderBy: { nombre: "asc" }, take: 2000 }),
    odontologosDelCentro(org),
    leadId ? prisma.lead.findFirst({ where: { id: leadId, organizationId: org } }) : null,
  ]);
  const elegido = pacientes.find((p) => p.id === paciente);
  const inicial = lead
    ? { nombre: lead.nombre, telefono: lead.telefono ?? "", correo: lead.correo ?? "", ciudad: lead.ciudad ?? "", pacienteId: "", leadId: lead.id }
    : { nombre: elegido?.nombre ?? "", telefono: elegido?.celular ?? "", correo: elegido?.correo ?? "", ciudad: "", pacienteId: elegido?.id ?? "", leadId: "" };
  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo="Nueva valoración virtual" descripcion="El paciente sube fotos y un video guiados desde su celular, sin viajar; el odontólogo entrega una valoración a distancia." />
      <NuevaSolicitud
        pacientes={pacientes.map((p) => ({ id: p.id, nombre: p.nombre, documento: `${p.persona.tipoDocumento} ${p.persona.numeroDocumento}`, correo: p.correo ?? "", celular: p.celular ?? "", ciudad: "" }))}
        odontologos={odontologos.map((o) => ({ id: o.userId, nombre: o.user.name }))}
        inicial={inicial}
      />
    </div>
  );
}
