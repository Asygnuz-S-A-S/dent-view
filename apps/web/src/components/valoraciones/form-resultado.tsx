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
export function FormResultado({ valoracionId, inicial, completada, puedeEditar }: { valoracionId: string; inicial: ResultadoVista; completada: boolean; puedeEditar: boolean }) {
  const [f, setF] = useState({ ...inicial, presupuesto: inicial.presupuestoEstimado === null ? "" : String(inicial.presupuestoEstimado) });
  const [pendiente, iniciar] = useTransition();
  const [creds, setCreds] = useState<Credenciales | null>(null);
  const set = (k: "diagnosticoPreliminar" | "recomendaciones" | "tratamientoSugerido") => (e: React.ChangeEvent<HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const datos = () => ({ diagnosticoPreliminar: f.diagnosticoPreliminar, recomendaciones: f.recomendaciones, tratamientoSugerido: f.tratamientoSugerido, requierePresencial: f.requierePresencial, presupuestoEstimado: f.presupuesto.trim() ? Number(f.presupuesto.replace(/\D/g, "")) : null });
  const guardar = (completar: boolean) => iniciar(async () => {
    const r = await guardarResultado(valoracionId, datos(), completar);
    if (r.error) toast.error(r.error); else toast.success(completar ? "Valoración completada" : "Borrador guardado");
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
              <Button type="button" disabled={pendiente} onClick={() => iniciar(async () => {
                const r = await enviarResultado(valoracionId);
                if ("error" in r) toast.error(r.error); else setCreds(r.credenciales);
              })}>{pendiente ? <Loader2 className="animate-spin" /> : <Mail />} Enviar resultado al paciente</Button>
            )}
            <Button asChild variant="outline"><Link href="/agenda"><CalendarPlus /> Agendar cita presencial</Link></Button>
          </div>
        )}
        <CredencialesDialogo credenciales={creds} onCerrar={() => setCreds(null)} />
      </div>
    );
  }

  return (
    <form className="grid max-w-2xl gap-4" onSubmit={(e) => { e.preventDefault(); guardar(true); }}>
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
        <Button type="button" variant="outline" disabled={pendiente} onClick={() => guardar(false)}>Guardar borrador</Button>
        <Button type="submit" disabled={pendiente}>{pendiente && <Loader2 className="animate-spin" />} Marcar como completada</Button>
      </div>
    </form>
  );
}
