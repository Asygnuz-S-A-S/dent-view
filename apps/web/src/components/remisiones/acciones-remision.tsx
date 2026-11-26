"use client";

import { ClipboardPlus, PackageCheck, Undo2, X } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { cancelarRemision, devolverRemision, rechazarRemision, recibirRemision } from "@/app/(app)/remisiones/actions";
import { ConfirmarAccion } from "@/components/comunes/confirmar-accion";
import { DialogoMotivo } from "@/components/comunes/dialogo-motivo";
import { Button } from "@/components/ui/button";
import type { EstadoRemision } from "@/lib/remisiones";

/** Acciones de una remisión según el lado y el estado. El servidor vuelve a validar rol, centro y transición. */
export function AccionesRemision({ id, estado, lado, clinico, gestion, hrefOrden, ordenId }: {
  id: string; estado: EstadoRemision; lado: "origen" | "destino"; clinico: boolean; gestion: boolean;
  /** Destino: enlace para crear la orden (solo si la remisión está RECIBIDA). */
  hrefOrden?: string; ordenId?: string | null;
}) {
  const [pendiente, iniciar] = useTransition();
  const ejecutar = (f: () => Promise<{ error?: string }>, exito: string) =>
    iniciar(async () => {
      const r = await f();
      if (r.error) toast.error(r.error);
      else toast.success(exito);
    });

  if (lado === "origen") {
    return gestion && (estado === "ENVIADA" || estado === "RECIBIDA") ? (
      <ConfirmarAccion titulo="¿Cancelar la remisión?" descripcion="El otro centro ya no podrá atenderla. Esta acción no se puede deshacer." confirmar="Cancelar remisión" onConfirmar={() => ejecutar(() => cancelarRemision(id), "Remisión cancelada")}>
        <Button variant="outline" disabled={pendiente}><X /> Cancelar remisión</Button>
      </ConfirmarAccion>
    ) : null;
  }
  return (
    <>
      {gestion && estado === "ENVIADA" && <Button disabled={pendiente} onClick={() => ejecutar(() => recibirRemision(id), "Remisión recibida")}><PackageCheck /> Recibir</Button>}
      {gestion && (estado === "ENVIADA" || estado === "RECIBIDA") && (
        <DialogoMotivo titulo="Rechazar la remisión" descripcion="El centro que remite verá el motivo." confirmar="Rechazar" exito="Remisión rechazada" ejecutar={(m) => rechazarRemision(id, m)}>
          <Button variant="outline"><X /> Rechazar</Button>
        </DialogoMotivo>
      )}
      {gestion && estado === "RECIBIDA" && hrefOrden && <Button asChild><Link href={hrefOrden}><ClipboardPlus /> Crear orden</Link></Button>}
      {clinico && (estado === "EN_PROCESO" || estado === "DEVUELTA") && ordenId && (
        <Button disabled={pendiente} variant={estado === "DEVUELTA" ? "outline" : "default"} onClick={() => ejecutar(() => devolverRemision(id), "Estudio e informe devueltos")}>
          <Undo2 /> {estado === "DEVUELTA" ? "Devolver de nuevo" : "Devolver estudio e informe"}
        </Button>
      )}
    </>
  );
}
