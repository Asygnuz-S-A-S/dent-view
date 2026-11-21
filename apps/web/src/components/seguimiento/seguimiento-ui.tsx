"use client";

// Implementación independiente (sala limpia) a partir de docs/sala-limpia/03-recordatorios-y-seguimiento.md
import { Phone } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { aplazarSeguimiento, cancelarSeguimiento, completarSeguimiento, crearSeguimiento, registrarIntento } from "@/app/(app)/seguimiento/actions";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CANALES_CONTACTO, ETIQUETA_MOTIVO, ETIQUETA_RESULTADO, MOTIVOS, PRIORIDADES, RESULTADOS, type Motivo, type Resultado } from "@/lib/seguimiento";

const ETIQUETA_CANAL: Record<string, string> = { TELEFONO: "Teléfono", WHATSAPP: "WhatsApp", SMS: "SMS", CORREO: "Correo" };
const ETIQUETA_PRIORIDAD: Record<string, string> = { ALTA: "Alta", NORMAL: "Normal", BAJA: "Baja" };

export function NuevoSeguimiento({ pacientes, mesActual }: { pacientes: { id: string; nombre: string }[]; mesActual: string }) {
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState({ pacienteId: "", motivo: "CONTROL" as Motivo, prioridad: "NORMAL", mes: mesActual, nota: "" });
  const [pendiente, iniciar] = useTransition();
  const guardar = () => iniciar(async () => {
    const r = await crearSeguimiento({ ...f, prioridad: f.prioridad as "NORMAL" });
    if (r.error) return void toast.error(r.error);
    toast.success("Seguimiento guardado");
    setAbierto(false);
  });
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild><Button>Nuevo seguimiento</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nuevo seguimiento</DialogTitle><DialogDescription>Si el paciente ya tiene uno activo con el mismo motivo, se actualiza ese.</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="seg-pac">Paciente</Label>
            <Select value={f.pacienteId} onValueChange={(v) => setF({ ...f, pacienteId: v })}>
              <SelectTrigger id="seg-pac"><SelectValue placeholder="Selecciona" /></SelectTrigger>
              <SelectContent>{pacientes.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="seg-motivo">Motivo</Label>
              <Select value={f.motivo} onValueChange={(v) => setF({ ...f, motivo: v as Motivo })}>
                <SelectTrigger id="seg-motivo"><SelectValue /></SelectTrigger>
                <SelectContent>{MOTIVOS.map((m) => <SelectItem key={m} value={m}>{ETIQUETA_MOTIVO[m]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="seg-prio">Prioridad</Label>
              <Select value={f.prioridad} onValueChange={(v) => setF({ ...f, prioridad: v })}>
                <SelectTrigger id="seg-prio"><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORIDADES.map((p) => <SelectItem key={p} value={p}>{ETIQUETA_PRIORIDAD[p]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5"><Label htmlFor="seg-mes">Mes objetivo</Label><Input id="seg-mes" type="month" value={f.mes} onChange={(e) => setF({ ...f, mes: e.target.value })} /></div>
          <div className="grid gap-1.5"><Label htmlFor="seg-nota">Nota (no incluya información clínica)</Label><Input id="seg-nota" value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} /></div>
          <Button disabled={pendiente || !f.pacienteId} onClick={guardar}>Guardar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AccionesSeguimiento({ id, telefono }: { id: string; telefono: string | null }) {
  const [abierto, setAbierto] = useState(false);
  const [canal, setCanal] = useState("TELEFONO");
  const [pendiente, iniciar] = useTransition();
  const ejecutar = (fn: () => Promise<{ error?: string }>, ok: string) => iniciar(async () => {
    const r = await fn();
    if (r.error) toast.error(r.error); else { toast.success(ok); setAbierto(false); }
  });
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {telefono && <Button asChild size="sm" variant="outline"><a href={`tel:${telefono}`}><Phone /> Llamar</a></Button>}
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogTrigger asChild><Button size="sm" variant="outline">Registrar intento</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar intento de contacto</DialogTitle><DialogDescription>Elige el canal y el resultado.</DialogDescription></DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="int-canal">Canal</Label>
            <Select value={canal} onValueChange={setCanal}>
              <SelectTrigger id="int-canal"><SelectValue /></SelectTrigger>
              <SelectContent>{CANALES_CONTACTO.map((c) => <SelectItem key={c} value={c}>{ETIQUETA_CANAL[c]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {RESULTADOS.map((r) => (
              <Button key={r} variant="outline" disabled={pendiente} onClick={() => ejecutar(() => registrarIntento(id, { canal: canal as "TELEFONO", resultado: r as Resultado }), "Intento registrado")}>{ETIQUETA_RESULTADO[r]}</Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <Button size="sm" variant="ghost" disabled={pendiente} onClick={() => ejecutar(() => aplazarSeguimiento(id, 1), "Aplazado un mes")}>Aplazar 1 mes</Button>
      <Button size="sm" variant="ghost" disabled={pendiente} onClick={() => ejecutar(() => completarSeguimiento(id), "Completado")}>Completar</Button>
      <AlertDialog>
        <AlertDialogTrigger asChild><Button size="sm" variant="ghost" disabled={pendiente}>Cancelar</Button></AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar este seguimiento?</AlertDialogTitle>
            <AlertDialogDescription>Dejará de aparecer en la lista de activos y no se podrá reactivar; tendrás que crear uno nuevo.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={() => ejecutar(() => cancelarSeguimiento(id), "Seguimiento cancelado")}>Cancelar seguimiento</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
