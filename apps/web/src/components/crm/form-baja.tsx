"use client";

import { CheckCircle2 } from "lucide-react";
import { useState, useTransition } from "react";
import { confirmarBaja } from "@/app/baja/[token]/actions";
import { Button } from "@/components/ui/button";

export function FormBaja({ token }: { token: string }) {
  const [pendiente, iniciar] = useTransition();
  const [r, setR] = useState<Awaited<ReturnType<typeof confirmarBaja>> | null>(null);
  if (r && "ok" in r) {
    return (
      <p role="status" className="flex items-center justify-center gap-2 rounded-md bg-muted px-4 py-6 text-center text-sm">
        <CheckCircle2 className="size-5 shrink-0 text-success-ink" aria-hidden />
        Listo: ya no recibirás mensajes de seguimiento de {r.centro}.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <Button className="w-full" disabled={pendiente} onClick={() => iniciar(async () => setR(await confirmarBaja(token)))}>
        {pendiente ? "Registrando…" : "Confirmar: no quiero recibir más mensajes"}
      </Button>
      {r && "error" in r && <p role="alert" className="text-center text-sm text-danger-ink">{r.error}</p>}
    </div>
  );
}
