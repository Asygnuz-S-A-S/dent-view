import { prisma } from "@dent-view/db";
import { Link2 } from "lucide-react";
import Link from "next/link";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { EstadoVacio } from "@/components/comunes/estado-vacio";
import { NuevaRemisionForm } from "@/components/remisiones/nueva-remision-form";
import { Button } from "@/components/ui/button";
import { TEXTO_CONSENTIMIENTO_REMISION } from "@/lib/remisiones";
import { CLINICOS } from "@/lib/roles";
import { exigirContexto, exigirModulo } from "@/lib/sesion";

export const dynamic = "force-dynamic";

export default async function NuevaRemision({ searchParams }: { searchParams: Promise<{ paciente?: string }> }) {
  const ctx = await exigirContexto(CLINICOS);
  await exigirModulo(ctx, "remisiones");
  const org = ctx.organizationId;
  const { paciente: pacienteId } = await searchParams;
  const paciente = pacienteId
    ? await prisma.pacienteTenant.findFirst({ where: { id: pacienteId, organizationId: org }, select: { id: true, nombre: true, persona: { select: { tipoDocumento: true, numeroDocumento: true } } } })
    : null;
  if (!paciente) {
    return (
      <div className="space-y-6">
        <EncabezadoPagina titulo="Remitir a otro centro" />
        <EstadoVacio titulo="Elige un paciente" descripcion="Abre la ficha del paciente y usa el botón Remitir a otro centro." accion={<Button asChild variant="outline"><Link href="/pacientes">Ir a pacientes</Link></Button>} />
      </div>
    );
  }
  // Solo destinos con vínculo ACTIVO en el que este centro es el solicitante.
  const vinculos = await prisma.vinculoCentro.findMany({ where: { solicitanteId: org, estado: "ACTIVO" }, select: { receptor: { select: { id: true, name: true } } }, orderBy: { receptor: { name: "asc" } } });
  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo="Remitir a otro centro" descripcion={`${paciente.nombre} · ${paciente.persona.tipoDocumento} ${paciente.persona.numeroDocumento}`} />
      {vinculos.length === 0 ? (
        <EstadoVacio icono={Link2} titulo="Aún no tienes centros vinculados" descripcion="Un administrador debe solicitar el vínculo con el otro centro y esperar su aceptación." accion={ctx.rol === "admin_tenant" ? <Button asChild variant="outline"><Link href="/remisiones/vinculos">Ir a vínculos</Link></Button> : undefined} />
      ) : (
        <NuevaRemisionForm pacienteId={paciente.id} destinos={vinculos.map((v) => ({ id: v.receptor.id, nombre: v.receptor.name }))} textoConsentimiento={TEXTO_CONSENTIMIENTO_REMISION} />
      )}
    </div>
  );
}
