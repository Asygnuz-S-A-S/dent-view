"use client";
// Adaptado de OpenDentist (MIT, © 2026 Clawnify) — https://github.com/clawnify/OpenDentist

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { crearFactura } from "@/app/(app)/facturacion/actions";
import { PacienteCombobox, type PacienteOpcion } from "@/components/ordenes/paciente-combobox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InputMoneda } from "@/components/comunes/input-moneda";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ETIQUETA_RESPONSABLE, totalItems, type Responsable } from "@/lib/facturacion";
import { parsearCop } from "@/lib/formato";
import { cop } from "@/lib/precios";

type Item = { descripcion: string; cantidad: number; valorUnitario: number };
type OrdenOpcion = { id: string; etiqueta: string; items: Item[] };
const MANUAL = "manual";

export function FacturaForm({
  pacientes, doctores, ordenes, ordenInicial,
}: {
  pacientes: PacienteOpcion[];
  doctores: { id: string; nombre: string }[];
  ordenes: OrdenOpcion[];
  ordenInicial?: string;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [ordenId, setOrdenId] = useState(ordenInicial ?? MANUAL);
  const [pacienteId, setPacienteId] = useState("");
  const [items, setItems] = useState<Item[]>([{ descripcion: "", cantidad: 1, valorUnitario: 0 }]);
  const [responsable, setResponsable] = useState<Responsable>("PACIENTE");
  const [doctorId, setDoctorId] = useState("");
  const [convenio, setConvenio] = useState("");
  const [vence, setVence] = useState("");
  const [notas, setNotas] = useState("");

  const orden = ordenes.find((o) => o.id === ordenId);
  const lista = orden ? orden.items : items;
  const total = totalItems(lista);
  const editar = (i: number, p: Partial<Item>) => setItems((a) => a.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const guardar = () =>
    iniciar(async () => {
      const r = await crearFactura({
        ...(orden ? { ordenId: orden.id } : { pacienteId, items: items.filter((i) => i.descripcion.trim()) }),
        responsable,
        responsableId: doctorId || undefined,
        convenio: convenio || undefined,
        vence: vence || undefined,
        notas: notas || undefined,
      });
      if ("error" in r) toast.error(r.error);
      else {
        toast.success("Cuenta de cobro creada");
        router.push(`/facturacion/${r.id}`);
      }
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Origen</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="orden">Orden del centro</Label>
              <Select value={ordenId} onValueChange={setOrdenId}>
                <SelectTrigger id="orden" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={MANUAL}>Sin orden (manual)</SelectItem>
                  {ordenes.map((o) => <SelectItem key={o.id} value={o.id} className="capitalize">{o.etiqueta}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Con una orden se cargan sus ítems con el precio congelado. Una orden no se factura dos veces.</p>
            </div>
            {!orden && (
              <div className="space-y-2">
                <Label htmlFor="paciente">Paciente</Label>
                <PacienteCombobox id="paciente" pacientes={pacientes} value={pacienteId} onChange={setPacienteId} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Ítems</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {orden ? (
              <ul className="divide-y text-sm">
                {orden.items.map((i, k) => (
                  <li key={k} className="flex justify-between gap-4 py-2"><span>{i.descripcion}</span><span>{cop(i.valorUnitario)}</span></li>
                ))}
              </ul>
            ) : (
              <>
                {items.map((it, i) => (
                  <div key={i} className="grid grid-cols-[1fr_5rem_8rem_auto] items-end gap-2">
                    <div className="space-y-1">
                      {i === 0 && <Label htmlFor="desc-0">Descripción</Label>}
                      <Input id={`desc-${i}`} aria-label={`Descripción del ítem ${i + 1}`} value={it.descripcion} onChange={(e) => editar(i, { descripcion: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      {i === 0 && <Label>Cant.</Label>}
                      <Input type="number" min={1} aria-label={`Cantidad del ítem ${i + 1}`} value={it.cantidad} onChange={(e) => editar(i, { cantidad: Math.max(1, Math.trunc(Number(e.target.value)) || 1) })} />
                    </div>
                    <div className="space-y-1">
                      {i === 0 && <Label>Valor</Label>}
                      <InputMoneda aria-label={`Valor del ítem ${i + 1}`} value={it.valorUnitario ? String(it.valorUnitario) : ""} onValueChange={(v) => editar(i, { valorUnitario: parsearCop(v) })} />
                    </div>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Quitar ítem ${i + 1}`} disabled={items.length === 1} onClick={() => setItems((a) => a.filter((_, j) => j !== i))}><Trash2 /></Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setItems((a) => [...a, { descripcion: "", cantidad: 1, valorUnitario: 0 }])}><Plus /> Agregar ítem</Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="h-fit">
        <CardHeader><CardTitle>A cargo de</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="responsable">Responsable</Label>
            <Select value={responsable} onValueChange={(v) => setResponsable(v as Responsable)}>
              <SelectTrigger id="responsable" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(ETIQUETA_RESPONSABLE) as Responsable[]).map((r) => <SelectItem key={r} value={r}>{ETIQUETA_RESPONSABLE[r]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {responsable === "DOCTOR" && (
            <div className="space-y-2">
              <Label htmlFor="doctor">Doctor remitente</Label>
              <Select value={doctorId} onValueChange={setDoctorId}>
                <SelectTrigger id="doctor" className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>{doctores.map((d) => <SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {responsable === "CONVENIO" && (
            <div className="space-y-2">
              <Label htmlFor="convenio">Convenio</Label>
              <Input id="convenio" value={convenio} onChange={(e) => setConvenio(e.target.value)} />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="vence">Vencimiento (opcional)</Label>
            <Input id="vence" type="date" value={vence} onChange={(e) => setVence(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notas">Notas</Label>
            <Textarea id="notas" value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
          <div className="flex items-center justify-between border-t pt-4 font-medium"><span>Total</span><span>{cop(total)}</span></div>
          <Button className="w-full" disabled={pendiente || total <= 0 || (!orden && !pacienteId)} onClick={guardar}>
            {pendiente && <Loader2 className="animate-spin" />} Crear cuenta de cobro
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
