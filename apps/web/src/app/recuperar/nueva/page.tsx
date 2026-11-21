"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MarcoAcceso } from "@/app/ingresar/marco";
import { authClient } from "@/lib/auth-client";
import { MIN_CLAVE, validarClaveNueva } from "@/lib/perfil";

function Formulario() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (!token || params.get("error")) {
    return (
      <div className="grid gap-4 text-sm">
        <p role="alert">El enlace no es válido o ya venció. Solicita uno nuevo.</p>
        <Button asChild><Link href="/recuperar">Solicitar otro enlace</Link></Button>
      </div>
    );
  }

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const nueva = String(f.get("nueva"));
    const invalida = validarClaveNueva(nueva, String(f.get("confirmacion")));
    if (invalida) return setError(invalida);
    setEnviando(true);
    const { error } = await authClient.resetPassword({ newPassword: nueva, token: token! });
    setEnviando(false);
    if (error) return setError("El enlace no es válido o ya venció. Solicita uno nuevo.");
    toast.success("Contraseña guardada. Ya puedes ingresar.");
    router.push("/ingresar");
  }

  return (
    <form className="grid gap-4" onSubmit={enviar}>
      <div className="grid gap-2">
        <Label htmlFor="nueva">Contraseña nueva</Label>
        <Input id="nueva" name="nueva" type="password" autoComplete="new-password" minLength={MIN_CLAVE} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirmacion">Confirmar contraseña</Label>
        <Input id="confirmacion" name="confirmacion" type="password" autoComplete="new-password" required />
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <Button type="submit" disabled={enviando}>{enviando ? "Guardando…" : "Guardar contraseña"}</Button>
    </form>
  );
}

export default function NuevaClave() {
  return (
    <MarcoAcceso titulo="Fija tu contraseña" descripcion={`Mínimo ${MIN_CLAVE} caracteres. Se cerrarán las sesiones abiertas.`}>
      <Suspense>
        <Formulario />
      </Suspense>
    </MarcoAcceso>
  );
}
