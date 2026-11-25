"use client";

import { Paperclip } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PDF_MAX_BYTES } from "@/lib/estudios-carga";
import { IMG_MAX_BYTES } from "@/lib/imagenes";

/** Adjunta la orden médica (PDF o foto) a una orden. Lo usa el doctor remitente en SUS órdenes; el servidor lo vuelve a comprobar. */
export function AdjuntarOrden({ pacienteId, ordenId }: { pacienteId: string; ordenId: string }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [ocupado, setOcupado] = useState(false);
  async function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivos = [...(e.target.files ?? [])];
    e.target.value = "";
    if (archivos.length === 0) return;
    if (archivos.some((f) => f.size > Math.max(PDF_MAX_BYTES, IMG_MAX_BYTES))) return void toast.error("Cada archivo debe pesar menos de 25 MB (PDF: 20 MB)");
    const datos = new FormData();
    datos.set("pacienteId", pacienteId); datos.set("ordenId", ordenId); datos.set("categoria", "orden");
    archivos.forEach((f) => datos.append("archivos", f));
    setOcupado(true);
    try {
      const r = await fetch("/api/imagenes", { method: "POST", body: datos });
      const j = (await r.json().catch(() => null)) as { subidas?: number; errores?: { nombre: string; error: string }[]; error?: string } | null;
      j?.errores?.forEach((x) => toast.error(`${x.nombre}: ${x.error}`));
      if (j?.subidas) toast.success("Orden médica adjuntada");
      else if (!j?.errores?.length) toast.error(j?.error ?? "No se pudo adjuntar");
      router.refresh();
    } catch { toast.error("No se pudo adjuntar"); } finally { setOcupado(false); }
  }
  return (
    <>
      <input ref={entrada} type="file" multiple accept="application/pdf,image/*,.heic,.heif" className="sr-only" aria-label="Elegir la orden médica" data-testid="adjuntar-orden" onChange={subir} />
      <Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={() => entrada.current?.click()}><Paperclip /> {ocupado ? "Subiendo…" : "Adjuntar orden médica"}</Button>
    </>
  );
}
