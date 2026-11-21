"use client";

import { Settings2, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { actualizarSeguimientoDoctor, crearSeguimientoDoctor, generarSeguimientosDoctores, guardarUmbralesDoctores, registrarContactoDoctor } from "@/app/(app)/seguimiento-doctores/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CANALES_DOCTOR, ESTADOS_SEG_DOCTOR, ETIQUETA_CANAL_DOCTOR, ETIQUETA_ESTADO_SEG_DOCTOR, ETIQUETA_MOTIVO_SEG_DOCTOR, MOTIVOS_SEG_DOCTOR, type EstadoSegDoctor, type MotivoSegDoctor, type Umbrales } from "@/lib/seguimiento-doctores";

export type Responsable = { id: string; nombre: string };
const NINGUNO = "__ninguno";
const AVISO_NOTA = "Sin información clínica ni de pacientes";

function useGuardar(alExito: () => void) {
  const [pendiente, iniciar] = useTransition();
  const ejecutar = (fn: () => Promise<{ error?: string }>, ok: string) => iniciar(async () => {
    const r = await fn();
    if (r.error) return void toast.error(r.error);
    toast.success(ok);
    alExito();
  });
  return { pendiente, ejecutar };
}

function SelectResponsable({ id, valor, onCambio, responsables }: { id: string; valor: string; onCambio: (v: string) => void; responsables: Responsable[] }) {
  return (
    <Select value={valor || NINGUNO} onValueChange={(v) => onCambio(v === NINGUNO ? "" : v)}>
      <SelectTrigger id={id}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NINGUNO}>Sin responsable</SelectItem>
        {responsables.map((r) => <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function CrearSeguimiento({ doctorId, nombre, motivo = "OTRO", responsables, etiqueta = "Crear seguimiento" }: { doctorId: string; nombre: string; motivo?: MotivoSegDoctor; responsables: Responsable[]; etiqueta?: string }) {
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState({ motivo, responsableId: "", proximoContacto: "", nota: "" });
  const { pendiente, ejecutar } = useGuardar(() => setAbierto(false));
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild><Button size="sm" variant="outline" aria-label={`${etiqueta}: ${nombre}`}>{etiqueta}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Seguimiento de {nombre}</DialogTitle><DialogDescription>Tarea comercial para recuperar o fidelizar al doctor remitente.</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor={`sd-motivo-${doctorId}`}>Motivo</Label>
            <Select value={f.motivo} onValueChange={(v) => setF({ ...f, motivo: v as MotivoSegDoctor })}>
              <SelectTrigger id={`sd-motivo-${doctorId}`}><SelectValue /></SelectTrigger>
              <SelectContent>{MOTIVOS_SEG_DOCTOR.map((m) => <SelectItem key={m} value={m}>{ETIQUETA_MOTIVO_SEG_DOCTOR[m]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label htmlFor={`sd-resp-${doctorId}`}>Responsable</Label><SelectResponsable id={`sd-resp-${doctorId}`} valor={f.responsableId} onCambio={(v) => setF({ ...f, responsableId: v })} responsables={responsables} /></div>
            <div className="grid gap-1.5"><Label htmlFor={`sd-prox-${doctorId}`}>Próximo contacto</Label><Input id={`sd-prox-${doctorId}`} type="date" value={f.proximoContacto} onChange={(e) => setF({ ...f, proximoContacto: e.target.value })} /></div>
          </div>
          <div className="grid gap-1.5"><Label htmlFor={`sd-nota-${doctorId}`}>Nota ({AVISO_NOTA})</Label><Input id={`sd-nota-${doctorId}`} value={f.nota} maxLength={500} onChange={(e) => setF({ ...f, nota: e.target.value })} /></div>
          <Button disabled={pendiente} onClick={() => ejecutar(() => crearSeguimientoDoctor({ doctorId, ...f }), "Seguimiento creado")}>Guardar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function GenerarSeguimientos() {
  const [pendiente, iniciar] = useTransition();
  return (
    <Button disabled={pendiente} onClick={() => iniciar(async () => {
      const r = await generarSeguimientosDoctores();
      if (r.error) return void toast.error(r.error);
      toast.success(r.creados ? `${r.creados} seguimiento(s) creados` : "No hay doctores nuevos en riesgo sin seguimiento");
    })}><Sparkles /> Generar seguimientos de doctores en riesgo</Button>
  );
}

export function UmbralesDialog({ umbrales }: { umbrales: Umbrales }) {
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState({ factor: String(umbrales.umbralRiesgoFactor), inactivo: String(umbrales.diasInactivo), critico: String(umbrales.diasInactivoCritico) });
  const { pendiente, ejecutar } = useGuardar(() => setAbierto(false));
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild><Button variant="outline"><Settings2 /> Umbrales</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Umbrales del semáforo</DialogTitle><DialogDescription>Aplican a todos los doctores del centro.</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5"><Label htmlFor="um-factor">En riesgo: veces su intervalo habitual sin enviar</Label><Input id="um-factor" type="number" min={1} max={10} step={0.5} value={f.factor} onChange={(e) => setF({ ...f, factor: e.target.value })} /></div>
          <div className="grid gap-1.5"><Label htmlFor="um-inactivo">Inactivo desde (días sin enviar)</Label><Input id="um-inactivo" type="number" min={7} value={f.inactivo} onChange={(e) => setF({ ...f, inactivo: e.target.value })} /></div>
          <div className="grid gap-1.5"><Label htmlFor="um-critico">Crítico desde (días sin enviar)</Label><Input id="um-critico" type="number" min={8} value={f.critico} onChange={(e) => setF({ ...f, critico: e.target.value })} /></div>
          <Button disabled={pendiente} onClick={() => ejecutar(() => guardarUmbralesDoctores({ umbralRiesgoFactor: Number(f.factor), diasInactivo: Number(f.inactivo), diasInactivoCritico: Number(f.critico) }), "Umbrales guardados")}>Guardar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RegistrarContacto({ doctorId, seguimientoId }: { doctorId: string; seguimientoId?: string | null }) {
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState({ canal: "LLAMADA", resultado: "", nota: "" });
  const { pendiente, ejecutar } = useGuardar(() => { setAbierto(false); setF({ canal: "LLAMADA", resultado: "", nota: "" }); });
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild><Button>Registrar contacto</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar contacto</DialogTitle><DialogDescription>Queda en la bitácora del doctor y en la auditoría del centro.</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="ct-canal">Canal</Label>
            <Select value={f.canal} onValueChange={(v) => setF({ ...f, canal: v })}>
              <SelectTrigger id="ct-canal"><SelectValue /></SelectTrigger>
              <SelectContent>{CANALES_DOCTOR.map((c) => <SelectItem key={c} value={c}>{ETIQUETA_CANAL_DOCTOR[c]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5"><Label htmlFor="ct-resultado">Resultado</Label><Input id="ct-resultado" value={f.resultado} maxLength={120} placeholder="Ej. Contestó, retoma remisiones" onChange={(e) => setF({ ...f, resultado: e.target.value })} /></div>
          <div className="grid gap-1.5"><Label htmlFor="ct-nota">Nota ({AVISO_NOTA})</Label><Input id="ct-nota" value={f.nota} maxLength={500} onChange={(e) => setF({ ...f, nota: e.target.value })} /></div>
          <Button disabled={pendiente} onClick={() => ejecutar(() => registrarContactoDoctor({ doctorId, seguimientoId: seguimientoId ?? null, canal: f.canal as "LLAMADA", resultado: f.resultado, nota: f.nota }), "Contacto registrado")}>Guardar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function EditarSeguimiento({ id, estado, responsableId, proximoContacto, nota, responsables }: {
  id: string; estado: EstadoSegDoctor; responsableId: string | null; proximoContacto: string; nota: string | null; responsables: Responsable[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState({ estado, responsableId: responsableId ?? "", proximoContacto, nota: nota ?? "" });
  const { pendiente, ejecutar } = useGuardar(() => setAbierto(false));
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild><Button variant="outline">Actualizar tarea</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Actualizar seguimiento</DialogTitle><DialogDescription>Recuperado o descartado cierran la tarea.</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="ed-estado">Estado</Label>
            <Select value={f.estado} onValueChange={(v) => setF({ ...f, estado: v as EstadoSegDoctor })}>
              <SelectTrigger id="ed-estado"><SelectValue /></SelectTrigger>
              <SelectContent>{ESTADOS_SEG_DOCTOR.map((e) => <SelectItem key={e} value={e}>{ETIQUETA_ESTADO_SEG_DOCTOR[e]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label htmlFor="ed-resp">Responsable</Label><SelectResponsable id="ed-resp" valor={f.responsableId} onCambio={(v) => setF({ ...f, responsableId: v })} responsables={responsables} /></div>
            <div className="grid gap-1.5"><Label htmlFor="ed-prox">Próximo contacto</Label><Input id="ed-prox" type="date" value={f.proximoContacto} onChange={(e) => setF({ ...f, proximoContacto: e.target.value })} /></div>
          </div>
          <div className="grid gap-1.5"><Label htmlFor="ed-nota">Nota ({AVISO_NOTA})</Label><Input id="ed-nota" value={f.nota} maxLength={500} onChange={(e) => setF({ ...f, nota: e.target.value })} /></div>
          <Button disabled={pendiente} onClick={() => ejecutar(() => actualizarSeguimientoDoctor(id, f), "Seguimiento actualizado")}>Guardar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
