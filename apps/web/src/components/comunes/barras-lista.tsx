import { cn } from "@/lib/utils";

export type FilaBarra = {
  nombre: string;
  /** Magnitud para el largo de la barra. */
  n: number;
  /** Texto del valor ("12", "$ 1.200.000"). */
  valor: string;
  /** Texto secundario (porcentaje, nota). */
  extra?: string;
  /** Marca la fila como mala (cancelada, vencida…): única razón para salirse del color de acento. */
  malo?: boolean;
};

/** Barras horizontales con etiqueta directa y valor a la derecha: sin leyenda, ejes ni colores por categoría. Las filas deben venir ordenadas. */
export function BarrasLista({ filas, className }: { filas: FilaBarra[]; className?: string }) {
  const max = Math.max(1, ...filas.map((f) => f.n));
  return (
    <ul className={cn("space-y-3", className)}>
      {filas.map((f) => (
        <li key={f.nombre} className="text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate">{f.nombre}</span>
            <span className="shrink-0 font-medium tabular-nums">
              {f.valor}
              {f.extra && <span className="ml-2 font-normal text-muted-foreground">{f.extra}</span>}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-sm bg-muted" aria-hidden>
            <div className={cn("h-full rounded-sm", f.malo ? "bg-danger" : "bg-primary")} style={{ width: `${f.n > 0 ? Math.max(2, (f.n / max) * 100) : 0}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
