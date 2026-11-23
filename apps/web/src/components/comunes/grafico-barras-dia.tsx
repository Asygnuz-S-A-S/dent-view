"use client";

import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@/components/ui/chart";

const dia = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("es-CO", { timeZone: "UTC", ...o }).format(new Date(`${iso}T12:00:00Z`));
const corto = (iso: string) => dia(iso, { day: "numeric", month: "short" }).replace(/\./g, "");
const largo = (iso: string) => dia(iso, { weekday: "long", day: "numeric", month: "long" });

const cop = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
const copCompacto = (n: number) => `$ ${new Intl.NumberFormat("es-CO", { notation: "compact", maximumFractionDigits: 1 }).format(n)}`;

/**
 * Barras por día en un solo color. Solo se rotula el día más alto (los demás se leen en el tooltip y en la tabla accesible).
 * `moneda` formatea en COP; si no, son conteos con `unidad` en singular/plural.
 */
export function GraficoBarrasDia({ datos, moneda = false, unidad = ["estudio", "estudios"], alto = 224 }: {
  datos: { dia: string; valor: number }[]; moneda?: boolean; unidad?: [string, string]; alto?: number;
}) {
  const config = { valor: { label: moneda ? "Cobros" : unidad[1], color: "var(--chart-1)" } } satisfies ChartConfig;
  const max = Math.max(...datos.map((d) => d.valor));
  const texto = (v: number) => (moneda ? cop(v) : `${v} ${v === 1 ? unidad[0] : unidad[1]}`);
  return (
    <ChartContainer config={config} className="w-full" style={{ height: alto }}>
      <BarChart data={datos} margin={{ top: 22, left: 0, right: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="dia" tickLine={false} axisLine={false} minTickGap={28} tickMargin={8} tickFormatter={corto} />
        <YAxis hide domain={[0, "dataMax"]} />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.6 }}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as { dia: string; valor: number } | undefined;
            if (!active || !p) return null;
            return (
              <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-sm">
                <p className="text-muted-foreground first-letter:uppercase">{largo(p.dia)}</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums">{texto(p.valor)}</p>
              </div>
            );
          }}
        />
        <Bar dataKey="valor" fill="var(--color-valor)" radius={[3, 3, 0, 0]} isAnimationActive={false}>
          <LabelList
            dataKey="valor"
            content={(p) => {
              const { x, y, width, value } = p as { x: number; y: number; width: number; value: number };
              if (value !== max || max === 0) return null;
              return (
                <text x={x + width / 2} y={y - 6} textAnchor="middle" className="fill-foreground text-xs font-medium">
                  {moneda ? copCompacto(max) : max}
                </text>
              );
            }}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
