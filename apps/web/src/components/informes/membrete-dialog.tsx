"use client";

// Implementación independiente (sala limpia) a partir de docs/sala-limpia/01-documentos-e-informes.md
import { ImageUp } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { guardarMembrete } from "@/app/(app)/informes/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type Membrete = { nombre: string; direccion: string; telefono: string; correo: string; registro: string };
const CAMPOS = [["nombre", "Nombre (vacío = nombre del centro)"], ["direccion", "Dirección"], ["telefono", "Teléfono"], ["correo", "Correo"], ["registro", "Registro / habilitación"]] as const;

export function MembreteDialog({ inicial }: { inicial: Membrete }) {
  const [abierto, setAbierto] = useState(false);
  const [d, setD] = useState(inicial);
  const [logo, setLogo] = useState<string | undefined>(undefined);
  const [pendiente, iniciar] = useTransition();

  function elegirLogo(f: File | undefined) {
    if (!f) return;
    if (f.size > 150_000) return void toast.error("El logo debe pesar menos de 150 KB");
    const lector = new FileReader();
    lector.onload = () => setLogo(String(lector.result));
    lector.readAsDataURL(f);
  }
  const guardar = () => iniciar(async () => {
    const r = await guardarMembrete({ ...d, logo });
    if (r.error) return void toast.error(r.error);
    toast.success("Membrete guardado");
    setAbierto(false);
  });

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild><Button variant="outline"><ImageUp /> Membrete</Button></DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Membrete de los informes</DialogTitle>
          <DialogDescription>Aparece en el encabezado del PDF. Logo recomendado: PNG cuadrado y liviano.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {CAMPOS.map(([k, et]) => (
            <div key={k} className="grid gap-1.5"><Label htmlFor={`mb-${k}`}>{et}</Label><Input id={`mb-${k}`} value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} /></div>
          ))}
          <div className="grid gap-1.5">
            <Label htmlFor="mb-logo">Logo (PNG o JPEG)</Label>
            <Input id="mb-logo" type="file" accept="image/png,image/jpeg" onChange={(e) => elegirLogo(e.target.files?.[0])} />
            {logo && <p className="text-xs text-muted-foreground">Logo nuevo listo para guardar.</p>}
          </div>
          <Button disabled={pendiente} onClick={guardar}>Guardar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
