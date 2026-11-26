"use client";

import { Banknote, XCircle } from "lucide-react";
import { useState } from "react";
import { cancelarPlan, registrarAnticipoPlan } from "@/app/(app)/planes/actions";
import { SelectNativo, useAccion } from "@/components/crm/comun";
import { DialogoMotivo } from "@/components/comunes/dialogo-motivo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ETIQUETA_MEDIO } from "@/lib/facturacion";
import { METODOS_ANTICIPO } from "@/lib/planes";
import { useRouter } from "next/navigation";

export function FormularioAnticipo({ planId }: { planId: string }) {
  const [monto, setMonto] = useState("");
  const [medio, setMedio] = useState<(typeof METODOS_ANTICIPO)[number]>("EFECTIVO");
  const { pendiente, ejecutar } = useAccion(() => setMonto(""));
  return (
    <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); ejecutar(() => registrarAnticipoPlan(planId, { monto: Number(monto), medio }), "Anticipo registrado"); }}>
      <div className="grid gap-1.5">
        <Label htmlFor="anticipo-monto">Monto del anticipo (COP)</Label>
        <Input id="anticipo-monto" type="number" inputMode="numeric" min={1000} step={1} required value={monto} onChange={(e) => setMonto(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="anticipo-medio">Método</Label>
        <SelectNativo id="anticipo-medio" value={medio} onChange={(e) => setMedio(e.target.value as typeof medio)}>
          {METODOS_ANTICIPO.map((m) => <option key={m} value={m}>{ETIQUETA_MEDIO[m]}</option>)}
        </SelectNativo>
      </div>
      <Button type="submit" disabled={pendiente || !monto}><Banknote /> Registrar anticipo</Button>
    </form>
  );
}

export function CancelarPlan({ planId }: { planId: string }) {
  const router = useRouter();
  return (
    <DialogoMotivo titulo="Cancelar plan de tratamiento" descripcion="Los ítems pendientes dejan de poder pedirse en órdenes. Lo ya realizado queda en el historial. Esta acción queda registrada." confirmar="Cancelar plan" exito="Plan cancelado"
      ejecutar={async (motivo) => { const r = await cancelarPlan(planId, motivo); if (!r.error) router.refresh(); return r; }}>
      <Button variant="outline"><XCircle /> Cancelar plan</Button>
    </DialogoMotivo>
  );
}
