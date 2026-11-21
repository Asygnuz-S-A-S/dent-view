"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { guardarPerfilProfesional } from "@/app/(app)/perfil/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { MIN_CLAVE, validarClaveNueva } from "@/lib/perfil";

export function FormDatos({ nombre, correo }: { nombre: string; correo: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const nuevo = String(new FormData(e.currentTarget).get("nombre")).trim();
    if (nuevo.length < 2) return void toast.error("Escribe tu nombre");
    iniciar(async () => {
      const { error } = await authClient.updateUser({ name: nuevo });
      if (error) return void toast.error("No se pudo guardar el nombre");
      toast.success("Nombre actualizado");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader><CardTitle>Datos de la cuenta</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={enviar} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="nombre">Nombre</Label>
            <Input id="nombre" name="nombre" defaultValue={nombre} required maxLength={80} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="correo">Correo</Label>
            <Input id="correo" value={correo} readOnly disabled />
          </div>
          <div><Button type="submit" disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar"}</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}

export function FormClave() {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const nueva = String(f.get("nueva"));
    const invalida = validarClaveNueva(nueva, String(f.get("confirmacion")));
    setError(invalida);
    if (invalida) return;
    iniciar(async () => {
      const { error } = await authClient.changePassword({ currentPassword: String(f.get("actual")), newPassword: nueva, revokeOtherSessions: true });
      if (error) return setError("No se pudo cambiar la contraseña: revisa la clave actual");
      form.reset();
      toast.success("Contraseña actualizada");
      router.push("/inicio");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cambiar contraseña</CardTitle>
        <CardDescription>Mínimo {MIN_CLAVE} caracteres. Se cerrarán tus otras sesiones.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={enviar} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="actual">Contraseña actual</Label>
            <Input id="actual" name="actual" type="password" autoComplete="current-password" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="nueva">Contraseña nueva</Label>
            <Input id="nueva" name="nueva" type="password" autoComplete="new-password" minLength={MIN_CLAVE} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirmacion">Confirmar contraseña nueva</Label>
            <Input id="confirmacion" name="confirmacion" type="password" autoComplete="new-password" required />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div><Button type="submit" disabled={pendiente}>{pendiente ? "Cambiando…" : "Cambiar contraseña"}</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}

const CAMPOS = [
  ["tarjetaProfesional", "Tarjeta profesional"],
  ["especialidad", "Especialidad"],
  ["telefono", "Teléfono"],
  ["consultorio", "Consultorio"],
] as const;

export function FormProfesional({ inicial }: { inicial: Record<(typeof CAMPOS)[number][0], string> }) {
  const [pendiente, iniciar] = useTransition();

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    iniciar(async () => {
      const r = await guardarPerfilProfesional(datos);
      if ("error" in r) return void toast.error(r.error);
      toast.success("Perfil profesional actualizado");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Perfil profesional</CardTitle>
        <CardDescription>La tarjeta profesional aparece en los informes que firmas; solo tú puedes cambiarla.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={enviar} className="grid gap-4 sm:grid-cols-2">
          {CAMPOS.map(([k, etiqueta]) => (
            <div key={k} className="grid gap-2">
              <Label htmlFor={k}>{etiqueta}</Label>
              <Input id={k} name={k} defaultValue={inicial[k]} maxLength={120} />
            </div>
          ))}
          <div className="sm:col-span-2"><Button type="submit" disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar"}</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}
