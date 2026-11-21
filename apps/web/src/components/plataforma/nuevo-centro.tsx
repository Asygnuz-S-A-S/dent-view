"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { crearCentro } from "@/app/(app)/plataforma/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectorTipo } from "@/components/plataforma/selector-tipo";
import { slugify } from "@/lib/plataforma";
import { TIPO_POR_DEFECTO, type TipoCentro } from "@/lib/tipo-centro";

export function NuevoCentro() {
  const [abierto, setAbierto] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [slug, setSlug] = useState("");
  const [slugEditado, setSlugEditado] = useState(false);
  const [tipo, setTipo] = useState<TipoCentro>(TIPO_POR_DEFECTO);
  const [clave, setClave] = useState<{ correo: string; clave: string | null } | null>(null);

  function cambiar(o: boolean) {
    setAbierto(o);
    if (!o) {
      setSlug("");
      setSlugEditado(false);
      setTipo(TIPO_POR_DEFECTO);
      setClave(null);
    }
  }

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    iniciar(async () => {
      const r = await crearCentro({
        nombre: String(f.get("nombre")),
        slug,
        adminNombre: String(f.get("adminNombre")),
        adminCorreo: String(f.get("adminCorreo")),
        tipoCentro: tipo,
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Centro creado");
      setClave({ correo: r.correo, clave: r.claveTemporal });
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={cambiar}>
      <DialogTrigger asChild>
        <Button><Plus /> Nuevo centro</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{clave ? "Centro creado" : "Nuevo centro"}</DialogTitle>
          <DialogDescription>
            {clave ? "Comparte estas credenciales con el administrador." : "Crea el centro y su primer administrador."}
          </DialogDescription>
        </DialogHeader>
        {clave ? (
          <div className="space-y-3 text-sm">
            <p>Correo: <strong>{clave.correo}</strong></p>
            {clave.clave ? (
              <>
                <p>Clave temporal: <code className="rounded bg-muted px-2 py-1 font-mono">{clave.clave}</code></p>
                <p className="text-muted-foreground">Solo se muestra ahora; no se puede recuperar.</p>
              </>
            ) : (
              <p className="text-muted-foreground">Si la cuenta es nueva, recibirá un correo para fijar su contraseña; si ya existía, conserva su clave actual.</p>
            )}
            <DialogFooter><Button onClick={() => cambiar(false)}>Listo</Button></DialogFooter>
          </div>
        ) : (
          <form className="grid gap-4" onSubmit={enviar}>
            <div className="grid gap-2">
              <Label htmlFor="nombre">Nombre del centro</Label>
              <Input
                id="nombre"
                name="nombre"
                required
                onChange={(e) => !slugEditado && setSlug(slugify(e.target.value))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={slug}
                required
                onChange={(e) => {
                  setSlugEditado(true);
                  setSlug(e.target.value);
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tipo-centro">Tipo de centro</Label>
              <SelectorTipo id="tipo-centro" valor={tipo} onCambio={setTipo} className="w-full" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="adminNombre">Nombre del administrador</Label>
              <Input id="adminNombre" name="adminNombre" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="adminCorreo">Correo del administrador</Label>
              <Input id="adminCorreo" name="adminCorreo" type="email" required />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pendiente}>{pendiente ? "Creando…" : "Crear centro"}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
