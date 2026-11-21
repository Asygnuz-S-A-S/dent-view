"use client";

import { Ban } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { revocarToken } from "@/app/(app)/integraciones/api/actions";
import { ConfirmarAccion } from "@/components/comunes/confirmar-accion";
import { Button } from "@/components/ui/button";

export function RevocarToken({ id, nombre }: { id: string; nombre: string }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <ConfirmarAccion
      titulo={`¿Revocar "${nombre}"?`}
      descripcion="Las integraciones que usen este token dejarán de funcionar de inmediato. No se puede deshacer."
      confirmar="Revocar"
      onConfirmar={() => iniciar(async () => {
        const r = await revocarToken(id);
        if (r.error) toast.error(r.error);
        else toast.success("Token revocado");
      })}
    >
      <Button variant="outline" size="sm" disabled={pendiente}><Ban /> Revocar</Button>
    </ConfirmarAccion>
  );
}
