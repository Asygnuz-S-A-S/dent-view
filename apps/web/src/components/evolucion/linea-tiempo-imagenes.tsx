import { prisma } from "@dent-view/db";
import { ScanLine } from "lucide-react";
import { EstadoVacio } from "@/components/comunes/estado-vacio";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { fechaCorta, fechaDeEstudio } from "@/lib/fechas";

/** Radiología: estudios e informes emitidos del paciente por fecha y modalidad (reemplaza la evolución odontológica). */
export async function LineaTiempoImagenes({ organizationId, pacienteId }: { organizationId: string; pacienteId: string }) {
  const [estudios, informes] = await Promise.all([
    prisma.estudio.findMany({ where: { organizationId, pacienteId }, select: { id: true, modalidad: true, descripcion: true, fechaEstudio: true, creadoEn: true } }),
    prisma.informe.findMany({ where: { organizationId, pacienteId, estado: "EMITIDO", vigente: true }, select: { id: true, version: true, emitidoEn: true, creadoEn: true, impresion: true } }),
  ]);
  const items = [
    ...estudios.map((e) => ({ id: `e-${e.id}`, fecha: e.fechaEstudio ?? e.creadoEn, texto: fechaDeEstudio(e), tipo: "Estudio", modalidad: e.modalidad, detalle: e.descripcion })),
    ...informes.map((i) => ({ id: `i-${i.id}`, fecha: i.emitidoEn ?? i.creadoEn, texto: fechaCorta(i.emitidoEn ?? i.creadoEn), tipo: "Informe", modalidad: null as string | null, detalle: i.impresion })),
  ].sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  return (
    <Card aria-label="Línea de tiempo de imágenes"><CardContent className="px-0">
      {items.length === 0 ? <EstadoVacio icono={ScanLine} titulo="Sin estudios ni informes" descripcion="Los estudios y los informes emitidos de este paciente aparecerán aquí por fecha." /> : (
        <ol className="divide-y">
          {items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-6 py-3 text-sm">
              <span className="w-24 shrink-0 tabular-nums text-muted-foreground">{i.texto}</span>
              <Badge variant={i.tipo === "Informe" ? "secondary" : "outline"}>{i.tipo}{i.modalidad ? ` · ${i.modalidad}` : ""}</Badge>
              <span className="min-w-0 flex-1 break-words text-muted-foreground">{i.detalle ? i.detalle.slice(0, 160) : ""}</span>
            </li>
          ))}
        </ol>
      )}
    </CardContent></Card>
  );
}
