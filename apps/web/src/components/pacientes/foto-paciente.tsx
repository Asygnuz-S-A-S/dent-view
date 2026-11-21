"use client";

import { Camera, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { iniciales } from "@/lib/pacientes";
import { FOTO_MAX_BYTES } from "@/lib/pacientes-foto";

/** Foto de perfil: solo se pide por la ruta autenticada (nunca URL pública). Subir/quitar solo con `editable`. */
export function FotoPaciente({ pacienteId, nombre, tieneFoto, editable }: { pacienteId: string; nombre: string; tieneFoto: boolean; editable: boolean }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [ocupado, setOcupado] = useState(false);
  const url = `/pacientes/${pacienteId}/foto`;

  async function enviar(metodo: "POST" | "DELETE", cuerpo?: FormData) {
    setOcupado(true);
    try {
      const r = await fetch(url, { method: metodo, body: cuerpo });
      if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "No se pudo completar la acción");
      toast.success(metodo === "POST" ? "Foto actualizada" : "Foto eliminada");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo completar la acción");
    } finally {
      setOcupado(false);
    }
  }

  function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > FOTO_MAX_BYTES) return void toast.error("La foto supera los 5 MB");
    const datos = new FormData();
    datos.set("foto", f);
    void enviar("POST", datos);
  }

  return (
    <div className="flex shrink-0 flex-col items-center gap-2">
      <Avatar className="size-20 text-xl">
        {tieneFoto && <AvatarImage src={url} alt={`Foto de ${nombre}`} />}
        <AvatarFallback className="bg-primary/10 font-semibold text-primary">{iniciales(nombre)}</AvatarFallback>
      </Avatar>
      {editable && (
        <div className="flex gap-1">
          <input ref={entrada} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Elegir foto del paciente" onChange={elegir} />
          <Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={() => entrada.current?.click()}>
            <Camera /> {tieneFoto ? "Cambiar" : "Subir foto"}
          </Button>
          {tieneFoto && (
            <Button type="button" size="icon-sm" variant="ghost" disabled={ocupado} aria-label="Quitar foto" onClick={() => void enviar("DELETE")}>
              <Trash2 />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
