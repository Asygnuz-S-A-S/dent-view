"use client";

import { FileUp, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { crearLead, importarLeads } from "@/app/(app)/crm/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_BYTES_CSV, MAX_FILAS_CSV, ORIGENES, ETIQUETA_ORIGEN } from "@/lib/crm";
import { SelectNativo, useAccion } from "./comun";

export type Responsable = { id: string; nombre: string };
const VACIO = { nombre: "", telefono: "", correo: "", ciudad: "", interes: "", origen: "OTRO", valorEstimado: "", responsableId: "", consentimientoMercadeo: false };

export function AltaLead({ responsables }: { responsables: Responsable[] }) {
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState(VACIO);
  const { pendiente, ejecutar } = useAccion(() => { setAbierto(false); setF(VACIO); });
  const campo = (k: keyof typeof VACIO) => ({ id: `lead-${k}`, value: f[k] as string, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value }) });
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild><Button><Plus /> Nuevo lead</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nuevo lead</DialogTitle><DialogDescription>Una persona interesada que aún no es paciente. Se necesita al menos un teléfono o un correo.</DialogDescription></DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); ejecutar(() => crearLead({ ...f, origen: f.origen as (typeof ORIGENES)[number], valorEstimado: f.valorEstimado || null }), "Lead creado"); }}>
          <div className="grid gap-1.5"><Label htmlFor="lead-nombre">Nombre</Label><Input {...campo("nombre")} required maxLength={120} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label htmlFor="lead-telefono">Teléfono</Label><Input {...campo("telefono")} inputMode="tel" maxLength={30} /></div>
            <div className="grid gap-1.5"><Label htmlFor="lead-correo">Correo</Label><Input {...campo("correo")} type="email" maxLength={120} /></div>
            <div className="grid gap-1.5"><Label htmlFor="lead-interes">Interés</Label><Input {...campo("interes")} maxLength={120} placeholder="p. ej. valoración general" /></div>
            <div className="grid gap-1.5"><Label htmlFor="lead-ciudad">Ciudad</Label><Input {...campo("ciudad")} maxLength={80} /></div>
            <div className="grid gap-1.5"><Label htmlFor="lead-origen">Origen</Label><SelectNativo {...campo("origen")}>{ORIGENES.map((o) => <option key={o} value={o}>{ETIQUETA_ORIGEN[o]}</option>)}</SelectNativo></div>
            <div className="grid gap-1.5"><Label htmlFor="lead-valorEstimado">Valor estimado (COP)</Label><Input {...campo("valorEstimado")} inputMode="numeric" /></div>
          </div>
          <div className="grid gap-1.5"><Label htmlFor="lead-responsableId">Responsable</Label>
            <SelectNativo {...campo("responsableId")}><option value="">Sin responsable</option>{responsables.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}</SelectNativo>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 size-4" checked={f.consentimientoMercadeo} onChange={(e) => setF({ ...f, consentimientoMercadeo: e.target.checked })} />
            <span>La persona aceptó recibir información comercial del centro. <span className="text-muted-foreground">Sin esto, las secuencias automáticas no le enviarán correos de mercadeo.</span></span>
          </label>
          <Button type="submit" disabled={pendiente}>{pendiente ? "Guardando…" : "Crear lead"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ImportarCsv() {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [errores, setErrores] = useState<{ fila: number; motivo: string }[]>([]);
  const { pendiente, ejecutar } = useAccion();
  const importar = () => ejecutar(async () => {
    // Next rechaza con excepción los cuerpos de más de 1 MB: se valida antes de enviar.
    if (new Blob([texto]).size > MAX_BYTES_CSV) { setErrores([]); return { error: "El archivo es demasiado grande (máximo 900 KB). Divídelo en partes y vuelve a intentarlo." }; }
    let r: Awaited<ReturnType<typeof importarLeads>>;
    try { r = await importarLeads(texto); } catch { return { error: "No se pudo importar el archivo. Revisa que sea un CSV válido e inténtalo de nuevo." }; }
    setErrores(r.errores ?? []);
    if (r.error) return { error: r.error };
    toast.success(`${r.creados} leads creados${r.repetidos ? `, ${r.repetidos} ya existían` : ""}${r.errores?.length ? `, ${r.errores.length} filas con error` : ""}`);
    if (!r.errores?.length) { setAbierto(false); setTexto(""); }
    return {};
  });
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild><Button variant="outline"><FileUp /> Importar CSV</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar leads desde CSV</DialogTitle>
          <DialogDescription>Columnas: nombre (obligatoria), telefono, correo, ciudad, origen, interes. Máximo {MAX_FILAS_CSV} filas y 900 KB. Los leads importados no traen consentimiento de mercadeo: solo reciben seguimiento manual hasta que lo den.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5"><Label htmlFor="csv-archivo">Archivo .csv</Label><Input id="csv-archivo" type="file" accept=".csv,text/csv" onChange={async (e) => { const a = e.target.files?.[0]; if (a) setTexto(await a.text()); }} /></div>
          <div className="grid gap-1.5"><Label htmlFor="csv-texto">O pega el contenido</Label><textarea id="csv-texto" className="min-h-28 w-full rounded-lg border border-input bg-transparent p-2 font-mono text-xs" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={"nombre,telefono,correo,origen\nAna Pérez,3001234567,ana@correo.co,WEB"} /></div>
          {errores.length > 0 && (
            <ul role="alert" className="max-h-32 space-y-1 overflow-auto rounded-md bg-danger-soft p-2 text-xs text-danger-ink">
              {errores.slice(0, 20).map((e) => <li key={e.fila}>{e.fila ? `Fila ${e.fila}: ` : ""}{e.motivo}</li>)}
              {errores.length > 20 && <li>…y {errores.length - 20} más</li>}
            </ul>
          )}
          <Button onClick={importar} disabled={pendiente || !texto.trim()}>{pendiente ? "Importando…" : "Importar"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
