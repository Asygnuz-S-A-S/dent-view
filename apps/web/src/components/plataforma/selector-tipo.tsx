"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DESCRIPCION_TIPO, esTipoCentro, ETIQUETA_TIPO, TIPOS_CENTRO, type TipoCentro } from "@/lib/tipo-centro";

/** Select del tipo de centro con su descripción debajo. */
export function SelectorTipo({ id, valor, onCambio, className }: { id?: string; valor: TipoCentro; onCambio: (t: TipoCentro) => void; className?: string }) {
  return (
    <div className="grid gap-1.5">
      <Select value={valor} onValueChange={(v) => esTipoCentro(v) && onCambio(v)}>
        <SelectTrigger id={id} className={className}><SelectValue /></SelectTrigger>
        <SelectContent>
          {TIPOS_CENTRO.map((t) => <SelectItem key={t} value={t}>{ETIQUETA_TIPO[t]}</SelectItem>)}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{DESCRIPCION_TIPO[valor]}</p>
    </div>
  );
}
