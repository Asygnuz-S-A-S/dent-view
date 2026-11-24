"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { simularPagoAprobado } from "./actions";

export function BotonPagoSimulado({ idLink }: { idLink: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  return (
    <Button disabled={pendiente} onClick={() => iniciar(async () => {
      const r = await simularPagoAprobado(idLink);
      if (r.error) return void toast.error(r.error);
      toast.success("Pago aprobado: webhook enviado");
      router.refresh();
    })}>{pendiente ? "Enviando…" : "Simular pago aprobado"}</Button>
  );
}
