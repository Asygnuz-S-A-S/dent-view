import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const TONO = {
  primary: { chip: "bg-primary/10 text-primary", barra: "bg-primary" },
  success: { chip: "bg-success-soft text-success-ink", barra: "bg-success" },
  warning: { chip: "bg-warning-soft text-warning-ink", barra: "bg-warning" },
  info: { chip: "bg-info-soft text-info-ink", barra: "bg-info" },
  danger: { chip: "bg-danger-soft text-danger-ink", barra: "bg-danger" },
  violet: { chip: "bg-violet-soft text-violet-ink", barra: "bg-violet" },
} as const;
export type TonoKpi = keyof typeof TONO;

/** Indicador con icono de color y barra de acento; es un enlace si recibe `href`. */
export function Kpi({ titulo, valor, nota, icono: Icono, tono = "primary", href, className }: {
  titulo: string; valor: React.ReactNode; nota?: React.ReactNode; icono: LucideIcon; tono?: TonoKpi; href?: string; className?: string;
}) {
  const t = TONO[tono];
  const cuerpo = (
    <>
      <span className={cn("absolute inset-x-0 top-0 h-1", t.barra)} aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm text-muted-foreground">{titulo}</span>
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", t.chip)}><Icono className="size-4" aria-hidden /></span>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{valor}</p>
      {nota && <p className="mt-1 text-xs text-muted-foreground">{nota}</p>}
    </>
  );
  const base = cn("relative block overflow-hidden rounded-xl border bg-card p-4 pt-5 text-card-foreground", className);
  return href ? (
    <Link href={href} className={cn(base, "transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50")}>{cuerpo}</Link>
  ) : <div className={base}>{cuerpo}</div>;
}
