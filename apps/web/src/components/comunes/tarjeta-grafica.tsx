import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { variacion } from "./variacion";

/** Cambio contra el periodo anterior. `buenoSi` dice qué sentido es positivo (en cartera, bajar es bueno); el color solo significa bueno/malo. */
export function Delta({ actual, anterior, buenoSi = "sube", etiqueta = "vs. periodo anterior", className }: {
  actual: number; anterior: number; buenoSi?: "sube" | "baja"; etiqueta?: string; className?: string;
}) {
  const v = variacion(actual, anterior);
  const Flecha = v.sentido === "sube" ? ArrowUpRight : v.sentido === "baja" ? ArrowDownRight : ArrowRight;
  const tono = v.sentido === "igual" ? "text-muted-foreground" : v.sentido === buenoSi ? "text-success-ink" : "text-danger-ink";
  // Sin base anterior no hay porcentaje: se muestra el cambio absoluto.
  const texto = v.sentido === "igual" ? "Sin cambio" : v.pct === null ? `${v.dif > 0 ? "+" : "−"}${Math.abs(v.dif).toLocaleString("es-CO")}` : `${v.pct > 0 ? "+" : "−"}${Math.abs(v.pct)} %`;
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm", className)}>
      <span className={cn("inline-flex items-center gap-0.5 font-medium tabular-nums", tono)}>
        <Flecha className="size-4" aria-hidden />{texto}
      </span>
      <span className="text-muted-foreground">{etiqueta}</span>
    </span>
  );
}

/**
 * Tarjeta de gráfica: el título es la conclusión en lenguaje llano, luego la cifra principal con su comparación,
 * la gráfica, una tabla accesible equivalente y el pie "cómo se calcula".
 */
export function TarjetaGrafica({ titulo, subtitulo, cifra, delta, vacio, comoSeCalcula, tabla, children, className }: {
  /** Conclusión: "Esta semana tomaron 12 estudios, 3 más que la anterior". */
  titulo: ReactNode;
  subtitulo?: ReactNode;
  cifra?: ReactNode;
  delta?: ReactNode;
  /** Si viene, reemplaza la gráfica por este mensaje (qué falta y qué hacer). */
  vacio?: ReactNode;
  comoSeCalcula?: ReactNode;
  /** Alternativa accesible a la gráfica (tabla); se oculta visualmente. */
  tabla?: { columnas: string[]; filas: (string | number)[][] };
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-lg border bg-card p-5 text-card-foreground", className)}>
      <h3 className="text-base font-semibold text-balance">{titulo}</h3>
      {subtitulo && <p className="mt-0.5 text-sm text-pretty text-muted-foreground">{subtitulo}</p>}
      {(cifra || delta) && (
        <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {cifra && <span className="text-3xl font-semibold tracking-tight tabular-nums">{cifra}</span>}
          {delta}
        </div>
      )}
      <div className="relative mt-4 overflow-hidden">
        {vacio ? <p className="rounded-md bg-muted/60 px-4 py-8 text-center text-sm text-pretty text-muted-foreground">{vacio}</p> : (
          <>
            {/* La gráfica es decorativa para lectores de pantalla: la tabla siguiente trae los mismos datos. */}
            <div aria-hidden={tabla ? true : undefined}>{children}</div>
            {tabla && (
              <table className="sr-only">
                <thead><tr>{tabla.columnas.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
                <tbody>{tabla.filas.map((f, i) => <tr key={i}>{f.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
              </table>
            )}
          </>
        )}
      </div>
      {comoSeCalcula && <p className="mt-4 border-t pt-3 text-xs text-pretty text-muted-foreground">Cómo se calcula: {comoSeCalcula}</p>}
    </section>
  );
}
