"use client";

import { Ban, MessageCircle, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { asignarOdontologo, cancelarValoracion, reenviarEnlace, type Credenciales } from "@/app/(app)/valoraciones/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CredencialesDialogo } from "./credenciales-dialogo";

export function AccionesValoracion({ id, doctorId, odontologos, puedeAsignar, puedeReenviar, puedeCancelar, guiaWhatsapp }: {
  id: string; doctorId: string | null; odontologos: { id: string; nombre: string }[]; puedeAsignar: boolean; puedeReenviar: boolean; puedeCancelar: boolean; guiaWhatsapp: string | null;
}) {
  const [pendiente, iniciar] = useTransition();
  const [creds, setCreds] = useState<Credenciales | null>(null);
  return (
    <div className="flex flex-wrap items-end gap-3">
      {puedeAsignar && (
        <div className="grid gap-1.5">
          <Label htmlFor="asignar" className="text-xs text-muted-foreground">Odontólogo asignado</Label>
          <Select value={doctorId ?? "__ninguno"} disabled={pendiente} onValueChange={(v) => iniciar(async () => {
            const r = await asignarOdontologo(id, v === "__ninguno" ? null : v);
            if (r.error) toast.error(r.error); else toast.success("Asignación guardada");
          })}>
            <SelectTrigger id="asignar" className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__ninguno">Sin asignar</SelectItem>
              {odontologos.map((o) => <SelectItem key={o.id} value={o.id}>{o.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      {puedeReenviar && (
        <Button type="button" variant="outline" disabled={pendiente} onClick={() => iniciar(async () => {
          const r = await reenviarEnlace(id);
          if ("error" in r) toast.error(r.error); else setCreds(r.credenciales);
        })}><RefreshCw /> Reenviar enlace</Button>
      )}
      {guiaWhatsapp && <Button asChild variant="outline"><a href={guiaWhatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle /> Enviar guía por WhatsApp</a></Button>}
      {puedeCancelar && (
        <Button type="button" variant="ghost" disabled={pendiente} onClick={() => iniciar(async () => {
          if (!window.confirm("¿Cancelar esta valoración? El enlace del paciente dejará de funcionar.")) return;
          const r = await cancelarValoracion(id);
          if (r.error) toast.error(r.error); else toast.success("Valoración cancelada");
        })}><Ban /> Cancelar</Button>
      )}
      <CredencialesDialogo credenciales={creds} onCerrar={() => setCreds(null)} />
    </div>
  );
}
