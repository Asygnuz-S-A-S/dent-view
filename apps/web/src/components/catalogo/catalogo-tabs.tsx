"use client";

import { Pencil, Plus } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { cambiarActivo, guardarServicio } from "@/app/(app)/catalogo/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SelectorCodigo } from "@/components/ordenes/selector-codigo";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TIPOS_RIPS } from "@/lib/catalogos/referencias-rips";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORIAS, cop, precioFinal } from "@/lib/precios";
import { EstadoVacio } from "@/components/comunes/estado-vacio";

type Servicio = {
  id: string;
  categoria: string;
  nombre: string;
  descripcion: string | null;
  precioImpreso: number | null;
  precioDigital: number | null;
  descuento: number;
  activo: boolean;
  codigoCups: string | null;
  tipoRips: string;
  codServicioReps: number | null;
};

const dinero = (n: number | null) => (n === null ? "—" : cop(n));

export function CatalogoTabs({ servicios }: { servicios: Servicio[] }) {
  const [categoria, setCategoria] = useState<string>(CATEGORIAS[0].valor);
  const [edicion, setEdicion] = useState<Servicio | "nuevo" | null>(null);
  const [, iniciar] = useTransition();
  const visibles = servicios.filter((s) => s.categoria === categoria);

  return (
    <>
      <Tabs value={categoria} onValueChange={setCategoria}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            {CATEGORIAS.map((c) => (
              <TabsTrigger key={c.valor} value={c.valor}>{c.etiqueta}</TabsTrigger>
            ))}
          </TabsList>
          <Button onClick={() => setEdicion("nuevo")}><Plus /> Nuevo servicio</Button>
        </div>
      </Tabs>

      <Card className="py-0">
        <CardContent className="px-0">
          {visibles.length === 0 ? (
            <EstadoVacio titulo="No hay servicios en esta categoría" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Servicio</TableHead>
                  <TableHead className="text-right">Impreso</TableHead>
                  <TableHead className="text-right">Digital</TableHead>
                  <TableHead className="text-right">Descuento</TableHead>
                  <TableHead className="text-right">Final impreso</TableHead>
                  <TableHead className="text-right">Final digital</TableHead>
                  <TableHead>Activo</TableHead>
                  <TableHead className="pr-6"><span className="sr-only">Editar</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((s) => (
                  <TableRow key={s.id} className={s.activo ? undefined : "opacity-60"}>
                    <TableCell className="max-w-[22rem] pl-6">
                      <div className="font-medium">{s.nombre}</div>
                      {s.descripcion && <div className="text-xs text-muted-foreground">{s.descripcion}</div>}
                    </TableCell>
                    <TableCell className="text-right">{dinero(s.precioImpreso)}</TableCell>
                    <TableCell className="text-right">{dinero(s.precioDigital)}</TableCell>
                    <TableCell className="text-right">{s.descuento ? dinero(s.descuento) : "—"}</TableCell>
                    <TableCell className="text-right font-medium">{dinero(precioFinal(s, "IMPRESA"))}</TableCell>
                    <TableCell className="text-right font-medium">{dinero(precioFinal(s, "DIGITAL"))}</TableCell>
                    <TableCell>
                      <Switch
                        checked={s.activo}
                        aria-label={`${s.activo ? "Desactivar" : "Activar"} ${s.nombre}`}
                        onCheckedChange={(v) => iniciar(async () => { await cambiarActivo(s.id, v); })}
                      />
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <Button size="icon" variant="ghost" aria-label={`Editar ${s.nombre}`} onClick={() => setEdicion(s)}>
                        <Pencil />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {edicion && (
        <FormServicio
          // key: reinicia el estado del formulario al cambiar de servicio
          key={edicion === "nuevo" ? "nuevo" : edicion.id}
          servicio={edicion === "nuevo" ? null : edicion}
          categoria={categoria}
          cerrar={() => setEdicion(null)}
        />
      )}
    </>
  );
}

function FormServicio({ servicio, categoria, cerrar }: { servicio: Servicio | null; categoria: string; cerrar: () => void }) {
  const [estado, accion, pendiente] = useActionState(guardarServicio, undefined);
  const [cups, setCups] = useState<string | null>(servicio?.codigoCups ?? null);
  useEffect(() => {
    if (estado?.ok) {
      toast.success("Servicio guardado");
      cerrar();
    }
  }, [estado, cerrar]);

  return (
    <Dialog open onOpenChange={(o) => !o && cerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{servicio ? "Editar servicio" : "Nuevo servicio"}</DialogTitle>
          <DialogDescription>Deja un precio vacío si el servicio no se ofrece en esa entrega.</DialogDescription>
        </DialogHeader>
        <form action={accion} className="space-y-4">
          {servicio && <input type="hidden" name="id" value={servicio.id} />}
          <div className="space-y-2">
            <Label>Categoría</Label>
            <Select name="categoria" defaultValue={servicio?.categoria ?? categoria}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map((c) => <SelectItem key={c.valor} value={c.valor}>{c.etiqueta}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre</Label>
            <Input id="nombre" name="nombre" required defaultValue={servicio?.nombre} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="descripcion">Descripción</Label>
            <Textarea id="descripcion" name="descripcion" defaultValue={servicio?.descripcion ?? ""} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="precioImpreso">Precio impreso</Label>
              <Input id="precioImpreso" name="precioImpreso" type="number" min={0} step={1000} defaultValue={servicio?.precioImpreso ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="precioDigital">Precio digital</Label>
              <Input id="precioDigital" name="precioDigital" type="number" min={0} step={1000} defaultValue={servicio?.precioDigital ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="descuento">Descuento</Label>
              <Input id="descuento" name="descuento" type="number" min={0} step={1000} defaultValue={servicio?.descuento ?? 0} />
            </div>
          </div>
          <fieldset className="space-y-3 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">RIPS (opcional)</legend>
            <div className="space-y-2">
              <Label htmlFor="codigoCups">Código CUPS</Label>
              <SelectorCodigo id="codigoCups" catalogo="cups" etiqueta="Código CUPS" value={cups} onChange={setCups} />
              <input type="hidden" name="codigoCups" value={cups ?? ""} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="tipoRips">Tipo RIPS</Label>
                <Select name="tipoRips" defaultValue={servicio?.tipoRips ?? "PROCEDIMIENTO"}>
                  <SelectTrigger id="tipoRips" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPOS_RIPS.map((t) => <SelectItem key={t.valor} value={t.valor}>{t.etiqueta}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="codServicioReps">Código de servicio REPS</Label>
                <Input id="codServicioReps" name="codServicioReps" type="number" min={1} max={99999} defaultValue={servicio?.codServicioReps ?? ""} />
              </div>
            </div>
          </fieldset>
          {estado?.error && <p role="alert" className="text-sm text-destructive">{estado.error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={cerrar}>Cancelar</Button>
            <Button type="submit" disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
