"use client";

// Implementación independiente (sala limpia) a partir de docs/sala-limpia/02-consentimientos-y-proteccion-de-datos.md
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cambiarEstadoSolicitud, crearSolicitud } from "@/app/(app)/proteccion-datos/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ETIQUETA_TIPO_SOLICITUD, TIPOS_SOLICITUD, type TipoSolicitud } from "@/lib/consentimientos";

export function NuevaSolicitud({ pacientes }: { pacientes: { id: string; nombre: string }[] }) {
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState({ solicitanteNombre: "", solicitanteCorreo: "", tipo: "CONSULTA" as TipoSolicitud, pacienteId: "", notas: "" });
  const [pendiente, iniciar] = useTransition();
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild><Button>Nueva solicitud</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Solicitud del titular</DialogTitle><DialogDescription>Se calcula la fecha límite en días hábiles según el tipo.</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5"><Label htmlFor="sol-n">Nombre del solicitante</Label><Input id="sol-n" value={f.solicitanteNombre} onChange={(e) => setF({ ...f, solicitanteNombre: e.target.value })} /></div>
          <div className="grid gap-1.5"><Label htmlFor="sol-c">Correo</Label><Input id="sol-c" type="email" value={f.solicitanteCorreo} onChange={(e) => setF({ ...f, solicitanteCorreo: e.target.value })} /></div>
          <div className="grid gap-1.5">
            <Label htmlFor="sol-t">Tipo</Label>
            <Select value={f.tipo} onValueChange={(v) => setF({ ...f, tipo: v as TipoSolicitud })}>
              <SelectTrigger id="sol-t"><SelectValue /></SelectTrigger>
              <SelectContent>{TIPOS_SOLICITUD.map((t) => <SelectItem key={t} value={t}>{ETIQUETA_TIPO_SOLICITUD[t]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sol-p">Paciente (opcional)</Label>
            <Select value={f.pacienteId || "ninguno"} onValueChange={(v) => setF({ ...f, pacienteId: v === "ninguno" ? "" : v })}>
              <SelectTrigger id="sol-p"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="ninguno">Sin paciente asociado</SelectItem>{pacientes.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5"><Label htmlFor="sol-no">Notas</Label><Input id="sol-no" value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} /></div>
          <Button disabled={pendiente} onClick={() => iniciar(async () => {
            const r = await crearSolicitud({ ...f, pacienteId: f.pacienteId || null });
            if (r.error) return void toast.error(r.error);
            toast.success("Solicitud registrada");
            setAbierto(false);
          })}>Registrar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AvanzarSolicitud({ id, estado }: { id: string; estado: string }) {
  const [pendiente, iniciar] = useTransition();
  const ir = (nuevo: string) => iniciar(async () => {
    const r = await cambiarEstadoSolicitud(id, nuevo);
    if (r.error) toast.error(r.error); else toast.success("Actualizada");
  });
  if (estado === "COMPLETADA" || estado === "RECHAZADA") return <span className="text-xs text-muted-foreground">Cerrada</span>;
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {estado === "RECIBIDA" && <Button size="sm" variant="outline" disabled={pendiente} onClick={() => ir("EN_TRAMITE")}>En trámite</Button>}
      <Button size="sm" variant="outline" disabled={pendiente} onClick={() => ir("COMPLETADA")}>Completar</Button>
      <Button size="sm" variant="ghost" disabled={pendiente} onClick={() => ir("RECHAZADA")}>Rechazar</Button>
    </div>
  );
}
