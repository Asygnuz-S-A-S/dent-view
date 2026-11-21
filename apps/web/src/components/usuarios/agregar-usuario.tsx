"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { agregarUsuario } from "@/app/(app)/usuarios/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLES_USUARIO } from "./roles";

export function AgregarUsuario() {
  const [abierto, setAbierto] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [rol, setRol] = useState("recepcion");
  const [clave, setClave] = useState<{ correo: string; clave: string | null } | null>(null);

  function cambiar(o: boolean) {
    setAbierto(o);
    if (!o) {
      setClave(null);
      setRol("recepcion");
    }
  }

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    iniciar(async () => {
      const r = await agregarUsuario({
        nombre: String(f.get("nombre")),
        correo: String(f.get("correo")),
        rol: rol as "recepcion",
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Se envió la invitación");
      setClave({ correo: r.correo, clave: r.claveTemporal });
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={cambiar}>
      <DialogTrigger asChild>
        <Button><Plus /> Agregar usuario</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{clave ? "Se envió la invitación" : "Agregar usuario"}</DialogTitle>
          <DialogDescription>
            {clave ? "La persona la verá al ingresar." : "Invita al personal del centro."}
          </DialogDescription>
        </DialogHeader>
        {clave ? (
          <div className="space-y-3 text-sm">
            <p>Correo: <strong>{clave.correo}</strong></p>
            {clave.clave ? (
              <>
                <p>Clave temporal: <code className="rounded bg-muted px-2 py-1 font-mono">{clave.clave}</code></p>
                <p className="text-muted-foreground">Solo se muestra ahora; no se puede recuperar. Deberá cambiarla en su primer ingreso.</p>
              </>
            ) : (
              <p className="text-muted-foreground">Si aún no tiene cuenta, recibirá un correo para activarla; si ya la tiene, verá la invitación al ingresar.</p>
            )}
            <DialogFooter><Button onClick={() => cambiar(false)}>Listo</Button></DialogFooter>
          </div>
        ) : (
          <form className="grid gap-4" onSubmit={enviar}>
            <div className="grid gap-2">
              <Label htmlFor="nombre">Nombre</Label>
              <Input id="nombre" name="nombre" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="correo">Correo</Label>
              <Input id="correo" name="correo" type="email" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rol">Rol</Label>
              <Select value={rol} onValueChange={setRol}>
                <SelectTrigger id="rol" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES_USUARIO.map((r) => <SelectItem key={r.valor} value={r.valor}>{r.etiqueta}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pendiente}>{pendiente ? "Agregando…" : "Agregar"}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
