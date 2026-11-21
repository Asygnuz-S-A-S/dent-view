"use client";

// Implementación independiente (sala limpia) a partir de docs/sala-limpia/01-documentos-e-informes.md
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { emitirInforme, guardarBorrador } from "@/app/(app)/informes/actions";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type DatosInforme = { motivo: string; tecnica: string; hallazgos: string; impresion: string; recomendaciones: string };

const CAMPOS: { k: keyof DatosInforme; etiqueta: string; filas: number }[] = [
  { k: "motivo", etiqueta: "Motivo de la remisión", filas: 2 },
  { k: "tecnica", etiqueta: "Técnica / estudio realizado", filas: 2 },
  { k: "hallazgos", etiqueta: "Hallazgos", filas: 8 },
  { k: "impresion", etiqueta: "Impresión diagnóstica", filas: 4 },
  { k: "recomendaciones", etiqueta: "Recomendaciones", filas: 3 },
];

export function EditorInforme({ id, inicial, paciente }: { id: string; inicial: DatosInforme; paciente?: string }) {
  const router = useRouter();
  const [d, setD] = useState(inicial);
  const [pendiente, iniciar] = useTransition();

  const guardar = () =>
    iniciar(async () => {
      const r = await guardarBorrador(id, d);
      if (r.error) toast.error(r.error);
      else toast.success("Borrador guardado");
    });
  const emitir = () =>
    iniciar(async () => {
      const g = await guardarBorrador(id, d);
      if (g.error) return void toast.error(g.error);
      const r = await emitirInforme(id);
      if (r.error) return void toast.error(r.error);
      toast.success("Informe emitido");
      router.replace(`/informes/${id}?entregar=1`); // ofrece entregar los resultados de inmediato
    });

  return (
    <form onSubmit={(e) => { e.preventDefault(); guardar(); }} className="grid gap-5 lg:grid-cols-2">
      {CAMPOS.map(({ k, etiqueta, filas }) => (
        // Motivo y técnica son cortos: comparten fila en pantallas anchas; el resto ocupa todo el ancho.
        <div key={k} className={filas > 2 ? "grid gap-2 lg:col-span-2" : "grid gap-2"}>
          <Label htmlFor={`inf-${k}`}>{etiqueta}</Label>
          <Textarea id={`inf-${k}`} rows={filas} value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} />
        </div>
      ))}
      {/* Barra de acciones fija al pie de la tarjeta: firmar siempre está a mano en informes largos. */}
      <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-wrap items-center gap-2 rounded-b-xl border-t bg-card/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:-mb-6 sm:px-6 lg:col-span-2">
        <p className="mr-auto hidden max-w-md text-xs text-muted-foreground md:block">Al emitir se genera el PDF con su firma y el informe queda inmutable; las correcciones crean una nueva versión.</p>
        <Button type="submit" variant="outline" disabled={pendiente}>Guardar borrador</Button>
        <AlertDialog>
          <AlertDialogTrigger asChild><Button type="button" disabled={pendiente || !d.hallazgos.trim() || !d.impresion.trim()}>Firmar y emitir</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Firmar y emitir el informe?</AlertDialogTitle>
              <AlertDialogDescription>
                {paciente ? `Paciente: ${paciente}. ` : ""}Quedará firmado con su nombre y ya no se podrá editar; las correcciones crean una nueva versión.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3 text-sm">
              <div><p className="font-medium">Hallazgos</p><p className="line-clamp-4 whitespace-pre-wrap text-muted-foreground">{d.hallazgos}</p></div>
              <div><p className="font-medium">Impresión diagnóstica</p><p className="line-clamp-3 whitespace-pre-wrap text-muted-foreground">{d.impresion}</p></div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Seguir editando</AlertDialogCancel>
              <AlertDialogAction onClick={emitir}>Firmar y emitir</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </form>
  );
}
