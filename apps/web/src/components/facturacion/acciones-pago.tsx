"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { anularPago, aplicarAnticipoACuenta } from "@/app/(app)/facturacion/actions";
import { DialogoMotivo } from "@/components/comunes/dialogo-motivo";
import { Button } from "@/components/ui/button";

export function AnularPagoBoton({ pagoId }: { pagoId: string }) {
  return (
    <DialogoMotivo titulo="¿Anular el pago?" descripcion="El pago no se borra: queda marcado como anulado y deja de sumar. Si la cuenta estaba pagada, se reabre." confirmar="Anular pago" exito="Pago anulado" ejecutar={(m) => anularPago(pagoId, m)}>
      <Button variant="ghost" size="sm" className="print:hidden">Anular</Button>
    </DialogoMotivo>
  );
}

export function AplicarAnticipoBoton({ facturaId, anticipoId }: { facturaId: string; anticipoId: string }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <Button size="sm" variant="outline" disabled={pendiente} className="print:hidden" onClick={() => iniciar(async () => {
      const r = await aplicarAnticipoACuenta(facturaId, anticipoId);
      if (r.error) toast.error(r.error); else toast.success("Anticipo aplicado");
    })}>Aplicar anticipo</Button>
  );
}
