"use client";

import { numeroOrden } from "@/lib/ordenes";
import { Check, Link2, Link2Off, Send, UserCheck } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { asignarEstudio, buscarPacientes, desvincularEstudio, ordenesDePaciente, publicarEstudio, vincularEstudioOrden } from "@/app/(app)/estudios/actions";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Paciente = { id: string; nombre: string; documento: string };
type Orden = { id: string; numero: number; estado: string };
const SIN_ORDEN = "ninguna";

export function AsignarEstudio({ estudioId, doctores }: { estudioId: string; doctores: { id: string; nombre: string }[] }) {
  const [abierto, setAbierto] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [q, setQ] = useState("");
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [orden, setOrden] = useState(SIN_ORDEN);
  const [doctor, setDoctor] = useState("");

  // Búsqueda con retardo para no consultar en cada tecla.
  useEffect(() => {
    if (!abierto) return;
    const t = setTimeout(() => void buscarPacientes(q).then(setPacientes), 250);
    return () => clearTimeout(t);
  }, [q, abierto]);

  function elegir(p: Paciente) {
    setPaciente(p);
    setOrden(SIN_ORDEN);
    setOrdenes([]);
    void ordenesDePaciente(p.id).then(setOrdenes);
  }

  function cambiar(o: boolean) {
    setAbierto(o);
    if (!o) {
      setQ("");
      setPaciente(null);
      setOrdenes([]);
      setOrden(SIN_ORDEN);
      setDoctor("");
    }
  }

  function guardar() {
    if (!paciente) return void toast.error("Elige un paciente");
    iniciar(async () => {
      const r = await asignarEstudio({ estudioId, pacienteId: paciente.id, doctorId: doctor, ordenId: orden === SIN_ORDEN ? undefined : orden });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Estudio asignado");
      cambiar(false);
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={cambiar}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><UserCheck /> Asignar</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Asignar estudio</DialogTitle>
          <DialogDescription>Vincula el estudio a un paciente y a su doctor remitente.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Paciente</Label>
            <Command shouldFilter={false} className="rounded-lg border">
              <CommandInput value={q} onValueChange={setQ} placeholder="Buscar por nombre o documento" />
              <CommandList className="max-h-40">
                <CommandEmpty>Sin resultados.</CommandEmpty>
                {pacientes.map((p) => (
                  <CommandItem key={p.id} value={p.id} onSelect={() => elegir(p)}>
                    <div className="min-w-0 flex-1">
                      <div className="truncate capitalize">{p.nombre.toLowerCase()}</div>
                      <div className="text-xs text-muted-foreground">{p.documento}</div>
                    </div>
                    {paciente?.id === p.id && <Check className="size-4" />}
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`doctor-${estudioId}`}>Doctor remitente</Label>
            <Select value={doctor} onValueChange={setDoctor}>
              <SelectTrigger id={`doctor-${estudioId}`} className="w-full"><SelectValue placeholder={doctores.length ? "Elige un doctor" : "No hay doctores en el centro"} /></SelectTrigger>
              <SelectContent>
                {doctores.map((d) => <SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`orden-${estudioId}`}>Orden del paciente</Label>
            <Select value={orden} onValueChange={setOrden} disabled={!paciente}>
              <SelectTrigger id={`orden-${estudioId}`} className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_ORDEN}>Automática (la orden abierta más reciente)</SelectItem>
                {ordenes.map((o) => <SelectItem key={o.id} value={o.id}>Orden {numeroOrden(o.numero)} · {o.estado.toLowerCase()}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={guardar} disabled={pendiente || !paciente || !doctor}>{pendiente ? "Asignando…" : "Asignar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PublicarEstudio({ estudioId }: { estudioId: string }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pendiente}
      onClick={() =>
        iniciar(async () => {
          const r = await publicarEstudio(estudioId);
          if (r.ok) toast.success("Estudio publicado");
          else toast.error(r.error);
        })
      }
    >
      <Send /> Publicar
    </Button>
  );
}

export function VincularOrden({ estudioId, pacienteId, ordenActualId }: { estudioId: string; pacienteId: string; ordenActualId: string | null }) {
  const [abierto, setAbierto] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [orden, setOrden] = useState("");

  function cambiar(o: boolean) {
    setAbierto(o);
    if (o) void ordenesDePaciente(pacienteId).then(setOrdenes);
    else setOrden("");
  }
  const ejecutar = (accion: () => ReturnType<typeof vincularEstudioOrden>, mensaje: string) =>
    iniciar(async () => {
      const r = await accion();
      if (!r.ok) return void toast.error(r.error);
      toast.success(mensaje);
      setAbierto(false);
    });

  return (
    <Dialog open={abierto} onOpenChange={cambiar}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">{ordenActualId ? <Link2Off /> : <Link2 />} {ordenActualId ? "Cambiar orden" : "Vincular orden"}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Orden del estudio</DialogTitle>
          <DialogDescription>Al vincular una orden agendada, pasa a tomada.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor={`vincular-${estudioId}`}>Orden del paciente</Label>
          <Select value={orden} onValueChange={setOrden}>
            <SelectTrigger id={`vincular-${estudioId}`} className="w-full"><SelectValue placeholder={ordenes.length ? "Elige una orden" : "El paciente no tiene órdenes"} /></SelectTrigger>
            <SelectContent>
              {ordenes.map((o) => <SelectItem key={o.id} value={o.id}>Orden {numeroOrden(o.numero)} · {o.estado.toLowerCase()}{o.id === ordenActualId ? " (actual)" : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          {ordenActualId && <Button variant="outline" disabled={pendiente} onClick={() => ejecutar(() => desvincularEstudio(estudioId), "Estudio desvinculado")}>Desvincular</Button>}
          <Button disabled={pendiente || !orden} onClick={() => ejecutar(() => vincularEstudioOrden(estudioId, orden), "Estudio vinculado")}>Vincular</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
