"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const config = { total: { label: "Estudios", color: "var(--chart-1)" } } satisfies ChartConfig;

export function GraficoEstudios({ datos }: { datos: { dia: string; total: number }[] }) {
  return (
    <ChartContainer config={config} className="h-56 w-full">
      <AreaChart data={datos} accessibilityLayer margin={{ left: 4, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="relleno-estudios" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-total)" stopOpacity={0.4} />
            <stop offset="100%" stopColor="var(--color-total)" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="dia"
          tickLine={false}
          axisLine={false}
          minTickGap={24}
          tickFormatter={(d: string) => `${d.slice(8)}/${d.slice(5, 7)}`}
        />
        <YAxis width={28} allowDecimals={false} tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent hideLabel={false} />} />
        <Area dataKey="total" type="monotone" stroke="var(--color-total)" strokeWidth={2} fill="url(#relleno-estudios)" dot={{ r: 2.5, fill: "var(--color-total)" }} activeDot={{ r: 4 }} />
      </AreaChart>
    </ChartContainer>
  );
}
