"use client";

import { Copy, UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { agregarDoctor } from "@/app/(app)/doctores/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CAMPOS = [
  ["tarjetaProfesional", "Tarjeta profesional"],
  ["especialidad", "Especialidad"],
  ["telefono", "Teléfono"],
  ["consultorio", "Consultorio"],
] as const;

/** Agrega un doctor. El perfil profesional lo edita solo su titular en /perfil: aquí solo se prellena en cuentas nuevas. */
export function DoctorDialog() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [clave, setClave] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    setError(null);
    iniciar(async () => {
      const r = await agregarDoctor(datos);
      if ("error" in r) return setError(r.error);
      setAbierto(false);
      toast.success("Se envió la invitación");
      setClave(r.claveTemporal);
      router.refresh();
    });
  }

  return (
    <>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogTrigger asChild>
          <Button><UserPlus /> Agregar doctor</Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Agregar doctor</DialogTitle>
            <DialogDescription>
              Si el correo ya tiene cuenta, el doctor recibe una invitación y debe aceptarla; los datos profesionales solo se prellenan en cuentas nuevas.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={enviar} className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="nombre">Nombre</Label>
              <Input id="nombre" name="nombre" required />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="correo">Correo</Label>
              <Input id="correo" name="correo" type="email" required />
            </div>
            {CAMPOS.map(([k, etiqueta]) => (
              <div key={k} className="grid gap-2">
                <Label htmlFor={k}>{etiqueta}</Label>
                <Input id={k} name={k} />
              </div>
            ))}
            {error && <p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p>}
            <DialogFooter className="sm:col-span-2">
              <Button type="submit" disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={clave !== null} onOpenChange={(o) => !o && setClave(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clave temporal</DialogTitle>
            <DialogDescription>Cópiala y entrégala al doctor ahora: no se vuelve a mostrar. Deberá cambiarla en su primer ingreso.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md bg-muted px-3 py-2 font-mono text-sm select-all">{clave}</code>
            <Button
              variant="outline"
              onClick={() => clave && navigator.clipboard.writeText(clave).then(() => toast.success("Clave copiada"), () => toast.error("No se pudo copiar"))}
            >
              <Copy /> Copiar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
