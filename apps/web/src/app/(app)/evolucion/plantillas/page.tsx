import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { EditorPlantillas } from "@/components/evolucion/editor-plantilla";
import { plantillasVigentes } from "@/lib/evolucion-servidor";
import { ADMIN } from "@/lib/roles";
import { exigirContexto, exigirModulo } from "@/lib/sesion";

export const dynamic = "force-dynamic";

export default async function PlantillasEvolucion() {
  const ctx = await exigirContexto(ADMIN);
  await exigirModulo(ctx, "evolucion");
  const plantillas = await plantillasVigentes(ctx.organizationId);
  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo="Plantillas de evolución" descripcion="Campos guiados por especialidad. Cada cambio crea una versión nueva; las evoluciones firmadas conservan la que usaron." />
      <EditorPlantillas plantillas={plantillas} />
    </div>
  );
}
