"use client";

// Adaptado de OpenDentist (MIT, © 2026 Clawnify) — https://github.com/clawnify/OpenDentist
import { numeroOrden } from "@/lib/ordenes";
import { Pencil, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { guardarCaso } from "@/app/(app)/laboratorio/actions";
import { PacienteCombobox, type PacienteOpcion } from "@/components/ordenes/paciente-combobox";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { InputMoneda } from "@/components/comunes/input-moneda";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type CasoForm = {
  id?: string; pacienteId: string; ordenId: string; laboratorio: string; tipo: string; dientes: string;
  valor: string; enviado: string; entregaEsperada: string; notas: string; // fechas YYYY-MM-DD
};
export type OrdenOpcion = { id: string; pacienteId: string; numero: number };
const NINGUNA = "ninguna";
const VACIO: CasoForm = { pacienteId: "", ordenId: "", laboratorio: "", tipo: "", dientes: "", valor: "0", enviado: "", entregaEsperada: "", notas: "" };

export function CasoDialog({ caso, pacientes, ordenes, pacienteFijo }: {
  caso?: CasoForm; pacientes: PacienteOpcion[]; ordenes: OrdenOpcion[]; pacienteFijo?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState<CasoForm>(caso ?? { ...VACIO, pacienteId: pacienteFijo ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const set = (k: keyof CasoForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    iniciar(async () => {
      const r = await guardarCaso({ ...f, id: f.id ?? "" });
      if (r.error) return setError(r.error);
      toast.success(caso ? "Caso actualizado" : "Caso creado");
      setAbierto(false);
      if (!caso) setF({ ...VACIO, pacienteId: pacienteFijo ?? "" });
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={(a) => { if (a && caso) setF(caso); setAbierto(a); }}>
      <DialogTrigger asChild>
        {caso ? <Button size="icon" variant="ghost" aria-label="Editar caso"><Pencil /></Button> : <Button><Plus /> Nuevo caso</Button>}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{caso ? "Editar caso de laboratorio" : "Nuevo caso de laboratorio"}</DialogTitle></DialogHeader>
        <form onSubmit={enviar} className="grid gap-4 sm:grid-cols-2">
          {!pacienteFijo && (
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="lab-paciente">Paciente</Label>
              <PacienteCombobox id="lab-paciente" pacientes={pacientes} value={f.pacienteId} onChange={(id) => setF({ ...f, pacienteId: id, ordenId: "" })} />
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="lab-orden">Orden (opcional)</Label>
            <Select value={f.ordenId || NINGUNA} onValueChange={(v) => setF({ ...f, ordenId: v === NINGUNA ? "" : v })}>
              <SelectTrigger id="lab-orden" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NINGUNA}>Sin orden</SelectItem>
                {ordenes.filter((o) => o.pacienteId === f.pacienteId).map((o) => <SelectItem key={o.id} value={o.id}>{numeroOrden(o.numero)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2"><Label htmlFor="lab-nombre">Laboratorio</Label><Input id="lab-nombre" value={f.laboratorio} onChange={set("laboratorio")} required /></div>
          <div className="grid gap-2"><Label htmlFor="lab-tipo">Tipo de trabajo</Label><Input id="lab-tipo" value={f.tipo} onChange={set("tipo")} placeholder="Modelo en resina, guía quirúrgica…" required /></div>
          <div className="grid gap-2"><Label htmlFor="lab-dientes">Dientes</Label><Input id="lab-dientes" value={f.dientes} onChange={set("dientes")} placeholder="11, 12, 21" /></div>
          <div className="grid gap-2"><Label htmlFor="lab-valor">Valor (COP)</Label><InputMoneda id="lab-valor" value={f.valor} onValueChange={(v) => setF({ ...f, valor: v })} /></div>
          <div className="grid gap-2"><Label htmlFor="lab-enviado">Fecha de envío</Label><Input id="lab-enviado" type="date" value={f.enviado} onChange={set("enviado")} /></div>
          <div className="grid gap-2"><Label htmlFor="lab-entrega">Entrega esperada</Label><Input id="lab-entrega" type="date" value={f.entregaEsperada} onChange={set("entregaEsperada")} /></div>
          <div className="grid gap-2 sm:col-span-2"><Label htmlFor="lab-notas">Notas</Label><Textarea id="lab-notas" rows={3} value={f.notas} onChange={set("notas")} /></div>
          {error && <p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p>}
          <DialogFooter className="sm:col-span-2"><Button type="submit" disabled={pendiente}>Guardar</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
