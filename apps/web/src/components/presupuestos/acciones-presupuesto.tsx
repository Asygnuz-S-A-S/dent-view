"use client";

import { Copy, FilePlus2, Pencil, Send, ShoppingCart, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { anularPresupuesto, convertirEnOrden, duplicarPresupuesto, enviarPresupuesto, previsualizarConversion, type CredencialesPres, type VistaConversion } from "@/app/(app)/presupuestos/actions";
import { SelectNativo } from "@/components/crm/comun";
import { DialogoMotivo } from "@/components/comunes/dialogo-motivo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cop } from "@/lib/precios";
import { CredencialesPresupuesto } from "./credenciales-presupuesto";

export function AccionesPresupuesto({ id, puedeEditar, puedeEnviar, puedeReenviar, puedeAnular, puedeConvertir, convenios }: {
  id: string; puedeEditar: boolean; puedeEnviar: boolean; puedeReenviar: boolean; puedeAnular: boolean; puedeConvertir: boolean; convenios: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [credenciales, setCredenciales] = useState<CredencialesPres | null>(null);
  const [convertir, setConvertir] = useState(false);

  const enviar = () => iniciar(async () => {
    const r = await enviarPresupuesto(id);
    if ("error" in r) return void toast.error(r.error);
    setCredenciales(r.credenciales);
    router.refresh();
  });
  const duplicar = () => iniciar(async () => {
    const r = await duplicarPresupuesto(id);
    if ("error" in r) return void toast.error(r.error);
    toast.success("Nueva versión creada como borrador");
    router.push(`/presupuestos/${r.id}/editar`);
  });

  return (
    <div className="flex flex-wrap gap-2">
      {puedeEditar && <Button asChild variant="outline"><Link href={`/presupuestos/${id}/editar`}><Pencil /> Editar</Link></Button>}
      {(puedeEnviar || puedeReenviar) && <Button onClick={enviar} disabled={pendiente}><Send /> {puedeEnviar ? "Enviar al paciente" : "Reenviar (enlace y código nuevos)"}</Button>}
      {puedeConvertir && <Button onClick={() => setConvertir(true)}><ShoppingCart /> Convertir en orden</Button>}
      <Button variant="outline" onClick={duplicar} disabled={pendiente}><Copy /> Duplicar</Button>
      {puedeAnular && (
        <DialogoMotivo titulo="Anular cotización" descripcion="El enlace del paciente deja de funcionar de inmediato. Esta acción queda en el historial." confirmar="Anular cotización" exito="Cotización anulada"
          ejecutar={async (motivo) => { const r = await anularPresupuesto(id, motivo); if (!r.error) router.refresh(); return r; }}>
          <Button variant="outline"><XCircle /> Anular</Button>
        </DialogoMotivo>
      )}
      <CredencialesPresupuesto credenciales={credenciales} onCerrar={() => setCredenciales(null)} />
      {convertir && <ConvertirDialogo id={id} convenios={convenios} onCerrar={() => setConvertir(false)} />}
    </div>
  );
}

function ConvertirDialogo({ id, convenios, onCerrar }: { id: string; convenios: { id: string; nombre: string }[]; onCerrar: () => void }) {
  const router = useRouter();
  const [convenioId, setConvenioId] = useState("");
  const [vista, setVista] = useState<VistaConversion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmo, setConfirmo] = useState(false);
  const [pendiente, iniciar] = useTransition();
  useEffect(() => {
    let vigente = true;
    previsualizarConversion(id, convenioId || null).then((r) => {
      if (!vigente) return;
      if ("error" in r) { setError(r.error); setVista(null); } else { setError(null); setVista(r); setConfirmo(false); }
    });
    return () => { vigente = false; };
  }, [id, convenioId]);
  const crear = () => iniciar(async () => {
    const r = await convertirEnOrden(id, { convenioId: convenioId || null, confirmo });
    if ("error" in r) return void toast.error(r.error);
    toast.success("Orden creada");
    router.push(`/ordenes/${r.ordenId}`);
    router.refresh();
  });
  return (
    <Dialog open onOpenChange={(a) => !a && onCerrar()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Convertir en orden</DialogTitle>
          <DialogDescription>Se crea la orden con los servicios del catálogo y sus precios de hoy. Los ítems libres no pasan a la orden: quedan como nota.</DialogDescription>
        </DialogHeader>
        {convenios.length > 0 && (
          <div className="grid gap-2"><Label htmlFor="conv-convenio">Convenio de la orden</Label>
            <SelectNativo id="conv-convenio" value={convenioId} onChange={(e) => setConvenioId(e.target.value)}><option value="">Sin convenio</option>{convenios.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</SelectNativo></div>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {vista && (
          <div className="space-y-3 text-sm" data-testid="vista-conversion">
            <ul className="divide-y rounded-md border">
              {vista.lineas.map((l, i) => (
                <li key={i} className="flex items-start justify-between gap-3 p-2">
                  <span className="min-w-0 break-words">{l.cantidad} × {l.descripcion}</span>
                  <span className="shrink-0 text-right tabular-nums">{l.cotizado !== l.actual ? <><s className="text-muted-foreground">{cop(l.cotizado)}</s> {cop(l.actual)}</> : cop(l.actual)}</span>
                </li>
              ))}
              {vista.libres.map((l, i) => <li key={`l${i}`} className="flex justify-between gap-3 p-2 text-muted-foreground"><span className="min-w-0 break-words">{l.cantidad} × {l.descripcion} (libre, solo nota)</span><span className="tabular-nums">{cop(l.valor)}</span></li>)}
            </ul>
            <p className="flex justify-between font-medium"><span>Total cotizado</span><span className="tabular-nums">{cop(vista.totalCotizado)}</span></p>
            <p className="flex justify-between font-medium"><span>Total de la orden</span><span className="tabular-nums">{cop(vista.totalOrden)}</span></p>
            {vista.difiere && (
              <div className="flex items-start gap-3 rounded-md bg-warning-soft p-3 text-warning-ink" role="alert">
                <Checkbox id="conv-confirmo" checked={confirmo} onCheckedChange={(v) => setConfirmo(v === true)} className="mt-0.5" />
                <Label htmlFor="conv-confirmo" className="text-sm leading-snug font-normal">Los valores de la orden no coinciden con lo cotizado (precios actualizados, descuentos o ítems libres). Confirmo que quiero crear la orden así.</Label>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={crear} disabled={pendiente || !vista || !vista.hayCatalogo || (vista.difiere && !confirmo)}><FilePlus2 /> Crear orden</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
