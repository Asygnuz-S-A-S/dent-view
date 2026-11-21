"use client";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const config = { total: { label: "Estudios", color: "var(--primary)" } } satisfies ChartConfig;

export function GraficoEstudios({ datos }: { datos: { dia: string; total: number }[] }) {
  return (
    <ChartContainer config={config} className="h-56 w-full">
      <BarChart data={datos} accessibilityLayer>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="dia"
          tickLine={false}
          axisLine={false}
          minTickGap={24}
          tickFormatter={(d: string) => `${d.slice(8)}/${d.slice(5, 7)}`}
        />
        <ChartTooltip content={<ChartTooltipContent hideLabel={false} />} />
        <Bar dataKey="total" fill="var(--color-total)" radius={3} />
      </BarChart>
    </ChartContainer>
  );
}
