"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { cop } from "@/lib/precios";

const config = { total: { label: "Saldo", color: "var(--chart-1)" } } satisfies ChartConfig;
// De menos a más grave: la antigüedad se lee por color sin depender solo del texto.
const COLORES = ["var(--success)", "var(--info)", "var(--warning)", "var(--danger)"];

export function GraficoCartera({ datos }: { datos: { tramo: string; total: number }[] }) {
  return (
    <ChartContainer config={config} className="h-56 w-full">
      <BarChart data={datos} accessibilityLayer margin={{ top: 22, left: 4, right: 4 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="tramo" tickLine={false} axisLine={false} tickFormatter={(t: string) => `${t} días`} />
        <YAxis hide />
        <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<ChartTooltipContent hideLabel={false} formatter={(v) => cop(Number(v))} />} />
        <Bar dataKey="total" name="Saldo" radius={6}>
          {datos.map((d, i) => <Cell key={d.tramo} fill={COLORES[i]} />)}
          <LabelList dataKey="total" position="top" className="fill-foreground text-xs" formatter={(v: unknown) => (Number(v) ? cop(Number(v)) : "")} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
