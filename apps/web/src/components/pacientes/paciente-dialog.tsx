"use client";

import { Pencil, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { guardarPaciente } from "@/app/(app)/pacientes/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TIPOS_DOCUMENTO } from "@/lib/pacientes";

export type PacienteForm = {
  id: string;
  tipoDocumento: string;
  numeroDocumento: string;
  nombre: string;
  fechaNacimiento: string; // YYYY-MM-DD
  celular: string;
  correo: string;
  direccion: string;
  alertas: string;
  notas: string;
};

export function PacienteDialog({ paciente }: { paciente?: PacienteForm }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    setError(null);
    iniciar(async () => {
      const r = await guardarPaciente(datos);
      if ("error" in r) return setError(r.error);
      if ("existente" in r) {
        toast.info("Este paciente ya está registrado en el centro");
        router.push(`/pacientes/${r.existente}`);
        return setAbierto(false);
      }
      toast.success(paciente ? "Paciente actualizado" : "Paciente creado");
      setAbierto(false);
      if (paciente) router.refresh();
      else router.push(`/pacientes/${r.id}`);
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        {paciente ? (
          <Button variant="outline" size="sm"><Pencil /> Editar</Button>
        ) : (
          <Button><UserPlus /> Nuevo paciente</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{paciente ? "Editar paciente" : "Nuevo paciente"}</DialogTitle>
          <DialogDescription>
            Si el documento ya existe en la plataforma, se vincula al centro sin duplicarlo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="grid gap-4 sm:grid-cols-2">
          {paciente && <input type="hidden" name="id" value={paciente.id} />}
          <div className="grid gap-2">
            <Label htmlFor="tipoDocumento">Tipo de documento</Label>
            {/* En edición el documento es la identidad de la persona: no se cambia. */}
            <Select name="tipoDocumento" defaultValue={paciente?.tipoDocumento ?? "CC"} disabled={!!paciente}>
              <SelectTrigger id="tipoDocumento" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS_DOCUMENTO.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            {paciente && <input type="hidden" name="tipoDocumento" value={paciente.tipoDocumento} />}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="numeroDocumento">Número de documento</Label>
            <Input id="numeroDocumento" name="numeroDocumento" required defaultValue={paciente?.numeroDocumento} readOnly={!!paciente} />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="nombre">Nombre completo</Label>
            <Input id="nombre" name="nombre" required defaultValue={paciente?.nombre} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="fechaNacimiento">Fecha de nacimiento</Label>
            <Input id="fechaNacimiento" name="fechaNacimiento" type="date" defaultValue={paciente?.fechaNacimiento} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="celular">Celular</Label>
            <Input id="celular" name="celular" type="tel" defaultValue={paciente?.celular} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="correo">Correo</Label>
            <Input id="correo" name="correo" type="email" defaultValue={paciente?.correo} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="direccion">Dirección</Label>
            <Input id="direccion" name="direccion" defaultValue={paciente?.direccion} />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="alertas">Alertas (alergias, embarazo, condiciones)</Label>
            <Textarea id="alertas" name="alertas" rows={2} defaultValue={paciente?.alertas} />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="notas">Notas</Label>
            <Textarea id="notas" name="notas" rows={2} defaultValue={paciente?.notas} />
          </div>
          {error && <p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p>}
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
