"use client";

import { Download, ExternalLink, FileText, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmarAccion } from "@/components/comunes/confirmar-accion";
import { Button } from "@/components/ui/button";
import { ETIQUETA_CATEGORIA, type Categoria } from "@/lib/estudios-carga";
import { fechaCorta } from "@/lib/fechas";

export type DocumentoVista = { id: string; titulo: string | null; nombreOriginal: string; mime: string; bytes: number; creadoEn: string | Date; quien: string | null; categoria: Categoria };

/** Órdenes médicas y documentos adjuntos: ícono (PDF) o miniatura (imagen), fecha, quién los subió, abrir, descargar y (solo administrador) eliminar. */
export function ListaDocumentos({ documentos, puedeEliminar, vacio }: { documentos: DocumentoVista[]; puedeEliminar: boolean; vacio: string }) {
  const router = useRouter();
  async function eliminar(id: string) {
    const r = await fetch(`/api/imagenes/${id}`, { method: "DELETE" });
    if (r.ok) toast.success("Documento eliminado");
    else toast.error("No se pudo eliminar");
    router.refresh();
  }
  if (documentos.length === 0) return <p className="text-sm text-muted-foreground">{vacio}</p>;
  return (
    <ul className="divide-y rounded-lg border">
      {documentos.map((d) => {
        const nombre = d.titulo || d.nombreOriginal;
        return (
          <li key={d.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
            {d.mime === "application/pdf"
              ? <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><FileText className="size-6" aria-hidden /></span>
              // eslint-disable-next-line @next/next/no-img-element -- ruta autenticada
              : <img src={`/api/imagenes/${d.id}?v=thumb`} alt="" loading="lazy" className="size-12 shrink-0 rounded-md bg-black object-cover" />}
            <div className="min-w-0 flex-[1_1_12rem]">
              <p className="truncate font-medium">{nombre}</p>
              <p className="text-xs text-muted-foreground">{ETIQUETA_CATEGORIA[d.categoria]} · {fechaCorta(new Date(d.creadoEn))}{d.quien ? ` · ${d.quien}` : ""}</p>
            </div>
            <div className="flex items-center gap-1">
              <Button asChild size="sm" variant="outline"><a href={`/api/imagenes/${d.id}?v=original`} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${nombre}`}><ExternalLink /> Abrir</a></Button>
              <Button asChild size="icon-sm" variant="ghost"><a href={`/api/imagenes/${d.id}?v=original&descargar=1`} aria-label={`Descargar ${nombre}`}><Download /></a></Button>
              {puedeEliminar && (
                <ConfirmarAccion titulo="¿Eliminar este documento?" descripcion={`Se borrará «${nombre}» de forma permanente. Quedará registrado en la bitácora.`} confirmar="Eliminar" onConfirmar={() => void eliminar(d.id)}>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={`Eliminar ${nombre}`}><Trash2 /></Button>
                </ConfirmarAccion>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
