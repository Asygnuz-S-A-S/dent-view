"use client";

import { Pencil, Plus } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { cambiarSalaActiva, guardarSala } from "@/app/(app)/ajustes/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { COLORES_SALA } from "@/lib/agenda";
import { EstadoVacio } from "@/components/comunes/estado-vacio";

type Sala = { id: string; nombre: string; color: string; activa: boolean };

const Punto = ({ color }: { color: string }) => (
  <span className={`inline-block size-3 rounded-full ${COLORES_SALA[color] ?? "bg-zinc-400"}`} aria-hidden />
);

export function SalasAdmin({ salas }: { salas: Sala[] }) {
  const [edicion, setEdicion] = useState<Sala | "nueva" | null>(null);
  const [, iniciar] = useTransition();
  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setEdicion("nueva")}><Plus /> Nueva sala</Button>
      </div>
      <Card className="py-0">
        <CardContent className="px-0">
          {salas.length === 0 ? (
            <EstadoVacio titulo="Aún no hay salas" descripcion="Crea la primera para usar la agenda." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Sala</TableHead>
                  <TableHead>Activa</TableHead>
                  <TableHead className="pr-6"><span className="sr-only">Editar</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salas.map((s) => (
                  <TableRow key={s.id} className={s.activa ? undefined : "opacity-60"}>
                    <TableCell className="pl-6"><span className="flex items-center gap-2 font-medium"><Punto color={s.color} />{s.nombre}</span></TableCell>
                    <TableCell>
                      <Switch
                        checked={s.activa}
                        aria-label={`${s.activa ? "Desactivar" : "Activar"} ${s.nombre}`}
                        onCheckedChange={(v) => iniciar(async () => { await cambiarSalaActiva(s.id, v); })}
                      />
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <Button size="icon" variant="ghost" aria-label={`Editar ${s.nombre}`} onClick={() => setEdicion(s)}><Pencil /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {edicion && (
        <FormSala key={edicion === "nueva" ? "nueva" : edicion.id} sala={edicion === "nueva" ? null : edicion} cerrar={() => setEdicion(null)} />
      )}
    </>
  );
}

function FormSala({ sala, cerrar }: { sala: Sala | null; cerrar: () => void }) {
  const [estado, accion, pendiente] = useActionState(guardarSala, undefined);
  useEffect(() => {
    if (estado?.ok) {
      toast.success("Sala guardada");
      cerrar();
    }
  }, [estado, cerrar]);
  return (
    <Dialog open onOpenChange={(o) => !o && cerrar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{sala ? "Editar sala" : "Nueva sala"}</DialogTitle></DialogHeader>
        <form action={accion} className="space-y-4">
          {sala && <input type="hidden" name="id" value={sala.id} />}
          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre</Label>
            <Input id="nombre" name="nombre" required defaultValue={sala?.nombre} />
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <Select name="color" defaultValue={sala?.color ?? "teal"}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.keys(COLORES_SALA).map((c) => (
                  <SelectItem key={c} value={c}><Punto color={c} /> <span className="capitalize">{c}</span></SelectItem>
                ))}
              </SelectContent>
            </Select>
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
