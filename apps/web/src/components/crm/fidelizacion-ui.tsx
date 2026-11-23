"use client";

import Link from "next/link";
import { useState } from "react";
import { inscribirEnSecuencia } from "@/app/(app)/crm/actions";
import { guardarFidelizacion } from "@/app/(app)/crm/fidelizacion/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { fechaCorta } from "@/lib/fechas";
import { SelectNativo, useAccion } from "./comun";

export function ConfigFidelizacionForm({ inicial, puedeEditar }: { inicial: { activa: boolean; diasControl: number; recordarCumpleanos: boolean }; puedeEditar: boolean }) {
  const [f, setF] = useState({ ...inicial, diasControl: String(inicial.diasControl) });
  const { pendiente, ejecutar } = useAccion();
  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); ejecutar(() => guardarFidelizacion({ activa: f.activa, diasControl: Number(f.diasControl), recordarCumpleanos: f.recordarCumpleanos }), "Configuración guardada"); }}>
      <label className="flex items-center gap-3 text-sm sm:col-span-2"><Switch checked={f.activa} disabled={!puedeEditar} onCheckedChange={(v) => setF({ ...f, activa: v })} aria-label="Fidelización activa" />
        <span><strong>Fidelización activa</strong> <span className="text-muted-foreground">(habilita las secuencias de paciente inactivo, control periódico y cumpleaños, y el cálculo del próximo control)</span></span></label>
      <div className="grid gap-1.5"><Label htmlFor="fid-dias">Días para el control periódico</Label><Input id="fid-dias" inputMode="numeric" value={f.diasControl} disabled={!puedeEditar} onChange={(e) => setF({ ...f, diasControl: e.target.value.replace(/\D/g, "") })} /><p className="text-xs text-muted-foreground">El próximo control se calcula desde la última visita (30 a 730 días).</p></div>
      <label className="flex items-center gap-3 self-end text-sm"><Switch checked={f.recordarCumpleanos} disabled={!puedeEditar} onCheckedChange={(v) => setF({ ...f, recordarCumpleanos: v })} aria-label="Recordar cumpleaños" /> Recordar cumpleaños</label>
      {puedeEditar ? <Button type="submit" disabled={pendiente} className="sm:col-span-2 sm:w-fit">{pendiente ? "Guardando…" : "Guardar"}</Button> : <p className="text-xs text-muted-foreground sm:col-span-2">Solo el administrador del centro puede cambiar esta configuración.</p>}
    </form>
  );
}

export type FilaPaciente = { id: string; nombre: string; correo: string | null; ultimaVisitaEn: string | null; proximoControlEn: string | null };

export function ListaSegmento({ filas, secuencias }: { filas: FilaPaciente[]; secuencias: { id: string; nombre: string }[] }) {
  const [sec, setSec] = useState("");
  const { pendiente, ejecutar } = useAccion();
  if (!filas.length) return <p className="rounded-md bg-muted px-4 py-6 text-center text-sm text-muted-foreground">Nadie en este segmento todavía.</p>;
  return (
    <div className="space-y-3">
      <div className="grid max-w-md gap-1.5"><Label htmlFor="seg-sec">Secuencia para inscribir</Label>
        <SelectNativo id="seg-sec" value={sec} onChange={(e) => setSec(e.target.value)}><option value="">{secuencias.length ? "Elige una secuencia" : "No hay secuencias: crea una primero"}</option>{secuencias.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</SelectNativo></div>
      <ul className="divide-y rounded-lg border bg-card">
        {filas.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
            <span className="min-w-0"><Link href={`/pacientes/${p.id}`} className="font-medium hover:underline">{p.nombre}</Link><span className="block text-xs text-muted-foreground">Última visita: {p.ultimaVisitaEn ? fechaCorta(new Date(p.ultimaVisitaEn)) : "sin registro"}{p.proximoControlEn ? ` · control: ${fechaCorta(new Date(p.proximoControlEn))}` : ""}</span></span>
            <Button size="sm" variant="outline" disabled={!sec || pendiente} aria-label={`Inscribir a ${p.nombre}`} onClick={() => ejecutar(() => inscribirEnSecuencia(sec, { pacienteId: p.id }), "Inscrito en la secuencia")}>Inscribir</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
