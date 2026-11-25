import { prisma } from "@dent-view/db";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { CargarEstudios } from "@/components/estudios/cargar-estudios";
import { CLINICOS } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";
import { ordenesDeCarga } from "./actions";

export const dynamic = "force-dynamic";

export default async function CargarPagina({ searchParams }: { searchParams: Promise<{ pacienteId?: string; ordenId?: string }> }) {
  const ctx = await exigirContexto(CLINICOS);
  const { pacienteId, ordenId } = await searchParams;
  const p = pacienteId ? await prisma.pacienteTenant.findFirst({ where: { id: pacienteId, organizationId: ctx.organizationId }, include: { persona: true } }) : null;
  const ordenes = p ? await ordenesDeCarga(p.id) : [];
  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo="Cargar estudios" descripcion="Sube fotografías, radiografías, estudios DICOM y órdenes médicas de un paciente." />
      <CargarEstudios
        inicial={p ? { id: p.id, nombre: p.nombre, documento: `${p.persona.tipoDocumento} ${p.persona.numeroDocumento}` } : null}
        ordenesIniciales={ordenes}
        ordenInicial={ordenes.some((o) => o.id === ordenId) ? ordenId! : ""}
      />
    </div>
  );
}
