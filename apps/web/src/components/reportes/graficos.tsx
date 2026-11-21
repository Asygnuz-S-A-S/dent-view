"use client";
// Adaptado de OpenDentist (MIT, © 2026 Clawnify) — https://github.com/clawnify/OpenDentist

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { COLOR_VARIANTE, VARIANTE_CITA, VARIANTE_ORDEN } from "@/components/comunes/estado-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { ETIQUETA_ESTADO_CITA, type EstadoCita } from "@/lib/agenda";
import { ETIQUETA_ESTADO_ORDEN, type EstadoOrden } from "@/lib/ordenes";
import { cop } from "@/lib/precios";

type Serie = { nombre: string; total: number }[];
export type DatosGraficos = {
  ingresosPorDia: { dia: string; valor: number }[];
  ordenesPorEstado: Serie;
  estudiosPorModalidad: Serie;
  topDoctores: { nombre: string; valor: number }[];
  citasPorEstado: Serie;
};

// Paleta del tema (chart-1 sigue el color del centro).
const PALETA = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];
const color = (i: number) => PALETA[i % PALETA.length];

const cfg = (etiqueta: string, c = "var(--chart-1)"): ChartConfig => ({ total: { label: etiqueta, color: c } });

function Panel({ titulo, vacio, children }: { titulo: string; vacio: boolean; children: React.ReactNode }) {
  return (
    <Card className="min-w-0">
      <CardHeader><CardTitle className="text-base">{titulo}</CardTitle></CardHeader>
      <CardContent>{vacio ? <p className="py-10 text-center text-sm text-muted-foreground">Sin datos en el rango.</p> : children}</CardContent>
    </Card>
  );
}

// El día llega como "MM-DD".
const fechaCorta = (d: string) => `${d.slice(3)}/${d.slice(0, 2)}`;

function Ingresos({ datos }: { datos: { nombre: string; total: number }[] }) {
  return (
    <ChartContainer config={cfg("Cobros", "var(--chart-6)")} className="h-64 w-full">
      <AreaChart data={datos} accessibilityLayer margin={{ left: 4, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="relleno-ingresos" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-total)" stopOpacity={0.45} />
            <stop offset="100%" stopColor="var(--color-total)" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="nombre" tickLine={false} axisLine={false} minTickGap={20} tickFormatter={fechaCorta} />
        <YAxis hide />
        <ChartTooltip content={<ChartTooltipContent formatter={(v) => cop(Number(v))} />} />
        <Area dataKey="total" name="Cobros" type="monotone" stroke="var(--color-total)" strokeWidth={2} fill="url(#relleno-ingresos)" />
      </AreaChart>
    </ChartContainer>
  );
}

/** Barras con un color de la paleta por categoría. */
function Barras({ datos, etiqueta, formato, horizontal }: { datos: { nombre: string; total: number }[]; etiqueta: string; formato?: (n: number) => string; horizontal?: boolean }) {
  return (
    <ChartContainer config={cfg(etiqueta)} className="h-64 w-full">
      <BarChart data={datos} layout={horizontal ? "vertical" : "horizontal"} accessibilityLayer>
        <CartesianGrid vertical={!!horizontal} horizontal={!horizontal} strokeDasharray="3 3" />
        {horizontal ? (
          <>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="nombre" width={110} tickLine={false} axisLine={false} />
          </>
        ) : (
          <>
            <XAxis dataKey="nombre" tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis hide />
          </>
        )}
        <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<ChartTooltipContent hideLabel={false} formatter={(v) => (formato ? formato(Number(v)) : String(v))} />} />
        <Bar dataKey="total" name={etiqueta} radius={4}>
          {datos.map((_, i) => <Cell key={i} fill={color(i)} />)}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

/** Dona con el total al centro y leyenda en HTML (legible y accesible). */
function Dona({ datos, etiqueta }: { datos: { nombre: string; total: number; color: string }[]; etiqueta: string }) {
  const total = datos.reduce((t, d) => t + d.total, 0);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <ChartContainer config={cfg(etiqueta)} className="aspect-square h-52 shrink-0">
        <PieChart accessibilityLayer>
          <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="nombre" />} />
          <Pie data={datos} dataKey="total" nameKey="nombre" innerRadius="62%" outerRadius="95%" paddingAngle={2} strokeWidth={0}>
            {datos.map((d) => <Cell key={d.nombre} fill={d.color} />)}
          </Pie>
          <text x="50%" y="48%" textAnchor="middle" className="fill-foreground text-2xl font-semibold tabular-nums">{total}</text>
          <text x="50%" y="60%" textAnchor="middle" className="fill-muted-foreground text-xs">{etiqueta}</text>
        </PieChart>
      </ChartContainer>
      <ul className="grid w-full min-w-0 gap-2 text-sm">
        {datos.map((d) => (
          <li key={d.nombre} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2"><span className="size-2.5 shrink-0 rounded-full" style={{ background: d.color }} aria-hidden /><span className="truncate">{d.nombre}</span></span>
            <span className="text-muted-foreground tabular-nums">{d.total} · {Math.round((d.total / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Graficos({ d }: { d: DatosGraficos }) {
  const ingresos = d.ingresosPorDia.map((x) => ({ nombre: x.dia, total: x.valor }));
  const orden = d.ordenesPorEstado.map((x) => ({ nombre: ETIQUETA_ESTADO_ORDEN[x.nombre as EstadoOrden] ?? x.nombre, total: x.total, color: COLOR_VARIANTE[VARIANTE_ORDEN[x.nombre as EstadoOrden] ?? "secondary"] }));
  const citas = d.citasPorEstado.map((x) => ({ nombre: ETIQUETA_ESTADO_CITA[x.nombre as EstadoCita] ?? x.nombre, total: x.total, color: COLOR_VARIANTE[VARIANTE_CITA[x.nombre as EstadoCita] ?? "secondary"] }));
  const doctores = d.topDoctores.map((x) => ({ nombre: x.nombre, total: x.valor }));
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
      <div className="lg:col-span-2 min-w-0">
        <Panel titulo="Ingresos por día" vacio={ingresos.every((x) => x.total === 0)}>
          <Ingresos datos={ingresos} />
        </Panel>
      </div>
      <Panel titulo="Órdenes por estado" vacio={orden.length === 0}><Dona datos={orden} etiqueta="Órdenes" /></Panel>
      <Panel titulo="Citas por estado" vacio={citas.length === 0}><Dona datos={citas} etiqueta="Citas" /></Panel>
      <Panel titulo="Estudios por modalidad" vacio={d.estudiosPorModalidad.length === 0}><Barras datos={d.estudiosPorModalidad} etiqueta="Estudios" /></Panel>
      <Panel titulo="Top 10 doctores remitentes (valor de órdenes)" vacio={doctores.length === 0}>
        <Barras datos={doctores} etiqueta="Valor" formato={cop} horizontal />
      </Panel>
    </div>
  );
}
