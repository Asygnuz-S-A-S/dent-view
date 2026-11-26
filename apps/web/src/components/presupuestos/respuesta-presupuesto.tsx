"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { aceptarPresupuesto, preguntarPresupuesto, rechazarPresupuesto } from "@/app/presupuesto/[token]/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Modo = "aceptar" | "rechazar" | "pregunta" | null;

/** Acciones del paciente sobre la cotización: aceptar (nombre, documento y casilla), rechazar o preguntar. */
export function RespuestaPresupuesto({ token, texto }: { token: string; texto: string }) {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>(null);
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ nombre: "", documento: "", acepto: false, motivo: "", pregunta: "" });
  const ejecutar = (fn: () => Promise<{ error?: string }>, ok: string, refrescar = true) => iniciar(async () => {
    setError(null);
    const r = await fn();
    if (r.error) return void setError(r.error);
    toast.success(ok);
    setModo(null);
    setF((x) => ({ ...x, pregunta: "" }));
    if (refrescar) router.refresh();
  });
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <Button size="lg" variant={modo === "aceptar" ? "default" : "outline"} onClick={() => { setModo("aceptar"); setError(null); }}>Aceptar cotización</Button>
        <Button size="lg" variant="outline" onClick={() => { setModo("rechazar"); setError(null); }}>Rechazar</Button>
        <Button size="lg" variant="outline" onClick={() => { setModo("pregunta"); setError(null); }}>Tengo una pregunta</Button>
      </div>
      {modo === "aceptar" && (
        <form className="grid gap-4 rounded-lg border p-4" onSubmit={(e) => { e.preventDefault(); ejecutar(() => aceptarPresupuesto(token, { nombre: f.nombre, documento: f.documento, acepto: f.acepto }), "Cotización aceptada"); }}>
          <p className="text-sm text-pretty" data-testid="texto-aceptacion">{texto}</p>
          <div className="grid gap-2"><Label htmlFor="acepta-nombre">Nombre completo</Label><Input id="acepta-nombre" autoComplete="name" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} maxLength={120} /></div>
          <div className="grid gap-2"><Label htmlFor="acepta-doc">Número de documento</Label><Input id="acepta-doc" inputMode="text" autoComplete="off" value={f.documento} onChange={(e) => setF({ ...f, documento: e.target.value })} maxLength={20} /></div>
          <div className="flex items-start gap-3">
            <Checkbox id="acepta-casilla" checked={f.acepto} onCheckedChange={(v) => setF({ ...f, acepto: v === true })} className="mt-0.5" />
            <Label htmlFor="acepta-casilla" className="text-sm leading-snug font-normal">He leído y acepto lo anterior.</Label>
          </div>
          {error && <p role="alert" data-testid="error-respuesta" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" size="lg" disabled={pendiente}>Confirmar aceptación</Button>
        </form>
      )}
      {modo === "rechazar" && (
        <form className="grid gap-3 rounded-lg border p-4" onSubmit={(e) => { e.preventDefault(); ejecutar(() => rechazarPresupuesto(token, f.motivo), "Respuesta registrada"); }}>
          <Label htmlFor="rechazo-motivo">¿Quieres contarnos por qué? (opcional)</Label>
          <Textarea id="rechazo-motivo" value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} maxLength={500} rows={3} />
          {error && <p role="alert" data-testid="error-respuesta" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" size="lg" variant="destructive" disabled={pendiente}>Rechazar cotización</Button>
        </form>
      )}
      {modo === "pregunta" && (
        <form className="grid gap-3 rounded-lg border p-4" onSubmit={(e) => { e.preventDefault(); ejecutar(() => preguntarPresupuesto(token, f.pregunta), "Enviamos tu pregunta al centro", false); }}>
          <Label htmlFor="pregunta-texto">Tu pregunta para el centro</Label>
          <Textarea id="pregunta-texto" value={f.pregunta} onChange={(e) => setF({ ...f, pregunta: e.target.value })} maxLength={1000} rows={3} />
          <p className="text-xs text-muted-foreground">No escribas datos de salud: el centro te responderá por el medio que ya conoce.</p>
          {error && <p role="alert" data-testid="error-respuesta" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" size="lg" disabled={pendiente}>Enviar pregunta</Button>
        </form>
      )}
    </div>
  );
}
