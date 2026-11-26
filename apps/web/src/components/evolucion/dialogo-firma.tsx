"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Reautenticación para firmar: contraseña y, si el usuario tiene MFA, el código TOTP. `children` es el botón que abre el diálogo. */
export function DialogoFirma({ children, titulo, descripcion, confirmar, exito, pideCodigo, ejecutar, extra, alExito }: {
  children: React.ReactNode; titulo: string; descripcion: string; confirmar: string; exito: string; pideCodigo: boolean;
  ejecutar: (clave: string, codigo: string) => Promise<{ error?: string }>; extra?: React.ReactNode; alExito?: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [clave, setClave] = useState("");
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    iniciar(async () => {
      const r = await ejecutar(clave, codigo);
      if (r.error) { setError(r.error); return; }
      toast.success(exito);
      setAbierto(false); setClave(""); setCodigo("");
      alExito?.();
    });
  };
  return (
    <Dialog open={abierto} onOpenChange={(o) => { setAbierto(o); if (!o) { setClave(""); setCodigo(""); setError(null); } }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <form onSubmit={enviar} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>{descripcion}</DialogDescription>
          </DialogHeader>
          {extra}
          <div className="space-y-2">
            <Label htmlFor="firma-clave">Tu contraseña</Label>
            <Input id="firma-clave" type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} required />
          </div>
          {pideCodigo && (
            <div className="space-y-2">
              <Label htmlFor="firma-codigo">Código de verificación (aplicación de autenticación)</Label>
              <Input id="firma-codigo" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={codigo} onChange={(e) => setCodigo(e.target.value)} required />
            </div>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter><Button type="submit" disabled={pendiente || !clave}>{pendiente ? "Firmando…" : confirmar}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
