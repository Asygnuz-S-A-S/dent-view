import { Check } from "lucide-react";
import { PASOS } from "@/lib/valoraciones";

/** Barra de pasos de la solicitud; `actual` = posición (ver pasoDeEtapa): los anteriores están hechos, el actual resaltado. */
export function PasosValoracion({ actual }: { actual: number }) {
  return (
    <ol aria-label="Avance de la valoración" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {PASOS.map((p, i) => {
        const hecho = i < actual, enCurso = i === actual;
        return (
          <li key={p} aria-current={enCurso ? "step" : undefined} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${enCurso ? "border-primary bg-primary/5 font-medium" : hecho ? "text-foreground" : "text-muted-foreground"}`}>
            <span aria-hidden className={`grid size-6 shrink-0 place-items-center rounded-full border text-xs tabular-nums ${hecho ? "border-primary bg-primary text-primary-foreground" : enCurso ? "border-primary" : ""}`}>{hecho ? <Check className="size-3.5" /> : i + 1}</span>
            <span>{p}<span className="sr-only">{hecho ? " (listo)" : enCurso ? " (en curso)" : " (pendiente)"}</span></span>
          </li>
        );
      })}
    </ol>
  );
}
