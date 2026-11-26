"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { reintentarDocumentoFe } from "@/app/(app)/integraciones/facturacion/actions";
import { InsigniaFev } from "@/components/facturacion/insignia-fev";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { EstadoDoc } from "@/lib/fe/estados";

export type FilaDocumento = { id: string; tipo: string; facturaId: string; factura: string; estado: EstadoDoc; numeroDian: string | null; intentos: number; fecha: string; mensaje: string | null };

export function HistorialDocumentos({ filas }: { filas: FilaDocumento[] }) {
  const [pendiente, iniciar] = useTransition();
  if (filas.length === 0) return <p className="text-sm text-muted-foreground">Aún no hay documentos electrónicos con este filtro.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow><TableHead>Documento</TableHead><TableHead>Cuenta</TableHead><TableHead>Estado</TableHead><TableHead className="hidden md:table-cell">N.º DIAN</TableHead><TableHead className="hidden md:table-cell">Fecha</TableHead><TableHead><span className="sr-only">Acciones</span></TableHead></TableRow>
      </TableHeader>
      <TableBody>
        {filas.map((f) => (
          <TableRow key={f.id} data-documento={f.id}>
            <TableCell>{f.tipo === "FACTURA" ? "Factura" : "Nota crédito"}</TableCell>
            <TableCell><Link href={`/facturacion/${f.facturaId}`} className="underline-offset-4 hover:underline">{f.factura}</Link></TableCell>
            <TableCell className="whitespace-normal"><InsigniaFev estado={f.estado} />{f.mensaje && <span className="mt-1 block max-w-xs text-xs text-muted-foreground">{f.mensaje}</span>}</TableCell>
            <TableCell className="hidden font-mono text-xs md:table-cell">{f.numeroDian ?? "—"}</TableCell>
            <TableCell className="hidden md:table-cell">{f.fecha}</TableCell>
            <TableCell className="text-right">
              {(f.estado === "RECHAZADA" || f.estado === "ERROR") && (
                <Button type="button" size="sm" variant="outline" disabled={pendiente} onClick={() => iniciar(async () => { const r = await reintentarDocumentoFe(f.id); r.error ? toast.error(r.error) : toast.success("Reintento enviado"); })}>Reintentar</Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
