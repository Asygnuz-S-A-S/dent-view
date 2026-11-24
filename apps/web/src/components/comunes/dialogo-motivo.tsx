"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MOTIVO_MIN } from "@/lib/facturacion";

/** Confirmación que exige un motivo (mín. 5 caracteres) antes de una acción auditada. `children` es el botón que la abre; `extra` son campos adicionales. */
export function DialogoMotivo({ children, titulo, descripcion, confirmar, ejecutar, exito, extra, bloqueado }: {
  children: React.ReactNode; titulo: string; descripcion: string; confirmar: string; exito: string;
  ejecutar: (motivo: string) => Promise<{ error?: string }>; extra?: React.ReactNode; bloqueado?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [pendiente, iniciar] = useTransition();
  const corto = motivo.trim().length < MOTIVO_MIN;
  const enviar = () =>
    iniciar(async () => {
      const r = await ejecutar(motivo.trim());
      if (r.error) toast.error(r.error);
      else { toast.success(exito); setAbierto(false); setMotivo(""); }
    });
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descripcion}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {extra}
          <div className="space-y-2">
            <Label htmlFor="motivo-accion">Motivo (obligatorio)</Label>
            <Textarea id="motivo-accion" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} rows={3} />
            {motivo.length > 0 && corto && <p className="text-xs text-destructive">Mínimo {MOTIVO_MIN} caracteres</p>}
          </div>
        </div>
        <DialogFooter><Button disabled={pendiente || corto || bloqueado} onClick={enviar}>{confirmar}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
