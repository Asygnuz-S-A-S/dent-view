"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { crearPlanManual } from "@/app/(app)/planes/actions";
import { SelectNativo } from "@/components/crm/comun";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cop } from "@/lib/precios";

type Fila = { servicioId: string; cantidad: number; fase: number };

export function FormularioPlanManual({ pacienteId, servicios }: { pacienteId: string; servicios: { id: string; nombre: string; precio: number }[] }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [titulo, setTitulo] = useState("");
  const [filas, setFilas] = useState<Fila[]>([{ servicioId: "", cantidad: 1, fase: 1 }]);
  const precio = (id: string) => servicios.find((s) => s.id === id)?.precio ?? 0;
  const total = filas.reduce((t, f) => t + precio(f.servicioId) * f.cantidad, 0);
  const cambiar = (i: number, p: Partial<Fila>) => setFilas((l) => l.map((f, n) => (n === i ? { ...f, ...p } : f)));
  const completo = filas.length > 0 && filas.every((f) => f.servicioId);
  const guardar = () => iniciar(async () => {
    const r = await crearPlanManual({ pacienteId, titulo: titulo || undefined, items: filas });
    if ("error" in r) return void toast.error(r.error);
    toast.success("Plan de tratamiento creado");
    router.push(`/planes/${r.id}`);
  });
  return (
    <Card>
      <CardHeader><CardTitle>Ítems del plan</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-1.5 sm:max-w-md">
          <Label htmlFor="plan-titulo">Título (opcional)</Label>
          <Input id="plan-titulo" value={titulo} maxLength={120} onChange={(e) => setTitulo(e.target.value)} />
        </div>
        {filas.map((f, i) => (
          <div key={i} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_6rem_6rem_auto] sm:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor={`plan-serv-${i}`}>Servicio</Label>
              <SelectNativo id={`plan-serv-${i}`} value={f.servicioId} onChange={(e) => cambiar(i, { servicioId: e.target.value })}>
                <option value="">Selecciona…</option>
                {servicios.map((s) => <option key={s.id} value={s.id}>{s.nombre} · {cop(s.precio)}</option>)}
              </SelectNativo>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`plan-cant-${i}`}>Cantidad</Label>
              <Input id={`plan-cant-${i}`} type="number" min={1} max={20} value={f.cantidad} onChange={(e) => cambiar(i, { cantidad: Math.min(20, Math.max(1, Number(e.target.value) || 1)) })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`plan-fase-${i}`}>Fase</Label>
              <Input id={`plan-fase-${i}`} type="number" min={1} max={12} value={f.fase} onChange={(e) => cambiar(i, { fase: Math.min(12, Math.max(1, Number(e.target.value) || 1)) })} />
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label={`Quitar ítem ${i + 1}`} disabled={filas.length === 1} onClick={() => setFilas((l) => l.filter((_, n) => n !== i))}><Trash2 /></Button>
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="outline" onClick={() => setFilas((l) => [...l, { servicioId: "", cantidad: 1, fase: l.at(-1)?.fase ?? 1 }])}><Plus /> Agregar ítem</Button>
          <p className="text-base font-semibold tabular-nums" aria-live="polite">Total {cop(total)}</p>
        </div>
        <Button onClick={guardar} disabled={pendiente || !completo}>Crear plan</Button>
      </CardContent>
    </Card>
  );
}
