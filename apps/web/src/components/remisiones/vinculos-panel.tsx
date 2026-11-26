"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { responderVinculo, revocarVinculo, solicitarVinculo } from "@/app/(app)/remisiones/actions";
import { ConfirmarAccion } from "@/components/comunes/confirmar-accion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SolicitarVinculo() {
  const [codigo, setCodigo] = useState("");
  const [pendiente, iniciar] = useTransition();
  const enviar = () =>
    iniciar(async () => {
      const r = await solicitarVinculo(codigo);
      if (r.error) toast.error(r.error);
      else { toast.success(r.mensaje ?? "Solicitud enviada"); setCodigo(""); }
    });
  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); enviar(); }}>
      <div className="space-y-2">
        <Label htmlFor="codigo-centro">Código del otro centro</Label>
        <Input id="codigo-centro" value={codigo} onChange={(e) => setCodigo(e.target.value)} maxLength={80} className="w-64" autoComplete="off" />
      </div>
      <Button type="submit" disabled={pendiente || codigo.trim().length < 2}>{pendiente && <Loader2 className="animate-spin" />} Solicitar vínculo</Button>
    </form>
  );
}

export function AccionesVinculo({ id, tipo, centro }: { id: string; tipo: "responder" | "revocar"; centro: string }) {
  const [pendiente, iniciar] = useTransition();
  const ejecutar = (f: () => Promise<{ error?: string }>, exito: string) =>
    iniciar(async () => {
      const r = await f();
      if (r.error) toast.error(r.error);
      else toast.success(exito);
    });
  return tipo === "responder" ? (
    <div className="flex gap-2">
      <Button size="sm" disabled={pendiente} onClick={() => ejecutar(() => responderVinculo(id, true), "Vínculo aceptado")}>Aceptar</Button>
      <Button size="sm" variant="outline" disabled={pendiente} onClick={() => ejecutar(() => responderVinculo(id, false), "Solicitud rechazada")}>Rechazar</Button>
    </div>
  ) : (
    <ConfirmarAccion titulo={`¿Revocar el vínculo con ${centro}?`} descripcion="Ya no podrán enviarse remisiones por este vínculo. Puedes volver a solicitarlo después." confirmar="Revocar" onConfirmar={() => ejecutar(() => revocarVinculo(id), "Vínculo revocado")}>
      <Button size="sm" variant="outline" disabled={pendiente}>Revocar</Button>
    </ConfirmarAccion>
  );
}
