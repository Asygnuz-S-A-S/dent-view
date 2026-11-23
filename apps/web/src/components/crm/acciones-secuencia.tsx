"use client";

import { Download, FlaskConical, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { activarSecuencia, eliminarSecuencia, instalarPlantilla, simular } from "@/app/(app)/crm/secuencias/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import type { FilaSimulacion } from "@/lib/crm-motor-datos";
import { useAccion } from "./comun";

export function ToggleActiva({ id, activa, nombre }: { id: string; activa: boolean; nombre: string }) {
  const { pendiente, ejecutar } = useAccion();
  return (
    <label className="flex items-center gap-2 text-sm">
      <Switch checked={activa} disabled={pendiente} aria-label={`${activa ? "Desactivar" : "Activar"} ${nombre}`} onCheckedChange={(v) => ejecutar(() => activarSecuencia(id, v), v ? "Secuencia activada" : "Secuencia desactivada")} />
      {activa ? "Activa" : "Inactiva"}
    </label>
  );
}

export function InstalarPlantilla({ clave, nombre }: { clave: string; nombre: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  return (
    <Button size="sm" variant="outline" disabled={pendiente} aria-label={`Instalar plantilla: ${nombre}`} onClick={() => iniciar(async () => {
      const r = await instalarPlantilla(clave);
      if (r.error) return void toast.error(r.error);
      toast.success("Plantilla instalada (inactiva). Revísala y actívala cuando quieras.");
      router.push(`/crm/secuencias/${r.id}`);
    })}><Download /> Instalar</Button>
  );
}

export function Eliminar({ id, nombre }: { id: string; nombre: string }) {
  const router = useRouter();
  const { pendiente, ejecutar } = useAccion(() => router.push("/crm/secuencias"));
  return (
    <Button size="sm" variant="ghost" disabled={pendiente} onClick={() => { if (confirm(`¿Eliminar «${nombre}»? Se pierde su seguimiento en curso.`)) ejecutar(() => eliminarSecuencia(id), "Secuencia eliminada"); }}><Trash2 /> Eliminar</Button>
  );
}

export function Simular({ id }: { id: string }) {
  const [abierto, setAbierto] = useState(false);
  const [res, setRes] = useState<{ filas: FilaSimulacion[]; total: number } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const correr = () => iniciar(async () => { const r = await simular(id); if (r.error) toast.error(r.error); else setRes({ filas: r.filas!, total: r.total! }); });
  return (
    <Dialog open={abierto} onOpenChange={(a) => { setAbierto(a); if (a) correr(); else setRes(null); }}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><FlaskConical /> Simular</Button></DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Simulación de hoy</DialogTitle><DialogDescription>A quién contactaría esta secuencia hoy y con qué mensaje. No envía nada ni cambia datos.</DialogDescription></DialogHeader>
        {pendiente && <p className="text-sm text-muted-foreground" role="status">Calculando…</p>}
        {res && res.filas.length === 0 && <p className="rounded-md bg-muted px-4 py-6 text-center text-sm text-muted-foreground" data-testid="simulacion-vacia">Hoy no contactaría a nadie. Cuando alguien cumpla el disparador, aparecerá aquí.</p>}
        {res && res.filas.length > 0 && (
          <div className="max-h-[60vh] space-y-3 overflow-auto" data-testid="simulacion">
            <p className="text-sm text-muted-foreground">{res.total} {res.total === 1 ? "persona" : "personas"}{res.total > res.filas.length ? ` (se muestran ${res.filas.length})` : ""}.</p>
            <ul className="space-y-3">
              {res.filas.map((f, i) => (
                <li key={i} className="space-y-1 rounded-md border p-3 text-sm">
                  <p className="flex flex-wrap items-center justify-between gap-2"><strong>{f.nombre}</strong><Badge variant={f.resultado.startsWith("Enviaría") || f.resultado.startsWith("Crearía") ? "success" : "warning"}>{f.resultado}</Badge></p>
                  <p className="text-xs text-muted-foreground">{f.motivo} · paso {f.paso}</p>
                  {f.asunto && <p className="font-medium">{f.asunto}</p>}
                  {f.cuerpo && <p className="text-xs whitespace-pre-line text-muted-foreground">{f.cuerpo}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
