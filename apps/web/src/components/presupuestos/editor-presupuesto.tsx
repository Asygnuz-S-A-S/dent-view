"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { guardarPresupuesto } from "@/app/(app)/presupuestos/actions";
import { SelectNativo } from "@/components/crm/comun";
import { InputMoneda } from "@/components/comunes/input-moneda";
import { PacienteCombobox, type PacienteOpcion } from "@/components/ordenes/paciente-combobox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cop } from "@/lib/precios";
import { MAX_CANTIDAD, calcularTotales, precioSugerido } from "@/lib/presupuestos";

export type ServicioOpcion = { id: string; nombre: string; precio: number | null };
export type ItemForm = { servicioId: string; descripcion: string; cantidad: string; valor: string; descuento: string; fase: string; diente: string; costo: string };
export type InicialPresupuesto = {
  id: string | null; pacienteId: string; leadId: string; valoracionId: string;
  /** Nombre del paciente o lead de origen (solo se muestra). */
  origen: string | null; pedirDocumento: boolean;
  titulo: string; notas: string; validoHasta: string; convenioId: string; items: ItemForm[];
};

const vacio = (): ItemForm => ({ servicioId: "", descripcion: "", cantidad: "1", valor: "", descuento: "", fase: "1", diente: "", costo: "" });
const num = (s: string) => Number(s.replace(/\D/g, "")) || 0;

/** Editor de un borrador. El total que se ve es una vista previa: el servidor recalcula precios del catálogo y totales al guardar. */
export function EditorPresupuesto({ inicial, servicios, convenios, pacientes, esAdmin, margenDefault, minFecha, maxFecha }: {
  inicial: InicialPresupuesto; servicios: ServicioOpcion[]; convenios: { id: string; nombre: string }[]; pacientes: PacienteOpcion[];
  esAdmin: boolean; margenDefault: number; minFecha: string; maxFecha: string;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [f, setF] = useState({ pacienteId: inicial.pacienteId, titulo: inicial.titulo, notas: inicial.notas, validoHasta: inicial.validoHasta, convenioId: inicial.convenioId, tipoDocumento: "CC", numeroDocumento: "" });
  const [items, setItems] = useState<ItemForm[]>(inicial.items.length ? inicial.items : [vacio()]);
  const [global, setGlobal] = useState({ tipo: "PORCENTAJE" as "PORCENTAJE" | "VALOR", valor: "" });
  const porId = new Map(servicios.map((s) => [s.id, s]));
  const poner = (i: number, parche: Partial<ItemForm>) => setItems((l) => l.map((x, j) => (j === i ? { ...x, ...parche } : x)));

  const lineas = items.map((i) => ({
    cantidad: Math.min(MAX_CANTIDAD, Math.max(1, num(i.cantidad))), valorUnitario: i.servicioId ? (porId.get(i.servicioId)?.precio ?? 0) : num(i.valor),
    descuento: num(i.descuento), costoUnitario: num(i.costo),
  }));
  const t = calcularTotales(lineas, global.valor ? { tipo: global.tipo, valor: num(global.valor) } : null);
  const pideOrigen = !inicial.id && !inicial.pacienteId && !inicial.leadId && !inicial.valoracionId;

  function guardar() {
    iniciar(async () => {
      const r = await guardarPresupuesto(inicial.id, {
        pacienteId: inicial.id ? undefined : f.pacienteId || inicial.pacienteId || undefined, leadId: inicial.leadId || undefined, valoracionId: inicial.valoracionId || undefined,
        ...(inicial.pedirDocumento ? { tipoDocumento: f.tipoDocumento as "CC", numeroDocumento: f.numeroDocumento } : {}),
        titulo: f.titulo, notas: f.notas, validoHasta: f.validoHasta, convenioId: f.convenioId || undefined,
        descuentoGlobal: global.valor ? { tipo: global.tipo, valor: num(global.valor) } : undefined,
        items: items.map((i, k) => ({
          servicioId: i.servicioId || undefined, descripcion: i.descripcion, cantidad: lineas[k]!.cantidad, valorUnitario: i.servicioId ? 0 : num(i.valor),
          descuento: num(i.descuento), fase: Math.min(12, Math.max(1, num(i.fase))), diente: i.diente ? num(i.diente) : undefined, costoUnitario: esAdmin ? num(i.costo) : 0,
        })),
      });
      if ("error" in r) return void toast.error(r.error);
      toast.success("Cotización guardada");
      router.push(`/presupuestos/${r.id}`);
      router.refresh();
    });
  }

  return (
    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); guardar(); }}>
      <Card>
        <CardHeader><CardTitle>Paciente y vigencia</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {pideOrigen ? (
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="pres-paciente">Paciente</Label>
              <PacienteCombobox id="pres-paciente" pacientes={pacientes} value={f.pacienteId} onChange={(id) => setF({ ...f, pacienteId: id })} />
            </div>
          ) : (
            <p className="text-sm sm:col-span-2"><span className="text-muted-foreground">Para:</span> <span className="font-medium">{inicial.origen}</span></p>
          )}
          {inicial.pedirDocumento && (
            <div className="grid gap-2 sm:col-span-2">
              <p className="text-sm text-muted-foreground">Este contacto aún no es paciente. Su documento permite registrarlo para poder cotizarle (no cambia su etapa en el CRM).</p>
              <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
                <div className="grid gap-2"><Label htmlFor="pres-tipo-doc">Tipo de documento</Label>
                  <SelectNativo id="pres-tipo-doc" value={f.tipoDocumento} onChange={(e) => setF({ ...f, tipoDocumento: e.target.value })}>{["CC", "TI", "CE", "PA", "RC"].map((t) => <option key={t}>{t}</option>)}</SelectNativo></div>
                <div className="grid gap-2"><Label htmlFor="pres-num-doc">Número de documento</Label><Input id="pres-num-doc" value={f.numeroDocumento} onChange={(e) => setF({ ...f, numeroDocumento: e.target.value })} maxLength={20} autoComplete="off" /></div>
              </div>
            </div>
          )}
          <div className="grid gap-2"><Label htmlFor="pres-titulo">Título (opcional)</Label><Input id="pres-titulo" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} maxLength={120} /></div>
          <div className="grid gap-2"><Label htmlFor="pres-vigencia">Vigente hasta</Label><Input id="pres-vigencia" type="date" value={f.validoHasta} min={minFecha} max={maxFecha} onChange={(e) => setF({ ...f, validoHasta: e.target.value })} required /></div>
          {convenios.length > 0 && (
            <div className="grid gap-2 sm:col-span-2"><Label htmlFor="pres-convenio">Convenio (opcional)</Label>
              <SelectNativo id="pres-convenio" value={f.convenioId} onChange={(e) => setF({ ...f, convenioId: e.target.value })}><option value="">Sin convenio</option>{convenios.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</SelectNativo>
              <p className="text-xs text-muted-foreground">Con convenio, el servidor resuelve el precio de cada servicio del catálogo con su tarifa.</p></div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Ítems</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {items.map((i, k) => {
            const s = i.servicioId ? porId.get(i.servicioId) : null;
            return (
              <fieldset key={k} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-6" data-testid="item-presupuesto">
                <legend className="px-1 text-xs text-muted-foreground">Ítem {k + 1}</legend>
                <div className="grid gap-2 sm:col-span-3">
                  <Label htmlFor={`it-serv-${k}`}>Servicio del catálogo</Label>
                  <SelectNativo id={`it-serv-${k}`} value={i.servicioId} onChange={(e) => poner(k, { servicioId: e.target.value })}>
                    <option value="">Ítem libre (escribir descripción)</option>
                    {servicios.map((x) => <option key={x.id} value={x.id}>{x.nombre}{x.precio !== null ? ` · ${cop(x.precio)}` : " · sin precio"}</option>)}
                  </SelectNativo>
                </div>
                {s ? (
                  <p className="self-end text-sm text-muted-foreground sm:col-span-3">Precio de catálogo: {s.precio !== null ? cop(s.precio) : "sin precio"}. Se recalcula al guardar.</p>
                ) : (
                  <>
                    <div className="grid gap-2 sm:col-span-2"><Label htmlFor={`it-desc-${k}`}>Descripción</Label><Input id={`it-desc-${k}`} value={i.descripcion} onChange={(e) => poner(k, { descripcion: e.target.value })} maxLength={200} /></div>
                    <div className="grid gap-2"><Label htmlFor={`it-valor-${k}`}>Valor unitario</Label><InputMoneda id={`it-valor-${k}`} value={i.valor} onValueChange={(v) => poner(k, { valor: v })} /></div>
                  </>
                )}
                <div className="grid gap-2"><Label htmlFor={`it-cant-${k}`}>Cantidad</Label><Input id={`it-cant-${k}`} inputMode="numeric" value={i.cantidad} onChange={(e) => poner(k, { cantidad: e.target.value.replace(/\D/g, "").slice(0, 2) })} /></div>
                <div className="grid gap-2"><Label htmlFor={`it-desct-${k}`}>Descuento</Label><InputMoneda id={`it-desct-${k}`} value={i.descuento} onValueChange={(v) => poner(k, { descuento: v })} /></div>
                <div className="grid gap-2"><Label htmlFor={`it-fase-${k}`}>Fase</Label><Input id={`it-fase-${k}`} inputMode="numeric" value={i.fase} onChange={(e) => poner(k, { fase: e.target.value.replace(/\D/g, "").slice(0, 2) })} /></div>
                <div className="grid gap-2"><Label htmlFor={`it-diente-${k}`}>Diente (FDI)</Label><Input id={`it-diente-${k}`} inputMode="numeric" value={i.diente} onChange={(e) => poner(k, { diente: e.target.value.replace(/\D/g, "").slice(0, 2) })} placeholder="Opcional" /></div>
                {esAdmin && (
                  <div className="grid gap-2 sm:col-span-2"><Label htmlFor={`it-costo-${k}`}>Costo unitario</Label><InputMoneda id={`it-costo-${k}`} value={i.costo} onValueChange={(v) => poner(k, { costo: v })} />
                    {num(i.costo) > 0 && <p className="text-xs text-muted-foreground">Con margen de {margenDefault} %: {cop(precioSugerido(num(i.costo), margenDefault))}</p>}</div>
                )}
                <div className="flex items-end justify-between gap-2 sm:col-span-6">
                  <p className="text-sm tabular-nums">Subtotal del ítem: <span className="font-medium">{cop(Math.max(0, lineas[k]!.cantidad * lineas[k]!.valorUnitario - lineas[k]!.descuento))}</span></p>
                  {items.length > 1 && <Button type="button" variant="ghost" size="sm" onClick={() => setItems((l) => l.filter((_, j) => j !== k))}><Trash2 /> Quitar</Button>}
                </div>
              </fieldset>
            );
          })}
          <Button type="button" variant="outline" onClick={() => setItems((l) => [...l, vacio()])}><Plus /> Agregar ítem</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Descuento global, notas y total</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="pres-global-valor">Descuento global (opcional)</Label>
            <div className="grid grid-cols-[8rem_1fr] gap-2">
              <SelectNativo aria-label="Tipo de descuento global" value={global.tipo} onChange={(e) => setGlobal({ tipo: e.target.value as "PORCENTAJE" | "VALOR", valor: "" })}><option value="PORCENTAJE">Porcentaje</option><option value="VALOR">Valor</option></SelectNativo>
              {global.tipo === "VALOR" ? <InputMoneda id="pres-global-valor" value={global.valor} onValueChange={(v) => setGlobal({ ...global, valor: v })} /> : <Input id="pres-global-valor" inputMode="numeric" placeholder="0 – 100" value={global.valor} onChange={(e) => setGlobal({ ...global, valor: String(Math.min(100, num(e.target.value)) || "") })} />}
            </div>
            <p className="text-xs text-muted-foreground">Se reparte entre los ítems y queda guardado como descuento de cada uno.</p>
          </div>
          <div className="grid gap-2 sm:row-span-2">
            <Label htmlFor="pres-notas">Notas para el paciente (opcional)</Label>
            <Textarea id="pres-notas" value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} maxLength={2000} rows={6} />
            <p className="text-xs text-muted-foreground">El paciente ve estas notas en la cotización.</p>
          </div>
          <dl className="space-y-1 rounded-lg border p-3 text-sm tabular-nums">
            <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd>{cop(t.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Descuentos</dt><dd>− {cop(t.descuento)}</dd></div>
            <div className="flex justify-between text-base font-semibold" data-testid="total-editor"><dt>Total</dt><dd>{cop(t.total)}</dd></div>
            {esAdmin && t.costo > 0 && (
              <div className="mt-2 border-t pt-2 text-xs text-muted-foreground">
                <p className="flex justify-between"><span>Costo</span><span>{cop(t.costo)}</span></p>
                <p className="flex justify-between"><span>Utilidad</span><span>{cop(t.utilidad)}</span></p>
                <p className="flex justify-between"><span>Margen sobre costo</span><span>{t.margenPct} %</span></p>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pendiente}>Guardar borrador</Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>Cancelar</Button>
      </div>
    </form>
  );
}
