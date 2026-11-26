"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { guardarPlantilla } from "@/app/(app)/evolucion/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DESTINOS, ETIQUETA_DESTINO, type CampoPlantilla, type Destino } from "@/lib/evolucion";

const sel = "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30";
const clave = (etiqueta: string, usadas: Set<string>) => {
  const base = etiqueta.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || "campo";
  let k = base, i = 2;
  while (usadas.has(k)) k = `${base}_${i++}`;
  return k;
};

function Plantilla({ nombre, version, inicial, nueva = false }: { nombre: string; version: number; inicial: CampoPlantilla[]; nueva?: boolean }) {
  const [titulo, setTitulo] = useState(nombre);
  const [campos, setCampos] = useState(inicial);
  const [pendiente, iniciar] = useTransition();
  const cambiar = (i: number, p: Partial<CampoPlantilla>) => setCampos((c) => c.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const guardar = () => iniciar(async () => {
    const usadas = new Set<string>();
    const finales = campos.map((c) => { const k = c.clave && !usadas.has(c.clave) ? c.clave : clave(c.etiqueta, usadas); usadas.add(k); return { ...c, clave: k, ayuda: c.ayuda || undefined }; });
    const r = await guardarPlantilla(titulo, { campos: finales });
    if (r.error) toast.error(r.error); else { toast.success("Plantilla guardada como versión nueva"); if (nueva) { setTitulo(""); setCampos([]); } }
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{nueva ? "Nueva plantilla" : `${nombre} · versión ${version}`}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {nueva && <div className="max-w-sm space-y-1"><Label htmlFor="pl-nombre-nueva">Nombre</Label><Input id="pl-nombre-nueva" value={titulo} maxLength={80} onChange={(e) => setTitulo(e.target.value)} /></div>}
        {campos.map((c, i) => (
          <div key={c.clave || i} className="grid gap-2 sm:grid-cols-[1fr_11rem_1fr_auto]">
            <Input aria-label={`Etiqueta del campo ${i + 1}`} value={c.etiqueta} maxLength={80} onChange={(e) => cambiar(i, { etiqueta: e.target.value })} />
            <select aria-label={`Se guarda en (campo ${i + 1})`} className={sel} value={c.destino} onChange={(e) => cambiar(i, { destino: e.target.value as Destino })}>{DESTINOS.map((d) => <option key={d} value={d}>{ETIQUETA_DESTINO[d]}</option>)}</select>
            <Input aria-label={`Ayuda del campo ${i + 1}`} placeholder="Ayuda (opcional)" value={c.ayuda ?? ""} maxLength={200} onChange={(e) => cambiar(i, { ayuda: e.target.value })} />
            <Button type="button" variant="ghost" size="icon" aria-label={`Quitar campo ${i + 1}`} onClick={() => setCampos((x) => x.filter((_, j) => j !== i))}><Trash2 /></Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setCampos((c) => [...c, { clave: "", etiqueta: "", destino: "hallazgos" }])}><Plus /> Agregar campo</Button>
          <Button type="button" size="sm" disabled={pendiente || !titulo.trim() || campos.length === 0 || campos.some((c) => !c.etiqueta.trim())} onClick={guardar}>Guardar como versión nueva</Button>
        </div>
        {!nueva && <p className="text-xs text-muted-foreground">Las evoluciones ya firmadas conservan la versión que usaron; los cambios aplican a las nuevas.</p>}
      </CardContent>
    </Card>
  );
}

export function EditorPlantillas({ plantillas }: { plantillas: { nombre: string; version: number; campos: CampoPlantilla[] }[] }) {
  return (
    <div className="space-y-4">
      {plantillas.map((p) => <Plantilla key={`${p.nombre}-${p.version}`} nombre={p.nombre} version={p.version} inicial={p.campos} />)}
      <Plantilla nombre="" version={1} inicial={[]} nueva />
    </div>
  );
}
