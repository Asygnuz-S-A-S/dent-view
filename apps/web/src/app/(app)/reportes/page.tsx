// Adaptado de OpenDentist (MIT, © 2026 Clawnify) — https://github.com/clawnify/OpenDentist
import { Graficos } from "@/components/reportes/graficos";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cop } from "@/lib/precios";
import { datosReporte } from "@/lib/reportes";
import { rangoReporte } from "@/lib/reportes-rango";
import { ADMIN } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

export const dynamic = "force-dynamic";

export default async function Reportes({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string }> }) {
  const ctx = await exigirContexto(ADMIN);
  const sp = await searchParams;
  const rango = rangoReporte(sp.desde, sp.hasta);
  const d = await datosReporte(ctx.organizationId, rango);
  const kpis = [
    { t: "Producción", v: d.produccion, n: "Órdenes no canceladas del rango" },
    { t: "Cobros", v: d.cobros, n: "Pagos recibidos en el rango" },
    { t: "Cartera total", v: d.cartera, n: "Saldo abierto a hoy" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
          <p className="text-sm text-muted-foreground">Indicadores del centro (fechas en hora de Bogotá).</p>
        </div>
        <form className="flex flex-wrap items-end gap-2">
          <div className="space-y-1"><Label htmlFor="desde">Desde</Label><Input id="desde" type="date" name="desde" defaultValue={rango.desde} /></div>
          <div className="space-y-1"><Label htmlFor="hasta">Hasta</Label><Input id="hasta" type="date" name="hasta" defaultValue={rango.hasta} /></div>
          <Button type="submit" variant="outline">Aplicar</Button>
        </form>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {kpis.map((k) => (
          <Card key={k.t}>
            <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">{k.t}</CardTitle></CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{cop(k.v)}</p>
              <p className="text-xs text-muted-foreground">{k.n}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Graficos d={d} />
    </div>
  );
}
