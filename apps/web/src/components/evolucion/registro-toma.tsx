import { prisma } from "@dent-view/db";
import { ScanLine } from "lucide-react";
import { EstadoVacio } from "@/components/comunes/estado-vacio";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fechaHoraCompleta } from "@/lib/fechas";
import { numeroOrden } from "@/lib/ordenes";
import { FormularioToma } from "./bloque-toma";

/** Registro de toma (radiología): de una orden, o de todo el paciente con selector de orden. Solo inserta; el técnico es quien registra. */
export async function RegistroToma({ organizationId, pacienteId, ordenId, puedeEscribir }: { organizationId: string; pacienteId: string; ordenId?: string; puedeEscribir: boolean }) {
  const [tomas, salas, ordenes] = await Promise.all([
    prisma.registroToma.findMany({ where: { organizationId, pacienteId, ...(ordenId ? { ordenId } : {}) }, orderBy: { tomadoEn: "desc" }, take: 100, include: { sala: { select: { nombre: true } }, orden: { select: { numero: true } } } }),
    puedeEscribir ? prisma.sala.findMany({ where: { organizationId, activa: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }) : [],
    puedeEscribir && !ordenId ? prisma.orden.findMany({ where: { organizationId, pacienteId, estado: { not: "CANCELADA" } }, orderBy: { numero: "desc" }, take: 30, select: { id: true, numero: true } }) : [],
  ]);
  const ids = [...new Set(tomas.map((t) => t.tecnicoId))];
  const tecnicos = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const nombre = new Map(tecnicos.map((u) => [u.id, u.name]));
  return (
    <Card aria-label="Registro de toma">
      <CardHeader><CardTitle><h3>Registro de toma</h3></CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {tomas.length === 0 ? (
          <EstadoVacio icono={ScanLine} titulo="Sin tomas registradas" descripcion="Registra el técnico, la sala y las repeticiones cuando se tome el estudio." />
        ) : (
          <ul className="space-y-2">
            {tomas.map((t) => (
              <li key={t.id} className="rounded-lg border p-3 text-sm">
                <p className="font-medium">{fechaHoraCompleta(t.tomadoEn)} · {nombre.get(t.tecnicoId) ?? "Técnico"}{t.sala ? ` · ${t.sala.nombre}` : ""}{!ordenId && t.orden ? ` · Orden ${numeroOrden(t.orden.numero)}` : ""}</p>
                <p className="text-muted-foreground">Repeticiones: {t.repeticiones}{t.motivoRepeticion ? ` (${t.motivoRepeticion})` : ""}</p>
                {t.incidencias && <p className="whitespace-pre-wrap break-words">{t.incidencias}</p>}
              </li>
            ))}
          </ul>
        )}
        {puedeEscribir && <FormularioToma ordenId={ordenId} ordenes={ordenes.map((o) => ({ id: o.id, etiqueta: numeroOrden(o.numero) }))} salas={salas} />}
      </CardContent>
    </Card>
  );
}
