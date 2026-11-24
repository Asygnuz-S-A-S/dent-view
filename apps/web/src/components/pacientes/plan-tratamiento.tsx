"use client";

// Adaptado de OpenDentist (MIT, © 2026 Clawnify) — https://github.com/clawnify/OpenDentist
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { agregarItemPlan, cambiarEstadoPlan, moverItemPlan } from "@/app/(app)/pacientes/clinico-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InputMoneda } from "@/components/comunes/input-moneda";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ESTADOS_PLAN, ETIQUETA_PLAN, SUPERFICIES, totalesPorEstado, type EstadoPlan } from "@/lib/plan";
import { cop } from "@/lib/precios";
import { EstadoVacio } from "@/components/comunes/estado-vacio";

export type ItemPlan = { id: string; diente: number | null; superficie: string | null; descripcion: string; valor: number; estado: EstadoPlan; notas: string | null };
export type ServicioOpcion = { id: string; nombre: string; valor: number };
const NINGUNO = "ninguno";

export function PlanTratamiento({ pacienteId, items, servicios, soloLectura = false }: { pacienteId: string; items: ItemPlan[]; servicios: ServicioOpcion[]; soloLectura?: boolean }) {
  const [pendiente, iniciar] = useTransition();
  const [servicioId, setServicioId] = useState(NINGUNO);
  const [superficie, setSuperficie] = useState(NINGUNO);
  const [f, setF] = useState({ diente: "", descripcion: "", valor: "", notas: "" });
  const totales = totalesPorEstado(items);

  const ejecutar = (fn: () => Promise<{ error?: string }>, ok?: string, despues?: () => void) =>
    iniciar(async () => {
      const r = await fn();
      if (r.error) { toast.error(r.error); return; }
      if (ok) toast.success(ok);
      despues?.();
    });

  function elegirServicio(id: string) {
    setServicioId(id);
    const s = servicios.find((x) => x.id === id);
    if (s) setF((p) => ({ ...p, descripcion: s.nombre, valor: String(s.valor) }));
  }

  function agregar(e: React.FormEvent) {
    e.preventDefault();
    ejecutar(
      () =>
        agregarItemPlan({
          pacienteId,
          servicioId: servicioId === NINGUNO ? null : servicioId,
          diente: f.diente ? Number(f.diente) : null,
          superficie: superficie === NINGUNO ? null : (superficie as (typeof SUPERFICIES)[number]),
          descripcion: f.descripcion,
          valor: f.valor ? Number(f.valor) : undefined,
          notas: f.notas,
        }),
      "Ítem agregado al plan",
      () => { setF({ diente: "", descripcion: "", valor: "", notas: "" }); setServicioId(NINGUNO); setSuperficie(NINGUNO); },
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {ESTADOS_PLAN.map((e) => (
          <Card key={e} className="py-3"><CardContent>
            <p className="text-xs text-muted-foreground">{ETIQUETA_PLAN[e]}</p>
            <p className="text-lg font-semibold">{cop(totales[e])}</p>
          </CardContent></Card>
        ))}
      </div>

      {!soloLectura && <Card><CardContent>
        <form onSubmit={agregar} className="grid gap-3 sm:grid-cols-6">
          <div className="grid gap-2 sm:col-span-3">
            <Label htmlFor="plan-servicio">Servicio del catálogo (opcional)</Label>
            <Select value={servicioId} onValueChange={elegirServicio}>
              <SelectTrigger id="plan-servicio" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NINGUNO}>Sin servicio</SelectItem>
                {servicios.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="plan-diente">Diente (FDI)</Label>
            <Input id="plan-diente" type="number" min={11} max={85} value={f.diente} onChange={(e) => setF({ ...f, diente: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="plan-superficie">Superficie</Label>
            <Select value={superficie} onValueChange={setSuperficie}>
              <SelectTrigger id="plan-superficie" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NINGUNO}>—</SelectItem>
                {SUPERFICIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="plan-valor">Valor (COP)</Label>
            <InputMoneda id="plan-valor" value={f.valor} onValueChange={(v) => setF({ ...f, valor: v })} />
          </div>
          <div className="grid gap-2 sm:col-span-3">
            <Label htmlFor="plan-descripcion">Descripción</Label>
            <Input id="plan-descripcion" maxLength={200} value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} required />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="plan-notas">Notas</Label>
            <Input id="plan-notas" maxLength={1000} value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={pendiente} className="w-full"><Plus /> Agregar</Button>
          </div>
        </form>
      </CardContent></Card>}

      <Card className="py-0"><CardContent className="px-0">
        {items.length === 0 ? (
          <EstadoVacio titulo="Aún no hay ítems en el plan de tratamiento" />
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead className="pl-6">Diente</TableHead><TableHead>Descripción</TableHead>
              <TableHead className="text-right">Valor</TableHead><TableHead>Estado</TableHead>
              {!soloLectura && <TableHead className="pr-6 text-right">Orden</TableHead>}
            </TableRow></TableHeader>
            <TableBody>
              {items.map((i, n) => (
                <TableRow key={i.id}>
                  <TableCell className="pl-6">
                    {i.diente ? <Badge variant="outline">{i.diente}{i.superficie ? ` ${i.superficie}` : ""}</Badge> : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{i.descripcion}</div>
                    {i.notas && <div className="text-xs text-muted-foreground">{i.notas}</div>}
                  </TableCell>
                  <TableCell className="text-right">{cop(i.valor)}</TableCell>
                  <TableCell className={soloLectura ? "pr-6" : undefined}>
                    {soloLectura ? <Badge variant="secondary">{ETIQUETA_PLAN[i.estado]}</Badge> : <Select value={i.estado} disabled={pendiente} onValueChange={(v) => ejecutar(() => cambiarEstadoPlan(i.id, v))}>
                      <SelectTrigger className="w-36" aria-label={`Estado de ${i.descripcion}`}><SelectValue /></SelectTrigger>
                      <SelectContent>{ESTADOS_PLAN.map((e) => <SelectItem key={e} value={e}>{ETIQUETA_PLAN[e]}</SelectItem>)}</SelectContent>
                    </Select>}
                  </TableCell>
                  {!soloLectura && <TableCell className="pr-6">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" aria-label="Subir" disabled={pendiente || n === 0} onClick={() => ejecutar(() => moverItemPlan(i.id, -1))}><ArrowUp /></Button>
                      <Button size="icon" variant="ghost" aria-label="Bajar" disabled={pendiente || n === items.length - 1} onClick={() => ejecutar(() => moverItemPlan(i.id, 1))}><ArrowDown /></Button>
                    </div>
                  </TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>
    </div>
  );
}
