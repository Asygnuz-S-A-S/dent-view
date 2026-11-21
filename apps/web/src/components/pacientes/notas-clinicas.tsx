"use client";

// Adaptado de OpenDentist (MIT, © 2026 Clawnify) — https://github.com/clawnify/OpenDentist
import { Pencil } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { crearNota, editarNota } from "@/app/(app)/pacientes/clinico-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EstadoVacio } from "@/components/comunes/estado-vacio";

export type NotaVista = { id: string; texto: string; fecha: string; autor: string; editable: boolean };

function Nota({ nota }: { nota: NotaVista }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(nota.texto);
  const [pendiente, iniciar] = useTransition();
  const guardar = () =>
    iniciar(async () => {
      const r = await editarNota(nota.id, texto);
      if (r.error) { toast.error(r.error); return; }
      toast.success("Nota actualizada");
      setEditando(false);
    });
  return (
    <li className="space-y-2 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{nota.autor} · {nota.fecha}</span>
        {nota.editable && !editando && (
          <Button size="sm" variant="ghost" onClick={() => setEditando(true)}><Pencil /> Editar</Button>
        )}
      </div>
      {editando ? (
        <div className="space-y-2">
          <Textarea aria-label="Texto de la nota" value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} />
          <div className="flex gap-2">
            <Button size="sm" disabled={pendiente} onClick={guardar}>Guardar</Button>
            <Button size="sm" variant="outline" onClick={() => { setTexto(nota.texto); setEditando(false); }}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <p className="text-sm whitespace-pre-wrap">{nota.texto}</p>
      )}
    </li>
  );
}

export function NotasClinicas({ pacienteId, notas }: { pacienteId: string; notas: NotaVista[] }) {
  const [texto, setTexto] = useState("");
  const [pendiente, iniciar] = useTransition();
  function agregar(e: React.FormEvent) {
    e.preventDefault();
    iniciar(async () => {
      const r = await crearNota(pacienteId, texto);
      if (r.error) { toast.error(r.error); return; }
      toast.success("Nota agregada");
      setTexto("");
    });
  }
  return (
    <div className="space-y-4">
      <Card><CardContent>
        <form onSubmit={agregar} className="grid gap-3">
          <Label htmlFor="nota-nueva">Nueva nota clínica</Label>
          <Textarea id="nota-nueva" rows={3} maxLength={5000} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Evolución, hallazgos, indicaciones…" />
          <div><Button type="submit" disabled={pendiente || !texto.trim()}>Agregar nota</Button></div>
        </form>
      </CardContent></Card>
      {notas.length === 0 ? (
        <EstadoVacio titulo="Este paciente no tiene notas clínicas" />
      ) : (
        <ul className="space-y-3">{notas.map((n) => <Nota key={n.id} nota={n} />)}</ul>
      )}
      <p className="text-xs text-muted-foreground">Las notas son parte del registro clínico: no se pueden eliminar.</p>
    </div>
  );
}
