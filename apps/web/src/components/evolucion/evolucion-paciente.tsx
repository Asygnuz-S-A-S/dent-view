import { prisma } from "@dent-view/db";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { puedeLeerEvolucion } from "@/lib/evolucion";
import { cargarEvoluciones, datosEditor, registrarConsultaHc } from "@/lib/evolucion-servidor";
import { contextoActivo } from "@/lib/sesion";
import { moduloHabilitado } from "@/lib/tipo-centro";
import { tipoDeCentro } from "@/lib/tipo-centro-servidor";
import { EditorBorrador, NuevaEvolucion } from "./editor-borrador";
import { LineaTiempoImagenes } from "./linea-tiempo-imagenes";
import { ListaEvoluciones } from "./lista-evoluciones";
import { RegistroToma } from "./registro-toma";

/** Pestaña de evolución de la ficha: todas las evoluciones del paciente (odontología) o su línea de tiempo de imágenes (radiología). */
export async function EvolucionPaciente({ pacienteId }: { pacienteId: string }) {
  const ctx = await contextoActivo();
  if (!ctx) return null;
  const org = ctx.organizationId;
  if (!(await prisma.pacienteTenant.findFirst({ where: { id: pacienteId, organizationId: org }, select: { id: true } }))) return null;
  const tipo = await tipoDeCentro(org);
  if (tipo === "CENTRO_RADIOLOGICO") {
    if (!puedeLeerEvolucion(ctx.rol)) return null;
    return (
      <div className="space-y-6">
        <LineaTiempoImagenes organizationId={org} pacienteId={pacienteId} />
        <RegistroToma organizationId={org} pacienteId={pacienteId} puedeEscribir />
      </div>
    );
  }
  if (!moduloHabilitado(tipo, "evolucion") || !puedeLeerEvolucion(ctx.rol)) return null;
  await registrarConsultaHc(ctx, pacienteId);
  const [evoluciones, datos] = await Promise.all([cargarEvoluciones(org, pacienteId), datosEditor(ctx, pacienteId, null)]);
  return (
    <section className="space-y-4" aria-label="Evolución clínica del paciente">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Evoluciones firmadas de todas las órdenes y citas. No se editan: las correcciones son adendas.</p>
        <div className="flex flex-wrap items-center gap-2">
          {evoluciones.length > 0 && <Button asChild size="sm" variant="outline"><a href={`/api/evolucion/pdf/${pacienteId}`}><Download /> Historia clínica en PDF</a></Button>}
          {!datos.borrador && <NuevaEvolucion pacienteId={pacienteId} ordenId={null} />}
        </div>
      </div>
      {datos.borrador && <EditorBorrador datos={{ ...datos, borrador: datos.borrador }} />}
      <ListaEvoluciones evoluciones={evoluciones} puedeFirmar={datos.puedeFirmar} pideCodigo={datos.pideCodigo} filtros />
    </section>
  );
}
