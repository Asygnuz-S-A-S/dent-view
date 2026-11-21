"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MarcoAcceso } from "@/app/ingresar/marco";
import { authClient } from "@/lib/auth-client";

export default function Recuperar() {
  const [listo, setListo] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    const { error } = await authClient.requestPasswordReset({
      email: String(new FormData(e.currentTarget).get("email")).trim(),
      redirectTo: "/recuperar/nueva",
    });
    setEnviando(false);
    if (error?.status === 429) return setError("Demasiadas solicitudes. Espera un minuto antes de volver a intentarlo.");
    // Mismo mensaje exista o no la cuenta.
    setListo(true);
  }

  return (
    <MarcoAcceso titulo="Recuperar contraseña" descripcion="Te enviaremos un enlace para fijar una contraseña nueva.">
      {listo ? (
        <div className="grid gap-4 text-sm">
          <p role="status">Si el correo pertenece a una cuenta, recibirás un enlace en unos minutos. Revisa también la carpeta de spam.</p>
          <Button asChild variant="outline"><Link href="/ingresar">Volver a ingresar</Link></Button>
        </div>
      ) : (
        <form className="grid gap-4" onSubmit={enviar}>
          <div className="grid gap-2">
            <Label htmlFor="email">Correo</Label>
            <Input id="email" name="email" type="email" autoComplete="username" required />
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <Button type="submit" disabled={enviando}>{enviando ? "Enviando…" : "Enviar enlace"}</Button>
          <Link href="/ingresar" className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline">Volver a ingresar</Link>
        </form>
      )}
    </MarcoAcceso>
  );
}
