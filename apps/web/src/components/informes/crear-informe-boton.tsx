"use client";

// Implementación independiente (sala limpia) a partir de docs/sala-limpia/01-documentos-e-informes.md
import { FilePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { crearInformeDeEstudio, crearInformeDeOrden } from "@/app/(app)/informes/actions";
import { Button } from "@/components/ui/button";

export function CrearInformeBoton({ ordenId, estudioId, etiqueta = "Redactar informe", variante = "default" }: { ordenId?: string; estudioId?: string; etiqueta?: string; variante?: "default" | "outline" }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  return (
    <Button size="sm" variant={variante} disabled={pendiente} onClick={() => iniciar(async () => {
      const r = await (estudioId ? crearInformeDeEstudio(estudioId) : crearInformeDeOrden(ordenId!));
      if (r.error || !r.id) toast.error(r.error ?? "No se pudo crear");
      else router.push(`/informes/${r.id}`);
    })}><FilePlus /> {etiqueta}</Button>
  );
}
