"use client";

import { Copy, Plus } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { cambiarEstacionActiva, crearEstacion } from "@/app/(app)/ingesta/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fechaHoraCompleta } from "@/lib/fechas";

type Estacion = {
  id: string; nombre: string; activa: boolean; ultimoContacto: Date | null; creadoEn: Date;
  estado: "EN_LINEA" | "SIN_CONTACTO" | "INACTIVA";
};

const ESTADO = {
  EN_LINEA: { texto: "En línea", variant: "default" },
  SIN_CONTACTO: { texto: "Sin contacto reciente", variant: "secondary" },
  INACTIVA: { texto: "Desactivada", variant: "outline" },
} as const;

export function EstacionesAdmin({ estaciones, servidor }: { estaciones: Estacion[]; servidor: string }) {
  const [creando, setCreando] = useState(false);
  const [, iniciar] = useTransition();
  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setCreando(true)}><Plus /> Nueva estación</Button>
      </div>
      <Card className="py-0">
        <CardContent className="px-0">
          {estaciones.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">Aún no hay estaciones. Crea una para el PC donde se exportan los estudios.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Estación</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Último contacto</TableHead>
                  <TableHead className="pr-6">Activa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {estaciones.map((e) => (
                  <TableRow key={e.id} className={e.activa ? undefined : "opacity-60"}>
                    <TableCell className="pl-6">
                      <div className="font-medium">{e.nombre}</div>
                      <div className="text-xs text-muted-foreground">Creada {fechaHoraCompleta(e.creadoEn)}</div>
                    </TableCell>
                    <TableCell><Badge variant={ESTADO[e.estado].variant}>{ESTADO[e.estado].texto}</Badge></TableCell>
                    <TableCell className="text-sm">{fechaHoraCompleta(e.ultimoContacto)}</TableCell>
                    <TableCell className="pr-6">
                      <Switch
                        checked={e.activa}
                        aria-label={`${e.activa ? "Desactivar" : "Activar"} ${e.nombre}`}
                        onCheckedChange={(v) => iniciar(async () => {
                          await cambiarEstacionActiva(e.id, v);
                          toast.success(v ? "Estación activada" : "Estación desactivada: su token deja de funcionar");
                        })}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {creando && <NuevaEstacion servidor={servidor} cerrar={() => setCreando(false)} />}
    </>
  );
}

function NuevaEstacion({ servidor, cerrar }: { servidor: string; cerrar: () => void }) {
  const [estado, accion, pendiente] = useActionState(crearEstacion, undefined);
  const copiar = (t: string) => navigator.clipboard.writeText(t).then(() => toast.success("Copiado"), () => toast.error("No se pudo copiar"));
  return (
    <Dialog open onOpenChange={(o) => !o && cerrar()}>
      <DialogContent>
        {estado?.token ? (
          <>
            <DialogHeader>
              <DialogTitle>Estación creada</DialogTitle>
              <DialogDescription>Copia el token ahora: no se vuelve a mostrar. Si se pierde, crea otra estación y desactiva esta.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="token">Token de la estación</Label>
              <div className="flex gap-2">
                <Input id="token" readOnly value={estado.token} className="font-mono text-xs" onFocus={(ev) => ev.currentTarget.select()} />
                <Button type="button" variant="outline" size="icon" aria-label="Copiar token" onClick={() => copiar(estado.token!)}><Copy /></Button>
              </div>
              <p className="text-xs text-muted-foreground">Servidor: <span className="font-mono">{servidor}</span></p>
            </div>
            <DialogFooter><Button onClick={cerrar}>Listo</Button></DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Nueva estación</DialogTitle>
              <DialogDescription>Un nombre que identifique la sede y el PC, por ejemplo “Sede centro · PC tomógrafo”.</DialogDescription>
            </DialogHeader>
            <form action={accion} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre</Label>
                <Input id="nombre" name="nombre" required maxLength={80} />
              </div>
              {estado?.error && <p role="alert" className="text-sm text-destructive">{estado.error}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={cerrar}>Cancelar</Button>
                <Button type="submit" disabled={pendiente}>{pendiente ? "Creando…" : "Crear y generar token"}</Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
