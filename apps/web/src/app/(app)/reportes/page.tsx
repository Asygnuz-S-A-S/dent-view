// Adaptado de OpenDentist (MIT, © 2026 Clawnify) — https://github.com/clawnify/OpenDentist
import { Banknote, HandCoins, Wallet } from "lucide-react";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { Kpi } from "@/components/comunes/kpi";
import { Delta } from "@/components/comunes/tarjeta-grafica";
import { Graficos } from "@/components/reportes/graficos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cop } from "@/lib/precios";
import { datosReporte } from "@/lib/reportes";
import { diasDelRango, rangoReporte } from "@/lib/reportes-rango";
import { ADMIN } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

export const dynamic = "force-dynamic";

const dmy = (iso: string) => iso.split("-").reverse().join("/");

export default async function Reportes({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string }> }) {
  const ctx = await exigirContexto(ADMIN);
  const sp = await searchParams;
  const rango = rangoReporte(sp.desde, sp.hasta);
  const dias = diasDelRango(rango);
  // Periodo anterior de igual duración, justo antes del rango, para las comparaciones.
  const duracion = rango.fin.getTime() - rango.ini.getTime();
  const [d, p] = await Promise.all([
    datosReporte(ctx.organizationId, rango),
    datosReporte(ctx.organizationId, { ini: new Date(rango.ini.getTime() - duracion), fin: rango.ini }),
  ]);

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Reportes"
        descripcion={`Cómo va el centro del ${dmy(rango.desde)} al ${dmy(rango.hasta)} (${dias.length} ${dias.length === 1 ? "día" : "días"}), comparado con ${dias.length === 1 ? "el día anterior" : `los ${dias.length} días anteriores`}.`}
        acciones={
          <form className="flex flex-wrap items-end gap-2">
            <div className="space-y-1"><Label htmlFor="desde">Desde</Label><Input id="desde" type="date" name="desde" defaultValue={rango.desde} /></div>
            <div className="space-y-1"><Label htmlFor="hasta">Hasta</Label><Input id="hasta" type="date" name="hasta" defaultValue={rango.hasta} /></div>
            <Button type="submit" variant="outline">Aplicar</Button>
          </form>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi titulo="Producción" valor={cop(d.produccion)} nota="Órdenes no canceladas del rango" icono={Banknote} delta={<Delta actual={d.produccion} anterior={p.produccion} />} />
        <Kpi titulo="Cobros" valor={cop(d.cobros)} nota="Pagos recibidos en el rango" icono={HandCoins} delta={<Delta actual={d.cobros} anterior={p.cobros} />} />
        <Kpi titulo="Cartera total" valor={cop(d.cartera)} nota="Saldo abierto a hoy" icono={Wallet} href="/cartera" />
      </div>

      <Graficos d={d} p={p} dias={dias} />
    </div>
  );
}
