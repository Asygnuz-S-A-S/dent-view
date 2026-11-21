"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { MarcoAcceso } from "../marco";

export default function SegundoFactor() {
  const router = useRouter();
  const [respaldo, setRespaldo] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    const code = String(new FormData(e.currentTarget).get("codigo")).replace(/\s/g, "");
    const { error } = respaldo
      ? await authClient.twoFactor.verifyBackupCode({ code })
      : await authClient.twoFactor.verifyTotp({ code });
    setEnviando(false);
    if (error) {
      if (error.status === 429) return setError("Demasiados intentos. Espera un momento antes de volver a intentarlo.");
      if (error.code === "INVALID_TWO_FACTOR_COOKIE") return setError("La verificación venció. Vuelve a ingresar con tu correo y contraseña.");
      return setError("Código incorrecto.");
    }
    router.push("/");
    router.refresh();
  }

  return (
    <MarcoAcceso
      titulo="Verificación en dos pasos"
      descripcion={respaldo ? "Escribe uno de tus códigos de respaldo. Cada código sirve una sola vez." : "Escribe el código de 6 dígitos de tu app de autenticación."}
    >
      <form className="grid gap-4" onSubmit={enviar}>
        <div className="grid gap-2">
          <Label htmlFor="codigo">{respaldo ? "Código de respaldo" : "Código"}</Label>
          <Input
            key={String(respaldo)}
            id="codigo"
            name="codigo"
            autoComplete="one-time-code"
            inputMode={respaldo ? "text" : "numeric"}
            pattern={respaldo ? undefined : "[0-9 ]{6,7}"}
            required
            autoFocus
          />
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <Button type="submit" disabled={enviando}>{enviando ? "Verificando…" : "Verificar"}</Button>
        <Button type="button" variant="link" onClick={() => { setRespaldo(!respaldo); setError(""); }}>
          {respaldo ? "Usar el código de la app" : "Usar un código de respaldo"}
        </Button>
        <Link href="/ingresar" className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline">Volver a ingresar</Link>
      </form>
    </MarcoAcceso>
  );
}
