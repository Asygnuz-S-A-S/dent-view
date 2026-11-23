"use client";

import { ArrowDown, ArrowUp, Eye, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { guardarSecuencia, previsualizar, type EntradaSecuencia } from "@/app/(app)/crm/secuencias/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ACCIONES, DISPARADORES, ETAPAS, ETIQUETA_ACCION, ETIQUETA_ETAPA, ETIQUETA_ORIGEN, INFO_DISPARADOR, ORIGENES, type Accion, type Disparador, type Etapa } from "@/lib/crm";
import { SelectNativo } from "./comun";

export type PasoEditor = { esperaDias: number; esperaHoras: number; accion: Accion; asunto: string; cuerpo: string; etapaDestino: Etapa; tareaTitulo: string };
export type EstadoEditor = {
  nombre: string; descripcion: string; disparador: Disparador; diasInactividad: string;
  filtro: { origen: string; interes: string; enlace: string; transaccional: boolean }; pasos: PasoEditor[];
};
const PASO_NUEVO: PasoEditor = { esperaDias: 1, esperaHoras: 0, accion: "CORREO", asunto: "", cuerpo: "", etapaDestino: "CONTACTADO", tareaTitulo: "" };
export const EDITOR_VACIO: EstadoEditor = { nombre: "", descripcion: "", disparador: "LEAD_NUEVO", diasInactividad: "", filtro: { origen: "", interes: "", enlace: "", transaccional: false }, pasos: [{ ...PASO_NUEVO }] };

const Campo = ({ id, etiqueta, children, ayuda }: { id: string; etiqueta: string; children: React.ReactNode; ayuda?: string }) => (
  <div className="grid gap-1.5"><Label htmlFor={id}>{etiqueta}</Label>{children}{ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}</div>
);

export function EditorSecuencia({ id, inicial }: { id: string | null; inicial: EstadoEditor }) {
  const router = useRouter();
  const [s, setS] = useState(inicial);
  const [pendiente, iniciar] = useTransition();
  const [vista, setVista] = useState<string | null>(null);
  const info = INFO_DISPARADOR[s.disparador];
  const esLead = s.disparador.startsWith("LEAD_");
  const setPaso = (i: number, p: Partial<PasoEditor>) => setS({ ...s, pasos: s.pasos.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const mover = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= s.pasos.length) return; const p = [...s.pasos]; [p[i], p[j]] = [p[j]!, p[i]!]; setS({ ...s, pasos: p }); };

  const guardar = () => iniciar(async () => {
    const entrada: EntradaSecuencia = {
      nombre: s.nombre, descripcion: s.descripcion, disparador: s.disparador, diasInactividad: info.umbral ? Number(s.diasInactividad) || null : null,
      filtro: { origen: (s.filtro.origen || null) as (typeof ORIGENES)[number] | null, interes: s.filtro.interes, enlace: s.filtro.enlace, transaccional: s.filtro.transaccional },
      pasos: s.pasos.map((p) => ({ esperaDias: p.esperaDias, esperaHoras: p.esperaHoras, accion: p.accion, asunto: p.asunto, cuerpo: p.cuerpo, etapaDestino: p.accion === "CAMBIAR_ETAPA" ? p.etapaDestino : null, tareaTitulo: p.tareaTitulo })),
    };
    const r = await guardarSecuencia(id, entrada);
    if (r.error) return void toast.error(r.error);
    toast.success("Secuencia guardada");
    if (!id) router.replace(`/crm/secuencias/${r.id}`); else router.refresh();
  });
  const previa = (i: number) => iniciar(async () => setVista((await previsualizar(s.pasos[i]!.asunto, s.pasos[i]!.cuerpo, s.filtro.enlace)).html));

  return (
    <div className="space-y-6">
      <section className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2" aria-label="Datos de la secuencia">
        <Campo id="sec-nombre" etiqueta="Nombre"><Input id="sec-nombre" value={s.nombre} onChange={(e) => setS({ ...s, nombre: e.target.value })} maxLength={80} /></Campo>
        <Campo id="sec-disparador" etiqueta="¿Cuándo se inscribe a alguien?" ayuda={info.ayuda}>
          <SelectNativo id="sec-disparador" value={s.disparador} onChange={(e) => setS({ ...s, disparador: e.target.value as Disparador })}>{DISPARADORES.map((d) => <option key={d} value={d}>{INFO_DISPARADOR[d].texto}</option>)}</SelectNativo>
        </Campo>
        {info.umbral && <Campo id="sec-dias" etiqueta={info.umbral}><Input id="sec-dias" inputMode="numeric" value={s.diasInactividad} onChange={(e) => setS({ ...s, diasInactividad: e.target.value.replace(/\D/g, "") })} /></Campo>}
        <div className="sm:col-span-2"><Campo id="sec-desc" etiqueta="Descripción (opcional)"><Input id="sec-desc" value={s.descripcion} onChange={(e) => setS({ ...s, descripcion: e.target.value })} maxLength={300} /></Campo></div>
        {esLead && (
          <>
            <Campo id="sec-origen" etiqueta="Solo leads de origen (opcional)"><SelectNativo id="sec-origen" value={s.filtro.origen} onChange={(e) => setS({ ...s, filtro: { ...s.filtro, origen: e.target.value } })}><option value="">Cualquier origen</option>{ORIGENES.map((o) => <option key={o} value={o}>{ETIQUETA_ORIGEN[o]}</option>)}</SelectNativo></Campo>
            <Campo id="sec-interes" etiqueta="Interés contiene (opcional)"><Input id="sec-interes" value={s.filtro.interes} onChange={(e) => setS({ ...s, filtro: { ...s.filtro, interes: e.target.value } })} maxLength={80} /></Campo>
          </>
        )}
        <div className="sm:col-span-2"><Campo id="sec-enlace" etiqueta="Enlace para {{enlace}} y el botón del correo (opcional)" ayuda="Por ejemplo, tu enlace de reseñas o de agenda. Debe empezar por https://."><Input id="sec-enlace" type="url" value={s.filtro.enlace} onChange={(e) => setS({ ...s, filtro: { ...s.filtro, enlace: e.target.value } })} maxLength={500} placeholder="https://…" /></Campo></div>
        {s.disparador === "VALORACION_COMPLETADA" && (
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="mt-1 size-4" checked={s.filtro.transaccional} onChange={(e) => setS({ ...s, filtro: { ...s.filtro, transaccional: e.target.checked } })} />
            <span>Mensaje de servicio (transaccional) <span className="text-muted-foreground">: seguimiento de una valoración que la propia persona pidió; se envía sin consentimiento de mercadeo. Úsalo solo si el correo habla de esa valoración y no ofrece promociones. Siempre respeta «no contactar» y lleva enlace de baja.</span></span>
          </label>
        )}
      </section>

      <section className="space-y-3" aria-label="Pasos">
        <h2 className="text-lg font-semibold">Pasos</h2>
        <ol className="space-y-3">
          {s.pasos.map((p, i) => (
            <li key={i} className="space-y-3 rounded-lg border bg-card p-4" data-testid="paso">
              <div className="flex flex-wrap items-end gap-3">
                <span className="mb-2 text-sm font-semibold">Paso {i + 1}</span>
                <Campo id={`p${i}-dias`} etiqueta="Esperar (días)"><Input id={`p${i}-dias`} className="w-24" inputMode="numeric" value={p.esperaDias} onChange={(e) => setPaso(i, { esperaDias: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></Campo>
                <Campo id={`p${i}-horas`} etiqueta="y horas"><Input id={`p${i}-horas`} className="w-24" inputMode="numeric" value={p.esperaHoras} onChange={(e) => setPaso(i, { esperaHoras: Math.min(23, Number(e.target.value.replace(/\D/g, "")) || 0) })} /></Campo>
                <Campo id={`p${i}-accion`} etiqueta="Luego"><SelectNativo id={`p${i}-accion`} value={p.accion} onChange={(e) => setPaso(i, { accion: e.target.value as Accion })}>{ACCIONES.map((a) => <option key={a} value={a}>{ETIQUETA_ACCION[a]}</option>)}</SelectNativo></Campo>
                <div className="ml-auto flex gap-1">
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={`Subir el paso ${i + 1}`} disabled={i === 0} onClick={() => mover(i, -1)}><ArrowUp /></Button>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={`Bajar el paso ${i + 1}`} disabled={i === s.pasos.length - 1} onClick={() => mover(i, 1)}><ArrowDown /></Button>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={`Quitar el paso ${i + 1}`} disabled={s.pasos.length === 1} onClick={() => setS({ ...s, pasos: s.pasos.filter((_, j) => j !== i) })}><Trash2 /></Button>
                </div>
              </div>
              {p.accion === "CORREO" && (
                <div className="grid gap-3">
                  <Campo id={`p${i}-asunto`} etiqueta="Asunto"><Input id={`p${i}-asunto`} value={p.asunto} onChange={(e) => setPaso(i, { asunto: e.target.value })} maxLength={150} /></Campo>
                  <Campo id={`p${i}-cuerpo`} etiqueta="Mensaje" ayuda="Variables: {{nombre}}, {{centro}}, {{enlace}}. No incluyas diagnósticos ni nombres de tratamientos: los correos no deben llevar datos de salud.">
                    <textarea id={`p${i}-cuerpo`} className="min-h-28 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" value={p.cuerpo} onChange={(e) => setPaso(i, { cuerpo: e.target.value })} maxLength={3000} />
                  </Campo>
                  <div><Button type="button" size="sm" variant="outline" disabled={pendiente || !p.asunto || !p.cuerpo} onClick={() => previa(i)}><Eye /> Vista previa</Button></div>
                </div>
              )}
              {p.accion === "TAREA" && <Campo id={`p${i}-tarea`} etiqueta="Título de la tarea"><Input id={`p${i}-tarea`} value={p.tareaTitulo} onChange={(e) => setPaso(i, { tareaTitulo: e.target.value })} maxLength={150} /></Campo>}
              {p.accion === "CAMBIAR_ETAPA" && <Campo id={`p${i}-etapa`} etiqueta="Mover el lead a" ayuda="Solo aplica a leads."><SelectNativo id={`p${i}-etapa`} value={p.etapaDestino} onChange={(e) => setPaso(i, { etapaDestino: e.target.value as Etapa })}>{ETAPAS.map((e) => <option key={e} value={e}>{ETIQUETA_ETAPA[e]}</option>)}</SelectNativo></Campo>}
              {p.accion === "FINALIZAR" && <p className="text-sm text-muted-foreground">Termina la secuencia para esta persona.</p>}
            </li>
          ))}
        </ol>
        <Button type="button" variant="outline" disabled={s.pasos.length >= 12} onClick={() => setS({ ...s, pasos: [...s.pasos, { ...PASO_NUEVO }] })}><Plus /> Agregar paso</Button>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={guardar} disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar secuencia"}</Button>
        {!id && <p className="text-sm text-muted-foreground">Las secuencias nuevas nacen inactivas.</p>}
      </div>

      <Dialog open={vista !== null} onOpenChange={(a) => !a && setVista(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Vista previa</DialogTitle><DialogDescription>Así se ve el correo con la marca de tu centro (con el nombre «Ana» como ejemplo).</DialogDescription></DialogHeader>
          {/* sandbox sin permisos: el HTML se muestra aislado aunque contenga algo inesperado */}
          {vista && <iframe title="Vista previa del correo" sandbox="" srcDoc={vista} className="h-[60vh] w-full rounded-md border bg-white" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
