"use client";

import { Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import type { CredencialesPres } from "@/app/(app)/presupuestos/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Muestra una sola vez el enlace y el código (en la BD solo quedan los hashes) para copiarlos o abrir WhatsApp (envío manual). */
export function CredencialesPresupuesto({ credenciales, onCerrar }: { credenciales: CredencialesPres | null; onCerrar: () => void }) {
  const copiar = (t: string, msg: string) => navigator.clipboard.writeText(t).then(() => toast.success(msg), () => toast.error("No se pudo copiar"));
  return (
    <Dialog open={!!credenciales} onOpenChange={(a) => !a && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cotización enviada</DialogTitle>
          <DialogDescription>
            {credenciales?.correoEnviado ? "Enviamos el enlace y el código en dos correos aparte." : "No se envió correo (falta el correo del paciente o no acepta mensajes): comparte el enlace y el código a mano."}{" "}
            Esta es la única vez que se muestran: no quedan guardados. Vence el {credenciales?.vence}.
          </DialogDescription>
        </DialogHeader>
        {credenciales && (
          <div className="space-y-4 text-sm">
            <div className="space-y-1"><p className="font-medium">Enlace</p><p data-testid="presupuesto-enlace" className="rounded-md border bg-muted/40 p-2 break-all select-all">{credenciales.enlace}</p></div>
            <div className="space-y-1"><p className="font-medium">Código de acceso</p><p data-testid="presupuesto-codigo" className="rounded-md border bg-muted/40 p-2 text-lg tracking-widest tabular-nums select-all">{credenciales.codigo}</p>
              <p className="text-xs text-muted-foreground">Compártelo por un medio distinto al del enlace.</p></div>
          </div>
        )}
        <DialogFooter className="gap-2 sm:justify-start">
          <Button type="button" variant="outline" onClick={() => credenciales && void copiar(credenciales.enlace, "Enlace copiado")}><Copy /> Copiar enlace</Button>
          {credenciales?.whatsapp && <Button asChild variant="outline"><a href={credenciales.whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle /> Abrir WhatsApp</a></Button>}
          <Button type="button" onClick={onCerrar}>Listo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
