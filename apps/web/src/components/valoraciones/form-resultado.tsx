"use client";

import { CalendarPlus, Loader2, Mail } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { enviarResultado, guardarResultado, type Credenciales } from "@/app/(app)/valoraciones/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cop } from "@/lib/precios";
import { CredencialesDialogo } from "./credenciales-dialogo";

export type ResultadoVista = { diagnosticoPreliminar: string; recomendaciones: string; tratamientoSugerido: string; requierePresencial: boolean; presupuestoEstimado: number | null };

/** Formulario de la valoración (diagnóstico preliminar, recomendaciones, tratamiento, presupuesto) y envío del resultado. */
export function FormResultado({ valoracionId, pacienteId, inicial, completada, enviada, puedeEditar }: { valoracionId: string; pacienteId: string | null; inicial: ResultadoVista; completada: boolean; enviada: boolean; puedeEditar: boolean }) {
  const [f, setF] = useState({ ...inicial, presupuesto: inicial.presupuestoEstimado === null ? "" : String(inicial.presupuestoEstimado) });
  const [pendiente, iniciar] = useTransition();
  const [creds, setCreds] = useState<Credenciales | null>(null);
  const set = (k: "diagnosticoPreliminar" | "recomendaciones" | "tratamientoSugerido") => (e: React.ChangeEvent<HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const datos = () => ({ diagnosticoPreliminar: f.diagnosticoPreliminar, recomendaciones: f.recomendaciones, tratamientoSugerido: f.tratamientoSugerido, requierePresencial: f.requierePresencial, presupuestoEstimado: f.presupuesto.trim() ? Number(f.presupuesto.replace(/\D/g, "")) : null });
  const enviar = async () => {
    const r = await enviarResultado(valoracionId);
    if ("error" in r) toast.error(r.error); else setCreds(r.credenciales);
  };
  const guardar = () => iniciar(async () => {
    const r = await guardarResultado(valoracionId, datos(), false);
    if (r.error) toast.error(r.error); else toast.success("Borrador guardado");
  });
  // Un solo paso: guarda, completa y envía el resultado al paciente.
  const completarYEnviar = () => iniciar(async () => {
    const r = await guardarResultado(valoracionId, datos(), true);
    if (r.error) return void toast.error(r.error);
    toast.success("Valoración completada");
    await enviar();
  });

  if (completada || !puedeEditar) {
    return (
      <div className="space-y-4 text-sm">
        {!inicial.diagnosticoPreliminar && <p className="text-muted-foreground">Aún no hay valoración escrita.</p>}
        {inicial.diagnosticoPreliminar && (
          <dl className="grid gap-3">
            {([["Diagnóstico preliminar", inicial.diagnosticoPreliminar], ["Recomendaciones", inicial.recomendaciones], ["Tratamiento sugerido", inicial.tratamientoSugerido]] as const).filter(([, v]) => v).map(([k, v]) => (
              <div key={k}><dt className="font-medium">{k}</dt><dd className="whitespace-pre-wrap text-muted-foreground">{v}</dd></div>
            ))}
            <div><dt className="font-medium">Requiere atención presencial</dt><dd className="text-muted-foreground">{inicial.requierePresencial ? "Sí" : "No"}</dd></div>
            {inicial.presupuestoEstimado !== null && <div><dt className="font-medium">Presupuesto estimado</dt><dd className="text-muted-foreground">{cop(inicial.presupuestoEstimado)}</dd></div>}
          </dl>
        )}
        {completada && (
          <div className="flex flex-wrap gap-2">
            {puedeEditar && (
              <Button type="button" disabled={pendiente} variant={enviada ? "outline" : "default"} onClick={() => iniciar(enviar)}>{pendiente ? <Loader2 className="animate-spin" /> : <Mail />} {enviada ? "Reenviar resultado al paciente" : "Enviar resultado al paciente"}</Button>
            )}
            <Button asChild variant="outline"><Link href={pacienteId ? `/agenda?paciente=${pacienteId}` : "/agenda"}><CalendarPlus /> Agendar cita presencial</Link></Button>
          </div>
        )}
        <CredencialesDialogo credenciales={creds} onCerrar={() => setCreds(null)} />
      </div>
    );
  }

  return (
    <form className="grid max-w-2xl gap-4" onSubmit={(e) => { e.preventDefault(); completarYEnviar(); }}>
      <div className="grid gap-2">
        <Label htmlFor="diagnostico">Diagnóstico preliminar</Label>
        <Textarea id="diagnostico" value={f.diagnosticoPreliminar} onChange={set("diagnosticoPreliminar")} maxLength={3000} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="recomendaciones">Recomendaciones</Label>
        <Textarea id="recomendaciones" value={f.recomendaciones} onChange={set("recomendaciones")} maxLength={3000} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="tratamiento">Tratamiento sugerido</Label>
        <Textarea id="tratamiento" value={f.tratamientoSugerido} onChange={set("tratamientoSugerido")} maxLength={2000} />
      </div>
      <div className="grid gap-2 sm:max-w-xs">
        <Label htmlFor="presupuesto">Presupuesto estimado (COP)</Label>
        <Input id="presupuesto" inputMode="numeric" value={f.presupuesto} onChange={(e) => setF((p) => ({ ...p, presupuesto: e.target.value.replace(/\D/g, "") }))} placeholder="0" />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="presencial" checked={f.requierePresencial} onCheckedChange={(c) => setF((p) => ({ ...p, requierePresencial: c === true }))} />
        <Label htmlFor="presencial">Requiere atención presencial</Label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pendiente}>{pendiente && <Loader2 className="animate-spin" />} Completar y enviar al paciente</Button>
        <Button type="button" variant="outline" disabled={pendiente} onClick={guardar}>Guardar borrador</Button>
      </div>
      <p className="text-xs text-muted-foreground">Al completar, el paciente recibe un correo con un acceso para ver el resultado (el diagnóstico no viaja en el correo).</p>
      <CredencialesDialogo credenciales={creds} onCerrar={() => setCreds(null)} />
    </form>
  );
}
