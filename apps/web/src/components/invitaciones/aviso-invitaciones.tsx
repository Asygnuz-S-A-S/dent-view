"use client";

import { MailPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { responder } from "@/app/(app)/invitaciones/actions";
import { Button } from "@/components/ui/button";

export type InvitacionPendiente = { id: string; centro: string; rol: string };

export function AvisoInvitaciones({ invitaciones }: { invitaciones: InvitacionPendiente[] }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();

  function enviar(id: string, aceptar: boolean) {
    iniciar(async () => {
      const r = await responder(id, aceptar);
      if (r.error) return void toast.error(r.error);
      toast.success(aceptar ? "Invitación aceptada" : "Invitación rechazada");
      router.refresh();
    });
  }

  return (
    <section aria-label="Invitaciones pendientes" className="space-y-2 border-b bg-muted/50 px-4 py-3">
      {invitaciones.map((i) => (
        <div key={i.id} className="flex flex-wrap items-center gap-3 text-sm">
          <MailPlus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1">Te invitaron a <strong>{i.centro}</strong> como {i.rol}.</span>
          <Button size="sm" disabled={pendiente} onClick={() => enviar(i.id, true)}>Aceptar</Button>
          <Button size="sm" variant="outline" disabled={pendiente} onClick={() => enviar(i.id, false)}>Rechazar</Button>
        </div>
      ))}
    </section>
  );
}
