"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { guardarNotasInternas } from "@/app/(app)/valoraciones/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const MAX_NOTAS = 3000;

/** Notas privadas de quien valora: no las ve recepción ni el paciente. */
export function NotasInternas({ valoracionId, inicial }: { valoracionId: string; inicial: string }) {
  const [texto, setTexto] = useState(inicial);
  const [pendiente, iniciar] = useTransition();
  return (
    <form className="grid max-w-2xl gap-3" onSubmit={(e) => {
      e.preventDefault();
      iniciar(async () => {
        const r = await guardarNotasInternas(valoracionId, texto);
        if (r.error) toast.error(r.error); else toast.success("Notas guardadas");
      });
    }}>
      <div className="grid gap-2">
        <Label htmlFor="notas-internas">Notas internas</Label>
        <Textarea id="notas-internas" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={MAX_NOTAS} rows={6} placeholder="Apuntes para ti y el equipo clínico" />
        <p className="text-xs text-muted-foreground">Solo las ve quien valora. No se envían al paciente ni las ve recepción. {texto.length}/{MAX_NOTAS}</p>
      </div>
      <Button type="submit" disabled={pendiente} className="justify-self-start">{pendiente && <Loader2 className="animate-spin" />} Guardar notas</Button>
    </form>
  );
}
