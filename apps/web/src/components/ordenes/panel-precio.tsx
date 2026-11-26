import { Receipt } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { desglosarPrecios } from "@/lib/precio-orden";
import { cop, type Entrega } from "@/lib/precios";
import type { ConvenioOpcion, TarifasDoctor } from "@/lib/precios-datos";

type Servicio = { id: string; precioImpreso: number | null; precioDigital: number | null; descuento: number };
type Item = { id: string; servicioId: string | null; nombre: string; opciones: string | null; precio: number };

/** La "ventanita" de precio. Todo se calcula en el servidor; los precios de la orden son los congelados al crearla. */
export function PanelPrecio({
  items, servicios, entrega, convenio, tarifasDoctor, doctorId, fecha, ordenId, facturada, puedeFacturar,
}: {
  items: Item[]; servicios: Servicio[]; entrega: Entrega; convenio: ConvenioOpcion | null; tarifasDoctor: TarifasDoctor; doctorId: string | null;
  fecha: string; ordenId: string; facturada: boolean; puedeFacturar: boolean;
}) {
  const { filas, total, descuentoTotal } = desglosarPrecios({ items, servicios, entrega, convenio, tarifasDoctor, doctorId, fecha });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Entrega {entrega === "IMPRESA" ? "impresa" : "digital"} · {convenio ? `Convenio ${convenio.nombre}` : "Sin convenio"}
          {facturada && <Badge variant="success" className="ml-2">Facturada: solo lectura</Badge>}
        </p>
        {puedeFacturar && !facturada && <Button asChild><Link href={`/facturacion/nueva?orden=${ordenId}`}><Receipt /> Crear cuenta de cobro</Link></Button>}
      </div>
      <Card className="py-0">
        <CardContent className="px-0">
          <Table aria-label="Servicios y precio">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Servicio</TableHead>
                <TableHead className="text-right">Catálogo</TableHead>
                <TableHead>Origen del precio</TableHead>
                <TableHead className="text-right">Descuento</TableHead>
                <TableHead className="pr-6 text-right">Cobrado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="pl-6 font-medium">{f.nombre}{f.opciones && <div className="text-xs font-normal text-muted-foreground">{f.opciones}</div>}</TableCell>
                  <TableCell className="text-right">{f.catalogo === null ? "—" : cop(f.catalogo)}</TableCell>
                  <TableCell className="text-muted-foreground">{f.origen}</TableCell>
                  <TableCell className="text-right">{f.descuento ? cop(f.descuento) : "—"}</TableCell>
                  <TableCell className="pr-6 text-right font-medium">{cop(f.precio)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="pl-6 font-semibold">Total a cobrar</TableCell>
                <TableCell className="text-right text-muted-foreground">{descuentoTotal ? cop(descuentoTotal) : "—"}</TableCell>
                <TableCell className="pr-6 text-right font-semibold" data-testid="total-orden">{cop(total)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
