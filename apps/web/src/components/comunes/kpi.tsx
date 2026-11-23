import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// El tono ya no pinta la tarjeta: solo la nota cuando significa algo malo (alerta o error).
const TONO = {
  primary: "", success: "", info: "", violet: "",
  warning: "text-warning-ink", danger: "text-danger-ink",
} as const;
export type TonoKpi = keyof typeof TONO;

/** Indicador: etiqueta, cifra grande y nota; es un enlace si recibe `href`. El icono es solo apoyo visual, en gris. */
export function Kpi({ titulo, valor, nota, icono: Icono, tono = "primary", href, delta, className }: {
  titulo: string; valor: React.ReactNode; nota?: React.ReactNode; icono?: LucideIcon; tono?: TonoKpi; href?: string; delta?: React.ReactNode; className?: string;
}) {
  const cuerpo = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm text-muted-foreground">{titulo}</span>
        {Icono && <Icono className="size-4 shrink-0 text-muted-foreground/70" aria-hidden />}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{valor}</p>
      {delta && <div className="mt-1">{delta}</div>}
      {nota && <p className={cn("mt-1 text-xs text-muted-foreground", TONO[tono])}>{nota}</p>}
    </>
  );
  const base = cn("block rounded-lg border bg-card p-4 text-card-foreground", className);
  return href ? (
    <Link href={href} className={cn(base, "transition-colors outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50")}>{cuerpo}</Link>
  ) : <div className={base}>{cuerpo}</div>;
}
