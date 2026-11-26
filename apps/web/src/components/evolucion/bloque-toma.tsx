"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { registrarToma } from "@/app/(app)/evolucion/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const sel = "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30";

/** Formulario del registro de toma (radiología): solo inserta; el técnico es quien lo registra. */
export function FormularioToma({ ordenId: ordenFija, ordenes, salas }: { ordenId?: string; ordenes?: { id: string; etiqueta: string }[]; salas: { id: string; nombre: string }[] }) {
  const [ordenElegida, setOrdenElegida] = useState("");
  const ordenId = ordenFija ?? ordenElegida;
  const [salaId, setSalaId] = useState("");
  const [equipo, setEquipo] = useState("");
  const [repeticiones, setRepeticiones] = useState("0");
  const [motivoRepeticion, setMotivoRepeticion] = useState("");
  const [incidencias, setIncidencias] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    iniciar(async () => {
      const r = await registrarToma({ ordenId, salaId, equipo, repeticiones, motivoRepeticion, incidencias });
      if (r.error) { setError(r.error); return; }
      toast.success("Toma registrada");
      setSalaId(""); setEquipo(""); setRepeticiones("0"); setMotivoRepeticion(""); setIncidencias("");
    });
  };
  return (
    <form onSubmit={enviar} className="grid gap-3 sm:grid-cols-2" aria-label="Registrar toma">
      {!ordenFija && (
        <div className="space-y-1 sm:col-span-2"><Label htmlFor="toma-orden">Orden</Label>
          <select id="toma-orden" className={sel} value={ordenElegida} onChange={(e) => setOrdenElegida(e.target.value)} required><option value="">Elige la orden</option>{(ordenes ?? []).map((o) => <option key={o.id} value={o.id}>{o.etiqueta}</option>)}</select></div>
      )}
      <div className="space-y-1"><Label htmlFor="toma-sala">Sala</Label>
        <select id="toma-sala" className={sel} value={salaId} onChange={(e) => setSalaId(e.target.value)}><option value="">Sin sala</option>{salas.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></div>
      <div className="space-y-1"><Label htmlFor="toma-equipo">Equipo o nota</Label><Input id="toma-equipo" value={equipo} maxLength={200} onChange={(e) => setEquipo(e.target.value)} /></div>
      <div className="space-y-1"><Label htmlFor="toma-rep">Repeticiones</Label><Input id="toma-rep" type="number" min={0} max={20} value={repeticiones} onChange={(e) => setRepeticiones(e.target.value)} /></div>
      {Number(repeticiones) > 0 && <div className="space-y-1"><Label htmlFor="toma-motivo">Motivo de la repetición</Label><Input id="toma-motivo" value={motivoRepeticion} maxLength={300} onChange={(e) => setMotivoRepeticion(e.target.value)} /></div>}
      <div className="space-y-1 sm:col-span-2"><Label htmlFor="toma-inc">Incidencias</Label><Textarea id="toma-inc" rows={2} maxLength={1000} value={incidencias} onChange={(e) => setIncidencias(e.target.value)} /></div>
      {error && <p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2"><Button type="submit" disabled={pendiente}>Registrar toma</Button></div>
    </form>
  );
}
