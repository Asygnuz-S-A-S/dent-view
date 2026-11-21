"use client";

import { Link2, Link2Off } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { desvincularEstudio, vincularEstudioOrden } from "@/app/(app)/estudios/actions";
import { Button } from "@/components/ui/button";

type E = { id: string; nombre: string };

/** Estudios de una orden: vinculados (con desvincular) y estudios del paciente sin orden (con vincular). */
export function EstudiosOrden({ ordenId, vinculados, disponibles, puedeEditar }: { ordenId: string; vinculados: E[]; disponibles: E[]; puedeEditar: boolean }) {
  const [pendiente, iniciar] = useTransition();
  const ejecutar = (accion: () => ReturnType<typeof vincularEstudioOrden>) =>
    iniciar(async () => {
      const r = await accion();
      if (!r.ok) toast.error(r.error);
    });
  return (
    <div className="space-y-3">
      {vinculados.length === 0 ? <p className="text-muted-foreground">Aún no hay estudios vinculados.</p> : (
        <ul className="space-y-1">
          {vinculados.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2">
              <Link href="/estudios" className="underline-offset-4 hover:underline">{e.nombre}</Link>
              {puedeEditar && <Button size="sm" variant="ghost" disabled={pendiente} onClick={() => ejecutar(() => desvincularEstudio(e.id))}><Link2Off /> Desvincular</Button>}
            </li>
          ))}
        </ul>
      )}
      {puedeEditar && disponibles.length > 0 && (
        <div className="space-y-1 border-t pt-3">
          <p className="text-xs text-muted-foreground">Estudios del paciente sin orden</p>
          <ul className="space-y-1">
            {disponibles.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2">
                <span>{e.nombre}</span>
                <Button size="sm" variant="outline" disabled={pendiente} onClick={() => ejecutar(() => vincularEstudioOrden(e.id, ordenId))}><Link2 /> Vincular</Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
