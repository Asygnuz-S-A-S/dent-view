"use client";

import { ArrowRight } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { cambiarEstadoOrden } from "@/app/(app)/ordenes/actions";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ETIQUETA_ESTADO_ORDEN, siguienteEstado, transicionValida, type EstadoOrden } from "@/lib/ordenes";

export function AccionesOrden({ id, estado }: { id: string; estado: EstadoOrden }) {
  const [pendiente, iniciar] = useTransition();
  const siguiente = siguienteEstado(estado);
  const cambiar = (nuevo: EstadoOrden) =>
    iniciar(async () => {
      const r = await cambiarEstadoOrden(id, nuevo);
      if (r.error) toast.error(r.error);
      else toast.success(`Orden ${ETIQUETA_ESTADO_ORDEN[nuevo].toLowerCase()}`);
    });

  return (
    <div className="flex flex-wrap gap-2">
      {siguiente && (
        <Button disabled={pendiente} onClick={() => cambiar(siguiente)}>
          Marcar como {ETIQUETA_ESTADO_ORDEN[siguiente].toLowerCase()} <ArrowRight />
        </Button>
      )}
      {transicionValida(estado, "CANCELADA") && (
        <AlertDialog>
          <AlertDialogTrigger asChild><Button variant="outline" disabled={pendiente}>Cancelar orden</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Cancelar la orden?</AlertDialogTitle>
              <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Volver</AlertDialogCancel>
              <AlertDialogAction onClick={() => cambiar("CANCELADA")}>Cancelar orden</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
