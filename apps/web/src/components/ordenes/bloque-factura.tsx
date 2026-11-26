import { Receipt } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { EstadoVacio } from "@/components/comunes/estado-vacio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fechaCorta } from "@/lib/fechas";
import { cop } from "@/lib/precios";

const ESTADO = { ABIERTA: "Abierta", PAGADA: "Pagada", ANULADA: "Anulada" } as const;

/** Estado de la facturación de la orden. `children`: espacio para el bloque de factura electrónica (FEV). */
export function BloqueFactura({
  ordenId, facturas, puedeFacturar, children,
}: {
  ordenId: string;
  facturas: { id: string; numero: number; estado: keyof typeof ESTADO; total: number; fecha: Date }[];
  puedeFacturar: boolean;
  children?: ReactNode;
}) {
  const vigente = facturas.some((f) => f.estado !== "ANULADA");
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Cuenta de cobro</CardTitle>
          {puedeFacturar && !vigente && <Button asChild size="sm"><Link href={`/facturacion/nueva?orden=${ordenId}`}><Receipt /> Crear cuenta de cobro</Link></Button>}
        </CardHeader>
        <CardContent>
          {facturas.length === 0 ? (
            <EstadoVacio icono={Receipt} titulo="Esta orden aún no tiene cuenta de cobro" className="py-4" />
          ) : (
            <ul className="divide-y text-sm">
              {facturas.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  {puedeFacturar ? <Link href={`/facturacion/${f.id}`} className="font-medium underline-offset-4 hover:underline">Cuenta de cobro #{f.numero}</Link> : <span className="font-medium">Cuenta de cobro #{f.numero}</span>}
                  <span className="text-muted-foreground">{fechaCorta(f.fecha)} · {cop(f.total)}</span>
                  <Badge variant={f.estado === "PAGADA" ? "success" : f.estado === "ANULADA" ? "secondary" : "info"}>{ESTADO[f.estado]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {children}
    </div>
  );
}
