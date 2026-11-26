import { prisma } from "@dent-view/db";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { puedeLeerEvolucion } from "@/lib/evolucion";
import { cargarEvoluciones, datosEditor, registrarConsultaHc } from "@/lib/evolucion-servidor";
import { CLINICOS } from "@/lib/roles";
import { contextoActivo } from "@/lib/sesion";
import { moduloHabilitado } from "@/lib/tipo-centro";
import { tipoDeCentro } from "@/lib/tipo-centro-servidor";
import { EditorBorrador, NuevaEvolucion } from "./editor-borrador";
import { ListaEvoluciones } from "./lista-evoluciones";
import { RegistroToma } from "./registro-toma";

/**
 * Evolución de una orden. Odontología: evoluciones firmadas de la orden + borrador + nueva evolución (solo MEDICOS).
 * Centro radiológico: no hay evolución odontológica; muestra el registro de toma.
 */
export async function EvolucionOrden({ ordenId, pacienteId, puedeEscribir }: { ordenId: string; pacienteId: string; puedeEscribir: boolean }) {
  const ctx = await contextoActivo();
  if (!ctx) return null;
  const org = ctx.organizationId;
  if (!(await prisma.orden.findFirst({ where: { id: ordenId, organizationId: org, pacienteId }, select: { id: true } }))) return null;
  const tipo = await tipoDeCentro(org);

  if (tipo === "CENTRO_RADIOLOGICO") {
    if (!(CLINICOS as readonly string[]).includes(ctx.rol)) return null;
    return <RegistroToma organizationId={org} pacienteId={pacienteId} ordenId={ordenId} puedeEscribir={puedeEscribir} />;
  }

  if (!moduloHabilitado(tipo, "evolucion") || !puedeLeerEvolucion(ctx.rol)) return null;
  await registrarConsultaHc(ctx, pacienteId);
  const [evoluciones, datos] = await Promise.all([cargarEvoluciones(org, pacienteId, ordenId), datosEditor(ctx, pacienteId, ordenId)]);
  return (
    <section className="space-y-4" aria-label="Evolución clínica de la orden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Evolución clínica</h2>
        <div className="flex flex-wrap items-center gap-2">
          {evoluciones.length > 0 && <Button asChild size="sm" variant="outline"><a href={`/api/evolucion/pdf/orden/${ordenId}`}><Download /> Descargar PDF</a></Button>}
          {puedeEscribir && !datos.borrador && <NuevaEvolucion pacienteId={pacienteId} ordenId={ordenId} />}
        </div>
      </div>
      {puedeEscribir && datos.borrador && <EditorBorrador datos={{ ...datos, borrador: datos.borrador }} />}
      <ListaEvoluciones evoluciones={evoluciones} puedeFirmar={puedeEscribir && datos.puedeFirmar} pideCodigo={datos.pideCodigo} />
    </section>
  );
}
