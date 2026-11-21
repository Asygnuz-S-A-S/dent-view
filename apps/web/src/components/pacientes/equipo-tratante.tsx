"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { agregarDoctorPaciente, quitarDoctorPaciente } from "@/app/(app)/pacientes/equipo-actions";
import { ConfirmarAccion } from "@/components/comunes/confirmar-accion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type DoctorDerivado = { doctorId: string; nombre: string; especialidad: string | null; ordenes: number; estudios: number; primera: string; ultima: string; servicios: string[] };
export type DoctorManual = { id: string; nombre: string; especialidad: string; desde: string; nota: string | null };

/** Equipo tratante: lo derivado de órdenes/estudios (solo lectura) y lo registrado a mano (recepción/admin). */
export function EquipoTratante({ pacienteId, derivados, manuales, doctores, gestionar }: {
  pacienteId: string; derivados: DoctorDerivado[]; manuales: DoctorManual[]; doctores: { id: string; nombre: string }[]; gestionar: boolean;
}) {
  const [pendiente, iniciar] = useTransition();
  const [doctorId, setDoctorId] = useState("");
  const [especialidad, setEspecialidad] = useState("");
  const [desde, setDesde] = useState(() => new Date().toISOString().slice(0, 10));
  const [nota, setNota] = useState("");

  const agregar = (e: React.FormEvent) => {
    e.preventDefault();
    iniciar(async () => {
      const r = await agregarDoctorPaciente({ pacienteId, doctorId, especialidad, desde, nota });
      if (r.error) return void toast.error(r.error);
      toast.success("Doctor agregado al equipo tratante");
      setDoctorId(""); setEspecialidad(""); setNota("");
    });
  };
  const quitar = (id: string) => iniciar(async () => {
    const r = await quitarDoctorPaciente(id);
    if (r.error) toast.error(r.error); else toast.success("Relación eliminada");
  });

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-medium">Según órdenes y estudios</h3>
        {derivados.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ningún doctor ha remitido a este paciente todavía.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {derivados.map((d) => (
              <li key={d.doctorId} className="space-y-1 rounded-lg border p-3 text-sm">
                <p className="font-medium">{d.nombre}{d.especialidad && <span className="font-normal text-muted-foreground"> · {d.especialidad}</span>}</p>
                <p className="text-muted-foreground">{d.ordenes} {d.ordenes === 1 ? "orden" : "órdenes"} · {d.estudios} {d.estudios === 1 ? "estudio" : "estudios"}</p>
                <p className="text-xs text-muted-foreground">Primera orden {d.primera} · última {d.ultima}</p>
                {d.servicios.length > 0 && <p className="text-xs text-muted-foreground">Motivo: {d.servicios.join(", ")}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Registrados por el centro</h3>
        {manuales.length === 0 && <p className="text-sm text-muted-foreground">Sin relaciones registradas a mano.</p>}
        <ul className="space-y-2">
          {manuales.map((m) => (
            <li key={m.id} className="flex items-start justify-between gap-2 rounded-lg border p-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{m.especialidad}: {m.nombre}</p>
                <p className="text-xs text-muted-foreground">Desde {m.desde}{m.nota ? ` · ${m.nota}` : ""}</p>
              </div>
              {gestionar && (
                <ConfirmarAccion titulo="¿Quitar esta relación?" descripcion={`Se retira a ${m.nombre} (${m.especialidad}) del equipo tratante. Queda registrado en la hoja de vida.`} confirmar="Quitar" onConfirmar={() => quitar(m.id)}>
                  <Button type="button" size="icon-sm" variant="ghost" disabled={pendiente} aria-label={`Quitar a ${m.nombre}`}><Trash2 /></Button>
                </ConfirmarAccion>
              )}
            </li>
          ))}
        </ul>
        {gestionar && (
          <form onSubmit={agregar} className="grid gap-3 rounded-lg border border-dashed p-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="eq-doctor">Doctor</Label>
              <Select value={doctorId} onValueChange={setDoctorId}>
                <SelectTrigger id="eq-doctor" className="w-full"><SelectValue placeholder="Elige un doctor" /></SelectTrigger>
                <SelectContent>{doctores.map((d) => <SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="eq-esp">Especialidad o tratamiento</Label>
              <Input id="eq-esp" value={especialidad} onChange={(e) => setEspecialidad(e.target.value)} placeholder="Ortodoncia, Diseño de sonrisa…" maxLength={80} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="eq-desde">Desde</Label>
              <Input id="eq-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="eq-nota">Nota (opcional)</Label>
              <Input id="eq-nota" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} />
            </div>
            <div className="sm:col-span-2"><Button type="submit" size="sm" disabled={pendiente}><Plus /> Agregar al equipo</Button></div>
          </form>
        )}
      </section>
    </div>
  );
}
