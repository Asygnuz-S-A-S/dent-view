"use client";

import { ChevronLeft, ChevronRight, Download, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { INFO_ANGULO, type Angulo } from "@/lib/valoraciones";

export type FotoVista = { id: string; angulo: string };
const ZOOM_MIN = 1, ZOOM_MAX = 8;
const limitar = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
const etiqueta = (a: string) => INFO_ANGULO[a as Angulo]?.etiqueta ?? a;

/** Fotos por ángulo (ya ordenadas) con visor modal: zoom (rueda, botones, doble clic, pellizco), arrastre, rotación y teclado. Patrón copiado de components/estudios/visor-imagen.tsx. */
export function GaleriaValoracion({ valoracionId, fotos }: { valoracionId: string; fotos: FotoVista[] }) {
  const [indice, setIndice] = useState<number | null>(null);
  const [t, setT] = useState({ z: 1, x: 0, y: 0, r: 0 });
  const punteros = useRef(new Map<number, { x: number; y: number }>());
  const pinza = useRef<number | null>(null);
  const foto = indice === null ? null : fotos[indice] ?? null;
  const url = (id: string, v: string) => `/api/valoraciones/${valoracionId}/medios/${id}?v=${v}`;

  const [visto, setVisto] = useState(foto?.id);
  if (foto?.id !== visto) { setVisto(foto?.id); setT({ z: 1, x: 0, y: 0, r: 0 }); }
  const zoom = useCallback((f: number) => setT((p) => { const z = limitar(p.z * f); return z === 1 ? { ...p, z, x: 0, y: 0 } : { ...p, z }; }), []);
  const mover = useCallback((d: number) => setIndice((i) => (i === null || fotos.length < 2 ? i : (i + d + fotos.length) % fotos.length)), [fotos.length]);

  useEffect(() => {
    if (!foto) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") mover(-1);
      else if (e.key === "ArrowRight") mover(1);
      else if (e.key === "+" || e.key === "=") zoom(1.25);
      else if (e.key === "-") zoom(0.8);
      else if (e.key.toLowerCase() === "r") setT((p) => ({ ...p, r: (p.r + 90) % 360 }));
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [foto, mover, zoom]);

  function alMover(e: React.PointerEvent) {
    const prev = punteros.current.get(e.pointerId);
    if (!prev) return;
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...punteros.current.values()];
    if (pts.length === 2) {
      const d = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      if (pinza.current) zoom(d / pinza.current);
      pinza.current = d;
    } else if (t.z > 1) setT((p) => ({ ...p, x: p.x + e.clientX - prev.x, y: p.y + e.clientY - prev.y }));
  }
  const soltar = (e: React.PointerEvent) => { punteros.current.delete(e.pointerId); pinza.current = null; };

  if (fotos.length === 0) return <p className="text-sm text-muted-foreground">El paciente aún no ha subido fotos.</p>;
  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {fotos.map((f, i) => (
          <li key={f.id}>
            <button type="button" onClick={() => setIndice(i)} className="group block w-full overflow-hidden rounded-lg border bg-muted text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50" aria-label={`Ampliar: ${etiqueta(f.angulo)}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- ruta autenticada, nunca URL pública */}
              <img src={url(f.id, "thumb")} alt={etiqueta(f.angulo)} loading="lazy" className="aspect-square w-full object-cover transition-transform group-hover:scale-[1.02]" />
              <span className="block truncate px-2 py-1.5 text-xs font-medium">{etiqueta(f.angulo)}</span>
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={!!foto} onOpenChange={(a) => !a && setIndice(null)}>
        <DialogContent onOpenAutoFocus={(e) => e.preventDefault()} className="flex h-[92dvh] w-[calc(100vw-1rem)] max-w-5xl flex-col gap-3 sm:max-w-5xl">
          <DialogTitle className="pr-8">{foto ? etiqueta(foto.angulo) : ""} <span className="text-xs font-normal text-muted-foreground">{(indice ?? 0) + 1} / {fotos.length}</span></DialogTitle>
          <DialogDescription className="sr-only">Flechas cambian de foto; más y menos hacen zoom; R rota.</DialogDescription>
          {foto && (
            <>
              <div className="relative min-h-0 flex-1 overflow-hidden rounded-md bg-black">
                <div className="absolute inset-0 touch-none select-none" onWheel={(e) => zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15)}
                  onDoubleClick={() => setT((p) => (p.z > 1 ? { ...p, z: 1, x: 0, y: 0 } : { ...p, z: 2.5 }))}
                  onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); }}
                  onPointerMove={alMover} onPointerUp={soltar} onPointerCancel={soltar}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- ruta autenticada con transformaciones propias */}
                  <img src={url(foto.id, "web")} alt={etiqueta(foto.angulo)} draggable={false} className="absolute inset-0 m-auto max-h-full max-w-full object-contain"
                    style={{ transform: `translate(${t.x}px, ${t.y}px) rotate(${t.r}deg) scale(${t.z})`, cursor: t.z > 1 ? "grab" : "zoom-in" }} />
                </div>
                {fotos.length > 1 && (<>
                  <Button type="button" size="icon" variant="secondary" aria-label="Foto anterior" className="absolute top-1/2 left-2 -translate-y-1/2 opacity-80" onClick={() => mover(-1)}><ChevronLeft /></Button>
                  <Button type="button" size="icon" variant="secondary" aria-label="Foto siguiente" className="absolute top-1/2 right-2 -translate-y-1/2 opacity-80" onClick={() => mover(1)}><ChevronRight /></Button>
                </>)}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="icon" variant="outline" aria-label="Acercar" onClick={() => zoom(1.25)}><ZoomIn /></Button>
                <Button type="button" size="icon" variant="outline" aria-label="Alejar" onClick={() => zoom(0.8)}><ZoomOut /></Button>
                <Button type="button" size="icon" variant="outline" aria-label="Rotar" onClick={() => setT((p) => ({ ...p, r: (p.r + 90) % 360 }))}><RotateCw /></Button>
                <span className="text-xs text-muted-foreground tabular-nums">{Math.round(t.z * 100)}%</span>
                <Button asChild variant="outline" className="ml-auto"><a href={url(foto.id, "original")} download><Download /> Original</a></Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
