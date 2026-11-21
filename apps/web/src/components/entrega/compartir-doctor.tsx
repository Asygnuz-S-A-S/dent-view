"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { compartirConDoctor } from "@/app/resultados/[token]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CompartirDoctor({ token }: { token: string }) {
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [pendiente, iniciar] = useTransition();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await compartirConDoctor(token, { nombre, correo });
          if (r.error) return void toast.error(r.error);
          toast.success("Enviado a su doctor");
          setNombre(""); setCorreo("");
        });
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="doctor-nombre">Nombre de su doctor</Label>
        <Input id="doctor-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="doctor-correo">Correo de su doctor</Label>
        <Input id="doctor-correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} autoComplete="off" />
      </div>
      <Button type="submit" disabled={pendiente || !nombre.trim() || !correo.trim()}>Compartir</Button>
    </form>
  );
}
