"use client";

import { ChevronLeft, ChevronRight, Download, RotateCw, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type ImagenVista = { id: string; titulo: string | null; nombreOriginal: string; mime: string; bytes: number };
const ZOOM_MIN = 1, ZOOM_MAX = 8;
const limitar = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

/** Visor modal de imágenes no DICOM: zoom (rueda, botones, doble clic, pellizco), arrastre, rotación, teclado, título editable, descarga y eliminación. */
export function VisorImagen({ imagenes, indice, onIndice, onCerrar, puedeEditar }: { imagenes: ImagenVista[]; indice: number | null; onIndice: (i: number) => void; onCerrar: () => void; puedeEditar: boolean }) {
  const router = useRouter();
  const img = indice === null ? null : imagenes[indice] ?? null;
  const [t, setT] = useState({ z: 1, x: 0, y: 0, r: 0 });
  const [confirmar, setConfirmar] = useState(false);
  const punteros = useRef(new Map<number, { x: number; y: number }>());
  const pinza = useRef<number | null>(null);

  // Al cambiar de imagen se restablece la vista (ajuste de estado durante el render, sin efecto).
  const [idVisto, setIdVisto] = useState(img?.id);
  if (img?.id !== idVisto) { setIdVisto(img?.id); setT({ z: 1, x: 0, y: 0, r: 0 }); }

  const zoom = useCallback((f: number) => setT((p) => { const z = limitar(p.z * f); return z === 1 ? { ...p, z, x: 0, y: 0 } : { ...p, z }; }), []);
  const mover = useCallback((d: number) => { if (indice !== null && imagenes.length > 1) onIndice((indice + d + imagenes.length) % imagenes.length); }, [indice, imagenes.length, onIndice]);

  useEffect(() => {
    if (!img || confirmar) return;
    const tecla = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "ArrowLeft") mover(-1);
      else if (e.key === "ArrowRight") mover(1);
      else if (e.key === "+" || e.key === "=") zoom(1.25);
      else if (e.key === "-") zoom(0.8);
      else if (e.key.toLowerCase() === "r") setT((p) => ({ ...p, r: (p.r + 90) % 360 }));
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [img, confirmar, mover, zoom]);

  function alMover(e: React.PointerEvent) {
    const prev = punteros.current.get(e.pointerId);
    if (!prev) return;
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...punteros.current.values()];
    if (pts.length === 2) {
      const d = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      if (pinza.current) zoom(d / pinza.current);
      pinza.current = d;
    } else if (t.z > 1) {
      setT((p) => ({ ...p, x: p.x + e.clientX - prev.x, y: p.y + e.clientY - prev.y }));
    }
  }
  const soltar = (e: React.PointerEvent) => { punteros.current.delete(e.pointerId); pinza.current = null; };

  async function guardarTitulo(valor: string) {
    if (!img || valor.trim() === (img.titulo ?? "")) return;
    const r = await fetch(`/api/imagenes/${img.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titulo: valor }) });
    if (!r.ok) return void toast.error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "No se pudo guardar el título");
    toast.success("Título guardado");
    router.refresh();
  }

  async function eliminar() {
    if (!img) return;
    const r = await fetch(`/api/imagenes/${img.id}`, { method: "DELETE" });
    setConfirmar(false);
    if (!r.ok) return void toast.error("No se pudo eliminar la imagen");
    toast.success("Imagen eliminada");
    if (imagenes.length <= 1) onCerrar();
    else onIndice(Math.min(indice ?? 0, imagenes.length - 2));
    router.refresh();
  }

  return (
    <>
      <Dialog open={!!img} onOpenChange={(a) => !a && onCerrar()}>
        <DialogContent onOpenAutoFocus={(e) => e.preventDefault()} className="flex h-[92dvh] w-[calc(100vw-1rem)] max-w-5xl flex-col gap-3 sm:max-w-5xl">
          <DialogTitle className="sr-only">Imagen {indice !== null ? indice + 1 : ""} de {imagenes.length}</DialogTitle>
          <DialogDescription className="sr-only">Flechas izquierda y derecha cambian de imagen; más y menos hacen zoom; R rota.</DialogDescription>
          {img && (
            <>
              <div className="flex flex-wrap items-center gap-2 pr-8">
                {puedeEditar ? (
                  <Input key={img.id} aria-label="Título de la imagen" className="max-w-xs" defaultValue={img.titulo ?? ""} placeholder={img.nombreOriginal} maxLength={120}
                    onBlur={(e) => void guardarTitulo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
                ) : <p className="font-medium">{img.titulo || img.nombreOriginal}</p>}
                <span className="text-xs text-muted-foreground">{(indice ?? 0) + 1} / {imagenes.length}</span>
              </div>
              <div className="relative min-h-0 flex-1 overflow-hidden rounded-md bg-black">
              <div
                className="absolute inset-0 touch-none select-none"
                onWheel={(e) => zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15)}
                onDoubleClick={() => setT((p) => (p.z > 1 ? { ...p, z: 1, x: 0, y: 0 } : { ...p, z: 2.5 }))}
                onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); }}
                onPointerMove={alMover} onPointerUp={soltar} onPointerCancel={soltar}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- ruta autenticada con transformaciones propias */}
                <img src={`/api/imagenes/${img.id}?v=web`} alt={img.titulo || img.nombreOriginal} draggable={false}
                  className="absolute inset-0 m-auto max-h-full max-w-full object-contain"
                  style={{ transform: `translate(${t.x}px, ${t.y}px) rotate(${t.r}deg) scale(${t.z})`, cursor: t.z > 1 ? "grab" : "zoom-in" }} />
                </div>
                {imagenes.length > 1 && (<>
                  <Button type="button" size="icon" variant="secondary" aria-label="Imagen anterior" className="absolute top-1/2 left-2 -translate-y-1/2 opacity-80" onClick={() => mover(-1)}><ChevronLeft /></Button>
                  <Button type="button" size="icon" variant="secondary" aria-label="Imagen siguiente" className="absolute top-1/2 right-2 -translate-y-1/2 opacity-80" onClick={() => mover(1)}><ChevronRight /></Button>
                </>)}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="icon" variant="outline" aria-label="Acercar" onClick={() => zoom(1.25)}><ZoomIn /></Button>
                <Button type="button" size="icon" variant="outline" aria-label="Alejar" onClick={() => zoom(0.8)}><ZoomOut /></Button>
                <Button type="button" size="icon" variant="outline" aria-label="Rotar" onClick={() => setT((p) => ({ ...p, r: (p.r + 90) % 360 }))}><RotateCw /></Button>
                <span className="text-xs text-muted-foreground tabular-nums">{Math.round(t.z * 100)}%</span>
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button asChild variant="outline"><a href={`/api/imagenes/${img.id}?v=web&descargar=1`}><Download /> Copia web</a></Button>
                  {puedeEditar && <Button asChild variant="outline"><a href={`/api/imagenes/${img.id}?v=original&descargar=1`}><Download /> Original</a></Button>}
                  {puedeEditar && <Button type="button" variant="destructive" onClick={() => setConfirmar(true)}><Trash2 /> Eliminar</Button>}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta imagen?</AlertDialogTitle>
            <AlertDialogDescription>Se borra del almacenamiento y de los borradores de informe que la usan; los PDF ya emitidos no cambian. Queda registrado en la auditoría.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void eliminar()}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
