"use client";
// Adaptado de OpenDentist (MIT, © 2026 Clawnify) — https://github.com/clawnify/OpenDentist

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
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

const cfg = (etiqueta: string): ChartConfig => ({ total: { label: etiqueta, color: "var(--primary)" } });

function Panel({ titulo, vacio, children }: { titulo: string; vacio: boolean; children: React.ReactNode }) {
  return (
    <Card className="min-w-0">
      <CardHeader><CardTitle className="text-base">{titulo}</CardTitle></CardHeader>
      <CardContent>{vacio ? <p className="py-10 text-center text-sm text-muted-foreground">Sin datos en el rango.</p> : children}</CardContent>
    </Card>
  );
}

function Barras({ datos, clave, etiqueta, formato, horizontal }: { datos: Record<string, string | number>[]; clave: string; etiqueta: string; formato?: (n: number) => string; horizontal?: boolean }) {
  return (
    <ChartContainer config={cfg(etiqueta)} className="h-64 w-full">
      <BarChart data={datos} layout={horizontal ? "vertical" : "horizontal"} accessibilityLayer>
        <CartesianGrid vertical={!horizontal} horizontal={!horizontal} />
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
        <ChartTooltip content={<ChartTooltipContent formatter={(v) => (formato ? formato(Number(v)) : String(v))} />} />
        <Bar dataKey={clave} name={etiqueta} fill="var(--color-total)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}

export function Graficos({ d }: { d: DatosGraficos }) {
  const ingresos = d.ingresosPorDia.map((x) => ({ nombre: x.dia, total: x.valor }));
  const orden = d.ordenesPorEstado.map((x) => ({ nombre: ETIQUETA_ESTADO_ORDEN[x.nombre as EstadoOrden] ?? x.nombre, total: x.total }));
  const citas = d.citasPorEstado.map((x) => ({ nombre: ETIQUETA_ESTADO_CITA[x.nombre as EstadoCita] ?? x.nombre, total: x.total }));
  const doctores = d.topDoctores.map((x) => ({ nombre: x.nombre, total: x.valor }));
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
      <div className="lg:col-span-2 min-w-0">
        <Panel titulo="Ingresos por día" vacio={ingresos.every((x) => x.total === 0)}>
          <Barras datos={ingresos} clave="total" etiqueta="Cobros" formato={cop} />
        </Panel>
      </div>
      <Panel titulo="Órdenes por estado" vacio={orden.length === 0}><Barras datos={orden} clave="total" etiqueta="Órdenes" /></Panel>
      <Panel titulo="Estudios por modalidad" vacio={d.estudiosPorModalidad.length === 0}><Barras datos={d.estudiosPorModalidad} clave="total" etiqueta="Estudios" /></Panel>
      <Panel titulo="Top 10 doctores remitentes (valor de órdenes)" vacio={doctores.length === 0}>
        <Barras datos={doctores} clave="total" etiqueta="Valor" formato={cop} horizontal />
      </Panel>
      <Panel titulo="Citas por estado" vacio={citas.length === 0}><Barras datos={citas} clave="total" etiqueta="Citas" /></Panel>
    </div>
  );
}
