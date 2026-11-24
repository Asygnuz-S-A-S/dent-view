"use client";
// Adaptado de OpenDentist (MIT, © 2026 Clawnify) — https://github.com/clawnify/OpenDentist

import { Banknote, Printer } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { anularFactura, crearNotaCredito, registrarPago } from "@/app/(app)/facturacion/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DialogoMotivo } from "@/components/comunes/dialogo-motivo";
import { InputMoneda } from "@/components/comunes/input-moneda";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ETIQUETA_MEDIO, MEDIOS_PAGO, validarAbono, validarNotaCredito, type MedioPago } from "@/lib/facturacion";
import { cop } from "@/lib/precios";

export function AccionesFactura({ id, abierta, saldo, tienePagos, pagada = false, pagado = 0, admin = false }: { id: string; abierta: boolean; saldo: number; tienePagos: boolean; pagada?: boolean; pagado?: number; admin?: boolean }) {
  const [pendiente, iniciar] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [valor, setValor] = useState(String(saldo));
  const [medio, setMedio] = useState<MedioPago>("EFECTIVO");
  const [nota, setNota] = useState("");
  const [valorNota, setValorNota] = useState("");
  const errorAbono = validarAbono(Number(valor), saldo);
  const errorNota = validarNotaCredito(Number(valorNota), pagado);

  const abonar = () =>
    iniciar(async () => {
      const r = await registrarPago(id, { valor: Number(valor), medio, nota: nota || undefined });
      if (r.error) toast.error(r.error);
      else { toast.success("Abono registrado"); setAbierto(false); setNota(""); }
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
        <DialogoMotivo titulo="¿Anular la cuenta de cobro?" descripcion="Esta acción no se puede deshacer. La orden asociada podrá volver a facturarse." confirmar="Anular" exito="Cuenta de cobro anulada" ejecutar={(m) => anularFactura(id, m)}>
          <Button variant="outline">Anular</Button>
        </DialogoMotivo>
      )}
      {pagada && admin && (
        <DialogoMotivo
          titulo="Nota crédito" descripcion="Reduce el total de la cuenta en el valor indicado (no puede superar lo pagado). Queda registrada con consecutivo." confirmar="Crear nota crédito" exito="Nota crédito creada"
          ejecutar={(m) => crearNotaCredito(id, { valor: Number(valorNota), motivo: m })} bloqueado={!!errorNota}
          extra={
            <div className="space-y-2">
              <Label htmlFor="valor-nota">Valor (máx. {cop(pagado)})</Label>
              <InputMoneda id="valor-nota" value={valorNota} onValueChange={setValorNota} aria-invalid={!!errorNota} />
              {valorNota !== "" && errorNota && <p className="text-xs text-destructive">{errorNota}</p>}
            </div>
          }
        >
          <Button variant="outline">Nota crédito</Button>
        </DialogoMotivo>
      )}
    </div>
  );
}
