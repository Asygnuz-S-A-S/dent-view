import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Estado vacío: qué falta y qué hacer a continuación. */
export function EstadoVacio({ icono: Icono, titulo, descripcion, accion, className }: {
  icono?: LucideIcon;
  titulo: string;
  descripcion?: ReactNode;
  accion?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 px-6 py-10 text-center", className)}>
      {Icono && (
        <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icono className="size-5" aria-hidden />
        </div>
      )}
      <p className="text-sm font-medium">{titulo}</p>
      {descripcion && <p className="max-w-sm text-sm text-pretty text-muted-foreground">{descripcion}</p>}
      {accion && <div className="mt-2">{accion}</div>}
    </div>
  );
}
