"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { verificarCodigo } from "@/app/resultados/[token]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FormCodigo({ token }: { token: string }) {
  const router = useRouter();
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await verificarCodigo(token, codigo);
          if (r.error) setError(r.error);
          else router.refresh();
        });
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="codigo">Código de acceso</Label>
        <Input id="codigo" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" className="text-center text-lg tracking-widest"
          value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))} aria-invalid={!!error} aria-describedby={error ? "codigo-error" : undefined} />
        {error && <p id="codigo-error" role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
      <Button type="submit" disabled={pendiente || codigo.length !== 6}>Ver resultados</Button>
    </form>
  );
}
