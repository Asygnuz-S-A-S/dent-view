"use client";

// Adaptado de OpenDentist (MIT, © 2026 Clawnify) — https://github.com/clawnify/OpenDentist
import { useTransition } from "react";
import { toast } from "sonner";
import { cambiarEstadoCaso } from "@/app/(app)/laboratorio/actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ESTADOS_LAB, ETIQUETA_LAB, type EstadoLab } from "@/lib/laboratorio";

export function EstadoCaso({ id, estado }: { id: string; estado: EstadoLab }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <Select
      value={estado}
      disabled={pendiente}
      onValueChange={(v) => iniciar(async () => { const r = await cambiarEstadoCaso(id, v); if (r.error) toast.error(r.error); })}
    >
      <SelectTrigger className="w-36" aria-label="Estado del caso"><SelectValue /></SelectTrigger>
      <SelectContent>{ESTADOS_LAB.map((e) => <SelectItem key={e} value={e}>{ETIQUETA_LAB[e]}</SelectItem>)}</SelectContent>
    </Select>
  );
}
