"use client";

import { Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { cambiarActivoConvenio, guardarConvenio } from "@/app/(app)/convenios/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TIPOS_PAGADOR } from "@/lib/catalogos/referencias-rips";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EstadoVacio } from "@/components/comunes/estado-vacio";

export type ConvenioFila = {
  id: string; nombre: string; nit: string | null; contacto: string | null; tipoPagador: string | null; nitPagador: string | null; cucon: string | null; coberturaPlan: string | null; descuentoGeneral: number | null;
  activo: boolean; vigenteDesde: string | null; vigenteHasta: string | null; tarifas: number;
};

const fmt = (d: string | null) => (d ? d.split("-").reverse().join("/") : null);
const vigencia = (c: ConvenioFila) =>
  !c.vigenteDesde && !c.vigenteHasta ? "Sin límite" : `${fmt(c.vigenteDesde) ?? "…"} – ${fmt(c.vigenteHasta) ?? "…"}`;

export function ConveniosLista({ convenios }: { convenios: ConvenioFila[] }) {
  const [edicion, setEdicion] = useState<ConvenioFila | "nuevo" | null>(null);
  const [, iniciar] = useTransition();
  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setEdicion("nuevo")}><Plus /> Nuevo convenio</Button>
      </div>
      <Card className="py-0">
        <CardContent className="px-0">
          {convenios.length === 0 ? (
            <EstadoVacio titulo="Aún no hay convenios" descripcion="Crea el primero." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Convenio</TableHead>
                  <TableHead>NIT</TableHead>
                  <TableHead className="text-right">Descuento general</TableHead>
                  <TableHead>Vigencia</TableHead>
                  <TableHead className="text-right">Tarifas</TableHead>
                  <TableHead>Activo</TableHead>
                  <TableHead className="pr-6"><span className="sr-only">Acciones</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {convenios.map((c) => (
                  <TableRow key={c.id} className={c.activo ? undefined : "opacity-60"}>
                    <TableCell className="pl-6">
                      <Link href={`/convenios/${c.id}`} className="font-medium hover:underline">{c.nombre}</Link>
                      {c.contacto && <div className="text-xs text-muted-foreground">{c.contacto}</div>}
                    </TableCell>
                    <TableCell>{c.nit ?? "—"}</TableCell>
                    <TableCell className="text-right">{c.descuentoGeneral ? `${c.descuentoGeneral} %` : "—"}</TableCell>
                    <TableCell>{vigencia(c)}</TableCell>
                    <TableCell className="text-right">{c.tarifas}</TableCell>
                    <TableCell>
                      <Switch
                        checked={c.activo}
                        aria-label={`${c.activo ? "Desactivar" : "Activar"} ${c.nombre}`}
                        onCheckedChange={(v) => iniciar(async () => { await cambiarActivoConvenio(c.id, v); })}
                      />
                    </TableCell>
                    <TableCell className="space-x-1 pr-6 text-right">
                      <Button size="sm" variant="outline" asChild><Link href={`/convenios/${c.id}`}>Tarifas</Link></Button>
                      <Button size="icon" variant="ghost" aria-label={`Editar ${c.nombre}`} onClick={() => setEdicion(c)}><Pencil /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {edicion && <FormConvenio key={edicion === "nuevo" ? "nuevo" : edicion.id} convenio={edicion === "nuevo" ? null : edicion} cerrar={() => setEdicion(null)} />}
    </>
  );
}

function FormConvenio({ convenio, cerrar }: { convenio: ConvenioFila | null; cerrar: () => void }) {
  const [estado, accion, pendiente] = useActionState(guardarConvenio, undefined);
  useEffect(() => {
    if (estado?.ok) {
      toast.success("Convenio guardado");
      cerrar();
    }
  }, [estado, cerrar]);
  return (
    <Dialog open onOpenChange={(o) => !o && cerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{convenio ? "Editar convenio" : "Nuevo convenio"}</DialogTitle>
          <DialogDescription>El descuento general aplica al precio final del catálogo en los servicios sin tarifa propia.</DialogDescription>
        </DialogHeader>
        <form action={accion} className="space-y-4">
          {convenio && <input type="hidden" name="id" value={convenio.id} />}
          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre</Label>
            <Input id="nombre" name="nombre" required defaultValue={convenio?.nombre} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="nit">NIT / identificación</Label>
              <Input id="nit" name="nit" defaultValue={convenio?.nit ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="descuentoGeneral">Descuento general (%)</Label>
              <Input id="descuentoGeneral" name="descuentoGeneral" type="number" min={0} max={100} defaultValue={convenio?.descuentoGeneral ?? ""} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="contacto">Contacto</Label>
            <Input id="contacto" name="contacto" placeholder="Nombre, teléfono o correo" defaultValue={convenio?.contacto ?? ""} />
          </div>
          <fieldset className="space-y-3 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">Pagador y RIPS (opcional)</legend>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="tipoPagador">Tipo de pagador</Label>
                <Select name="tipoPagador" defaultValue={convenio?.tipoPagador ?? ""}>
                  <SelectTrigger id="tipoPagador" className="w-full"><SelectValue placeholder="Sin definir" /></SelectTrigger>
                  <SelectContent>{TIPOS_PAGADOR.map((t) => <SelectItem key={t.valor} value={t.valor}>{t.etiqueta}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="nitPagador">NIT del pagador</Label>
                <Input id="nitPagador" name="nitPagador" defaultValue={convenio?.nitPagador ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cucon">CUCON (contrato)</Label>
                <Input id="cucon" name="cucon" defaultValue={convenio?.cucon ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coberturaPlan">Cobertura o plan</Label>
                <Input id="coberturaPlan" name="coberturaPlan" defaultValue={convenio?.coberturaPlan ?? ""} />
              </div>
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="vigenteDesde">Vigente desde</Label>
              <Input id="vigenteDesde" name="vigenteDesde" type="date" defaultValue={convenio?.vigenteDesde ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vigenteHasta">Vigente hasta</Label>
              <Input id="vigenteHasta" name="vigenteHasta" type="date" defaultValue={convenio?.vigenteHasta ?? ""} />
            </div>
          </div>
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
