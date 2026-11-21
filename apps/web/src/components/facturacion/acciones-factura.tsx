"use client";
// Adaptado de OpenDentist (MIT, © 2026 Clawnify) — https://github.com/clawnify/OpenDentist

import { Banknote, Printer } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { anularFactura, registrarPago } from "@/app/(app)/facturacion/actions";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { InputMoneda } from "@/components/comunes/input-moneda";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ETIQUETA_MEDIO, MEDIOS_PAGO, validarAbono, type MedioPago } from "@/lib/facturacion";
import { cop } from "@/lib/precios";

export function AccionesFactura({ id, abierta, saldo, tienePagos }: { id: string; abierta: boolean; saldo: number; tienePagos: boolean }) {
  const [pendiente, iniciar] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [valor, setValor] = useState(String(saldo));
  const [medio, setMedio] = useState<MedioPago>("EFECTIVO");
  const [nota, setNota] = useState("");
  const errorAbono = validarAbono(Number(valor), saldo);

  const abonar = () =>
    iniciar(async () => {
      const r = await registrarPago(id, { valor: Number(valor), medio, nota: nota || undefined });
      if (r.error) toast.error(r.error);
      else { toast.success("Abono registrado"); setAbierto(false); setNota(""); }
    });
  const anular = () =>
    iniciar(async () => {
      const r = await anularFactura(id);
      if (r.error) toast.error(r.error);
      else toast.success("Cuenta de cobro anulada");
    });

  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      {abierta && (
        <Dialog open={abierto} onOpenChange={(o) => { setAbierto(o); if (o) setValor(String(saldo)); }}>
          <DialogTrigger asChild><Button><Banknote /> Registrar abono</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Registrar abono</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="valor-abono">Valor (saldo {cop(saldo)})</Label>
                <InputMoneda id="valor-abono" value={valor} onValueChange={setValor} aria-invalid={!!errorAbono} />
                {errorAbono && <p className="text-xs text-destructive">{errorAbono}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="medio-abono">Medio de pago</Label>
                <Select value={medio} onValueChange={(v) => setMedio(v as MedioPago)}>
                  <SelectTrigger id="medio-abono" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{MEDIOS_PAGO.map((m) => <SelectItem key={m} value={m}>{ETIQUETA_MEDIO[m]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="nota-abono">Nota (opcional)</Label>
                <Input id="nota-abono" value={nota} onChange={(e) => setNota(e.target.value)} />
              </div>
            </div>
            <DialogFooter><Button disabled={pendiente || !!errorAbono} onClick={abonar}>Registrar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      <Button variant="outline" onClick={() => window.print()}><Printer /> Imprimir</Button>
      {abierta && !tienePagos && (
        <AlertDialog>
          <AlertDialogTrigger asChild><Button variant="outline" disabled={pendiente}>Anular</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Anular la cuenta de cobro?</AlertDialogTitle>
              <AlertDialogDescription>Esta acción no se puede deshacer. La orden asociada podrá volver a facturarse.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Volver</AlertDialogCancel>
              <AlertDialogAction onClick={anular}>Anular</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
