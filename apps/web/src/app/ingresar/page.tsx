"use client";

import { ScanLine } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { mensajeErrorLogin } from "@/lib/login";

export default function Ingresar() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    const f = new FormData(e.currentTarget);
    const { data, error } = await authClient.signIn.email({
      email: String(f.get("email")),
      password: String(f.get("password")),
    });
    setEnviando(false);
    if (error) return setError(mensajeErrorLogin(error.status));
    // Cuenta con MFA: la sesión se crea solo después del código.
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) return router.push("/ingresar/2fa");
    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center justify-center gap-2 font-semibold">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ScanLine className="size-4" />
          </div>
          dent-view
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Ingresar</CardTitle>
            <CardDescription>Accede con el correo de tu centro.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={enviar}>
              <div className="grid gap-2">
                <Label htmlFor="email">Correo</Label>
                <Input id="email" name="email" type="email" autoComplete="username" required />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Contraseña</Label>
                  <Link href="/recuperar" className="text-sm text-muted-foreground underline-offset-4 hover:underline">¿Olvidaste tu contraseña?</Link>
                </div>
                <Input id="password" name="password" type="password" autoComplete="current-password" required />
              </div>
              {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
              <Button type="submit" disabled={enviando}>{enviando ? "Ingresando…" : "Ingresar"}</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
