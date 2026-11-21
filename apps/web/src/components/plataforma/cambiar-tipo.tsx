"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cambiarTipoCentro } from "@/app/(app)/plataforma/actions";
import { SelectorTipo } from "@/components/plataforma/selector-tipo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ETIQUETA_TIPO, type TipoCentro } from "@/lib/tipo-centro";

/** Cambia el tipo de un centro existente: pide confirmación porque cambia los módulos disponibles. */
export function CambiarTipo({ organizationId, nombre, actual }: { organizationId: string; nombre: string; actual: TipoCentro }) {
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState(actual);
  const [pendiente, iniciar] = useTransition();

  const confirmar = () => iniciar(async () => {
    const r = await cambiarTipoCentro(organizationId, tipo);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Tipo de centro actualizado");
    setAbierto(false);
  });

  return (
    <Dialog open={abierto} onOpenChange={(o) => { setAbierto(o); if (o) setTipo(actual); }}>
      <DialogTrigger asChild><Button size="sm" variant="ghost" aria-label={`Cambiar tipo de ${nombre}`}>Cambiar tipo</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar tipo de {nombre}</DialogTitle>
          <DialogDescription>Actual: {ETIQUETA_TIPO[actual]}. Cambia los módulos disponibles del centro; no borra datos. Queda registrado en la auditoría.</DialogDescription>
        </DialogHeader>
        <SelectorTipo id="tipo-cambio" valor={tipo} onCambio={setTipo} />
        <DialogFooter>
          <Button disabled={pendiente || tipo === actual} onClick={confirmar}>{pendiente ? "Guardando…" : "Confirmar cambio"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
