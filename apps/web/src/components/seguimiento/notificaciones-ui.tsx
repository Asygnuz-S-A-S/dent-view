"use client";

// Implementación independiente (sala limpia) a partir de docs/sala-limpia/04-notificaciones.md
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { guardarHorasRecordatorio, guardarPlantilla, procesarCola, restaurarPlantilla } from "@/app/(app)/notificaciones/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ProcesarCola() {
  const [pendiente, iniciar] = useTransition();
  return (
    <Button disabled={pendiente} onClick={() => iniciar(async () => {
      const r = await procesarCola();
      if (r.error) toast.error(r.error); else toast.success(`Enviados ${r.enviados}, fallidos ${r.fallidos}, omitidos ${r.omitidos}`);
    })}>Procesar cola ahora</Button>
  );
}

export function HorasRecordatorio({ inicial }: { inicial: number }) {
  const [h, setH] = useState(String(inicial));
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="flex items-end gap-2">
      <div className="grid gap-1.5"><Label htmlFor="horas-rec">Recordatorio de cita: horas de antelación</Label><Input id="horas-rec" className="w-28" inputMode="numeric" value={h} onChange={(e) => setH(e.target.value)} /></div>
      <Button variant="outline" disabled={pendiente} onClick={() => iniciar(async () => {
        const r = await guardarHorasRecordatorio(Number(h));
        if (r.error) toast.error(r.error); else toast.success("Guardado");
      })}>Guardar</Button>
    </div>
  );
}

export function PlantillaEditor({ tipo, etiqueta, asunto, cuerpo, personalizada }: { tipo: string; etiqueta: string; asunto: string; cuerpo: string; personalizada: boolean }) {
  const [a, setA] = useState(asunto);
  const [c, setC] = useState(cuerpo);
  const [pendiente, iniciar] = useTransition();
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{etiqueta} {personalizada && <span className="text-xs font-normal text-muted-foreground">(personalizada)</span>}</CardTitle></CardHeader>
      <CardContent className="grid gap-2">
        <Label htmlFor={`pl-a-${tipo}`}>Asunto</Label>
        <Input id={`pl-a-${tipo}`} value={a} onChange={(e) => setA(e.target.value)} />
        <Label htmlFor={`pl-c-${tipo}`}>Cuerpo</Label>
        <Textarea id={`pl-c-${tipo}`} rows={4} value={c} onChange={(e) => setC(e.target.value)} />
        <div className="flex gap-2">
          <Button size="sm" disabled={pendiente} onClick={() => iniciar(async () => {
            const r = await guardarPlantilla({ tipo: tipo as "CITA_CREADA", asunto: a, cuerpo: c });
            if (r.error) toast.error(r.error); else toast.success("Plantilla guardada");
          })}>Guardar</Button>
          {personalizada && <Button size="sm" variant="outline" disabled={pendiente} onClick={() => iniciar(async () => { await restaurarPlantilla(tipo); toast.success("Restaurada"); })}>Usar la del sistema</Button>}
        </div>
      </CardContent>
    </Card>
  );
}
