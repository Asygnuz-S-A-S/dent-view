"use client";

// Adaptado de OpenDentist (MIT, © 2026 Clawnify) — https://github.com/clawnify/OpenDentist
import { Eraser } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { Odontogram, type ToothConditionGroup, type ToothDetail } from "react-odontogram";
import "react-odontogram/style.css";
import { toast } from "sonner";
import { guardarCondicion } from "@/app/(app)/pacientes/actions";
import { cn } from "@/lib/utils";
import { CONDICIONES, type Condicion } from "@/lib/pacientes";

type Pincel = Condicion | "borrar";
type Fila = { diente: number; condicion: string };

const META: Record<Condicion, { etiqueta: string; fill: string; outline: string }> = {
  caries: { etiqueta: "Caries", fill: "#fecaca", outline: "#dc2626" },
  restauracion: { etiqueta: "Restauración", fill: "#fde68a", outline: "#d97706" },
  corona: { etiqueta: "Corona", fill: "#ddd6fe", outline: "#7c3aed" },
  endodoncia: { etiqueta: "Endodoncia", fill: "#fbcfe8", outline: "#db2777" },
  implante: { etiqueta: "Implante", fill: "#99f6e4", outline: "#0d9488" },
  ausente: { etiqueta: "Ausente", fill: "#cbd5e1", outline: "#64748b" },
};

export function Odontograma({ pacienteId, condiciones, editable }: { pacienteId: string; condiciones: Fila[]; editable: boolean }) {
  const [filas, setFilas] = useState(condiciones);
  const [pincel, setPincel] = useState<Pincel>("caries");
  // La librería guarda la selección internamente: se remonta tras cada clic para limpiar el aro.
  const [clave, setClave] = useState(0);
  const [, iniciar] = useTransition();

  const grupos: ToothConditionGroup[] = useMemo(
    () =>
      CONDICIONES.map((c) => ({
        label: META[c].etiqueta,
        fillColor: META[c].fill,
        outlineColor: META[c].outline,
        teeth: filas.filter((f) => f.condicion === c).map((f) => `teeth-${f.diente}`),
      })).filter((g) => g.teeth.length > 0),
    [filas],
  );

  function alCambiar(sel: ToothDetail[]) {
    if (!sel.length) return;
    const diente = Number(sel[0].notations.fdi);
    const actual = filas.find((f) => f.diente === diente)?.condicion;
    // Repetir el mismo pincel sobre el diente lo limpia.
    const nueva = pincel === "borrar" || actual === pincel ? null : pincel;
    const previas = filas;
    setFilas([...filas.filter((f) => f.diente !== diente), ...(nueva ? [{ diente, condicion: nueva }] : [])]);
    setClave((k) => k + 1);
    iniciar(async () => {
      const r = await guardarCondicion({ pacienteId, diente, condicion: nueva });
      if (r.error) {
        setFilas(previas);
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      {editable && (
        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Condición a aplicar">
          {CONDICIONES.map((c) => (
            <Opcion key={c} activo={pincel === c} onClick={() => setPincel(c)} color={META[c]}>
              {META[c].etiqueta}
            </Opcion>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={pincel === "borrar"}
            onClick={() => setPincel("borrar")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium",
              pincel === "borrar" ? "bg-accent" : "text-muted-foreground hover:bg-accent",
            )}
          >
            <Eraser className="size-3.5" /> Borrar
          </button>
        </div>
      )}
      <div className="mx-auto w-full max-w-md rounded-md bg-muted/30 p-2">
        <Odontogram
          key={clave}
          singleSelect
          readOnly={!editable}
          notation="FDI"
          showTooltip
          teethConditions={grupos}
          onChange={alCambiar}
          styles={{ width: "100%", height: "auto" }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {editable
          ? "Elige una condición y toca el diente (numeración FDI). Tocar de nuevo el mismo diente con la misma condición la quita."
          : "Numeración FDI. Solo lectura."}
      </p>
    </div>
  );
}

function Opcion({ activo, onClick, color, children }: { activo: boolean; onClick: () => void; color: { fill: string; outline: string }; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={activo}
      onClick={onClick}
      className={cn("inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium", !activo && "hover:bg-accent")}
      style={activo ? { borderColor: color.outline, background: color.fill, color: color.outline } : undefined}
    >
      <span className="inline-block size-3 rounded-sm border" style={{ background: color.fill, borderColor: color.outline }} />
      {children}
    </button>
  );
}
