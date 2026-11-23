/** Remisiones de los últimos meses en miniatura (SVG, color por token). */
export function Sparkline({ valores, className = "text-primary" }: { valores: number[]; className?: string }) {
  const max = Math.max(1, ...valores);
  const w = 72, h = 22, paso = w / Math.max(1, valores.length - 1);
  const puntos = valores.map((v, i) => `${(i * paso).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className={className} role="img" aria-label={`Remisiones por mes: ${valores.join(", ")}`}>
      <polyline points={puntos} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Barras de remisiones por mes con su etiqueta ("2026-11" → "nov"). */
export function GraficaRemisiones({ datos }: { datos: { mes: string; n: number }[] }) {
  const max = Math.max(1, ...datos.map((d) => d.n));
  const nombre = (mes: string) => new Date(`${mes}-15T12:00:00Z`).toLocaleDateString("es-CO", { timeZone: "UTC", month: "short" }).replace(".", "");
  return (
    <div className="flex h-40 items-end gap-1.5" role="img" aria-label={`Remisiones por mes: ${datos.map((d) => `${nombre(d.mes)} ${d.n}`).join(", ")}`}>
      {datos.map((d) => (
        <div key={d.mes} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
          <span className="text-xs tabular-nums text-muted-foreground">{d.n || ""}</span>
          <div className={d.n ? "w-full rounded-t-sm bg-primary" : "w-full bg-border"} style={{ height: `${(d.n / max) * 100}%`, minHeight: d.n ? 3 : 1 }} />
          <span className="text-xs text-muted-foreground">{nombre(d.mes)}</span>
        </div>
      ))}
    </div>
  );
}
