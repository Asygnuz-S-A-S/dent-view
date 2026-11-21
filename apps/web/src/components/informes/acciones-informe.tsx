"use client";

// Implementación independiente (sala limpia) a partir de docs/sala-limpia/01-documentos-e-informes.md
import { Archive, Download, FilePen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { archivarInforme, corregirInforme } from "@/app/(app)/informes/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function AccionesInforme({ id, puedeDescargar, puedeCorregir, puedeArchivar }: { id: string; puedeDescargar: boolean; puedeCorregir: boolean; puedeArchivar: boolean }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [pendiente, iniciar] = useTransition();

  const corregir = () =>
    iniciar(async () => {
      const r = await corregirInforme(id, motivo);
      if (r.error || !r.id) return void toast.error(r.error ?? "No se pudo crear la corrección");
      toast.success("Corrección creada como borrador");
      setAbierto(false);
      router.push(`/informes/${r.id}`);
    });
  const archivar = () =>
    iniciar(async () => {
      const r = await archivarInforme(id);
      if (r.error) toast.error(r.error);
      else { toast.success("Informe archivado"); router.refresh(); }
    });

  return (
    <div className="flex flex-wrap gap-2">
      {puedeDescargar && <Button asChild><a href={`/api/informes/${id}/pdf`}><Download /> Descargar PDF</a></Button>}
      {puedeCorregir && (
        <Dialog open={abierto} onOpenChange={setAbierto}>
          <DialogTrigger asChild><Button variant="outline"><FilePen /> Corregir (nueva versión)</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Corregir informe</DialogTitle>
              <DialogDescription>El informe emitido se conserva. Se crea una nueva versión en borrador que lo sustituirá cuando la emitas.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="motivo-correccion">Motivo de la corrección</Label>
              <Textarea id="motivo-correccion" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </div>
            <DialogFooter><Button disabled={pendiente || motivo.trim().length < 5} onClick={corregir}>Crear versión</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {puedeArchivar && <Button variant="ghost" disabled={pendiente} onClick={archivar}><Archive /> Archivar</Button>}
    </div>
  );
}
