"use client";

import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

type Alta = { qr: string; secreto: string; respaldo: string[] };

/** Verificación en dos pasos (TOTP): activar con QR + primer código, mostrar los códigos de respaldo una vez, desactivar con contraseña. */
export function FormMfa({ activo }: { activo: boolean }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [alta, setAlta] = useState<Alta | null>(null);
  const [codigos, setCodigos] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function empezar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get("clave-mfa"));
    iniciar(async () => {
      const { data, error } = await authClient.twoFactor.enable({ password });
      if (error || !data || !("totpURI" in data) || !data.totpURI) return setError("No se pudo iniciar: revisa tu contraseña");
      setError(null);
      const secreto = new URL(data.totpURI).searchParams.get("secret") ?? "";
      setAlta({ qr: await QRCode.toDataURL(data.totpURI, { margin: 1, width: 192 }), secreto, respaldo: data.backupCodes ?? [] });
    });
  }

  function confirmar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("codigo-mfa")).replace(/\s/g, "");
    iniciar(async () => {
      const { error } = await authClient.twoFactor.verifyTotp({ code });
      if (error) return setError(error.status === 429 ? "Demasiados intentos; espera un momento" : "Código incorrecto");
      setError(null);
      setCodigos(alta!.respaldo);
      setAlta(null);
    });
  }

  function desactivar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get("clave-mfa-off"));
    iniciar(async () => {
      const { error } = await authClient.twoFactor.disable({ password });
      if (error) return setError("No se pudo desactivar: revisa tu contraseña");
      setError(null);
      toast.success("Verificación en dos pasos desactivada");
      router.refresh();
    });
  }

  function terminar() {
    setCodigos(null);
    toast.success("Verificación en dos pasos activada");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Verificación en dos pasos
          <Badge variant={activo || codigos ? "default" : "secondary"}>{activo || codigos ? "Activa" : "Inactiva"}</Badge>
        </CardTitle>
        <CardDescription>Además de tu contraseña, al ingresar te pediremos un código de tu app de autenticación (Google Authenticator, Microsoft Authenticator, 1Password…).</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {codigos ? (
          <>
            <p className="text-sm">
              Guarda estos <strong>códigos de respaldo</strong> en un lugar seguro. Cada uno sirve una vez si pierdes el teléfono.{" "}
              <strong>No se volverán a mostrar.</strong>
            </p>
            <ul className="grid grid-cols-2 gap-2 rounded-md bg-muted p-3 font-mono text-sm select-all">
              {codigos.map((c) => <li key={c}>{c}</li>)}
            </ul>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => navigator.clipboard.writeText(codigos.join("\n")).then(() => toast.success("Códigos copiados"), () => toast.error("No se pudo copiar"))}
              >
                Copiar
              </Button>
              <Button onClick={terminar}>Ya los guardé</Button>
            </div>
          </>
        ) : alta ? (
          <form onSubmit={confirmar} className="grid gap-4">
            <p className="text-sm">1. Escanea el código QR con tu app de autenticación.</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL generada en el navegador */}
            <img src={alta.qr} alt="Código QR para la app de autenticación" width={192} height={192} className="rounded-md border" />
            <p className="text-sm text-muted-foreground">
              ¿No puedes escanearlo? Escribe esta clave: <code className="break-all rounded bg-muted px-1 font-mono select-all">{alta.secreto}</code>
            </p>
            <div className="grid gap-2">
              <Label htmlFor="codigo-mfa">2. Escribe el código de 6 dígitos que muestra la app</Label>
              <Input id="codigo-mfa" name="codigo-mfa" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required className="max-w-40" />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div><Button type="submit" disabled={pendiente}>{pendiente ? "Verificando…" : "Activar"}</Button></div>
          </form>
        ) : activo ? (
          <form onSubmit={desactivar} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="clave-mfa-off">Contraseña (para desactivarla)</Label>
              <Input id="clave-mfa-off" name="clave-mfa-off" type="password" autoComplete="current-password" required />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div><Button type="submit" variant="outline" disabled={pendiente}>{pendiente ? "Desactivando…" : "Desactivar"}</Button></div>
          </form>
        ) : (
          <form onSubmit={empezar} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="clave-mfa">Contraseña actual</Label>
              <Input id="clave-mfa" name="clave-mfa" type="password" autoComplete="current-password" required />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div><Button type="submit" disabled={pendiente}>{pendiente ? "Preparando…" : "Configurar"}</Button></div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
