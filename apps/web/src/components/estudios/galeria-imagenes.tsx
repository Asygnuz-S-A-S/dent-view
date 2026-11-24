"use client";

import { ImagePlus, ImageIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { VisorImagen, type ImagenVista } from "@/components/estudios/visor-imagen";
import { EstadoVacio } from "@/components/comunes/estado-vacio";
import { Button } from "@/components/ui/button";
import { IMG_ACCEPT, IMG_MAX_BYTES, IMG_MAX_PETICION, validarCantidad } from "@/lib/imagenes";

type Opcion = { id: string; etiqueta: string };
const SELECT = "h-8 rounded-md border border-input bg-background px-2 text-sm";

/** Galería de imágenes no DICOM del paciente con subida (JPG, PNG, WebP, HEIC) y visor modal. */
export function GaleriaImagenes({ pacienteId, imagenes, puedeEditar, ordenes = [], estudios = [] }: { pacienteId: string; imagenes: ImagenVista[]; puedeEditar: boolean; ordenes?: Opcion[]; estudios?: Opcion[] }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [indice, setIndice] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [ordenId, setOrdenId] = useState("");
  const [estudioId, setEstudioId] = useState("");

  async function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivos = [...(e.target.files ?? [])];
    e.target.value = "";
    const err = validarCantidad(archivos.length);
    if (err) return void (archivos.length && toast.error(err));
    const grande = archivos.find((f) => f.size > IMG_MAX_BYTES);
    if (grande) return void toast.error(`${grande.name} supera los 25 MB`);
    if (archivos.reduce((t, f) => t + f.size, 0) > IMG_MAX_PETICION) return void toast.error("La subida supera los 150 MB: súbelas en tandas");
    const datos = new FormData();
    datos.set("pacienteId", pacienteId);
    if (ordenId) datos.set("ordenId", ordenId);
    if (estudioId) datos.set("estudioId", estudioId);
    archivos.forEach((f) => datos.append("archivos", f));
    setOcupado(true);
    try {
      const r = await fetch("/api/imagenes", { method: "POST", body: datos });
      const j = (await r.json().catch(() => null)) as { subidas?: number; errores?: { nombre: string; error: string }[]; error?: string } | null;
      j?.errores?.forEach((x) => toast.error(`${x.nombre}: ${x.error}`));
      if (j?.subidas) toast.success(j.subidas === 1 ? "Imagen subida" : `${j.subidas} imágenes subidas`);
      else if (!j?.errores?.length) toast.error(j?.error ?? "No se pudo subir");
      router.refresh();
    } catch {
      toast.error("No se pudo subir");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="space-y-3" aria-label="Imágenes">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-medium">Imágenes ({imagenes.length})</h3>
        {puedeEditar && (<>
          {ordenes.length > 0 && <select aria-label="Orden de las imágenes" className={SELECT} value={ordenId} onChange={(e) => setOrdenId(e.target.value)}><option value="">Sin orden</option>{ordenes.map((o) => <option key={o.id} value={o.id}>{o.etiqueta}</option>)}</select>}
          {estudios.length > 0 && <select aria-label="Estudio de las imágenes" className={SELECT} value={estudioId} onChange={(e) => setEstudioId(e.target.value)}><option value="">Sin estudio</option>{estudios.map((o) => <option key={o.id} value={o.id}>{o.etiqueta}</option>)}</select>}
          <input ref={entrada} type="file" multiple accept={IMG_ACCEPT} className="sr-only" aria-label="Elegir imágenes" data-testid="subir-imagenes" onChange={subir} />
          <Button type="button" size="sm" disabled={ocupado} onClick={() => entrada.current?.click()}><ImagePlus /> {ocupado ? "Subiendo…" : "Subir imágenes"}</Button>
        </>)}
      </div>
      {imagenes.length === 0 ? (
        <EstadoVacio icono={ImageIcon} titulo="Sin imágenes" descripcion="Sube fotos o radiografías en JPG, PNG, WebP o HEIC (máx. 25 MB por archivo, hasta 20 archivos y 150 MB por subida)." />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {imagenes.map((im, i) => (
            <li key={im.id}>
              <button type="button" onClick={() => setIndice(i)} className="group block w-full overflow-hidden rounded-lg border bg-muted text-left focus-visible:ring-2 focus-visible:ring-ring">
                {/* eslint-disable-next-line @next/next/no-img-element -- ruta autenticada */}
                <img src={`/api/imagenes/${im.id}?v=thumb`} alt={im.titulo || im.nombreOriginal} loading="lazy" className="aspect-square w-full bg-black object-cover transition group-hover:opacity-90" />
                <span className="block truncate px-2 py-1 text-xs">{im.titulo || im.nombreOriginal}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <VisorImagen imagenes={imagenes} indice={indice} onIndice={setIndice} onCerrar={() => setIndice(null)} puedeEditar={puedeEditar} />
    </section>
  );
}
