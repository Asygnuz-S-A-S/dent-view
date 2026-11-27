"use client";

import { ChevronLeft, ChevronRight, Columns2, Download, ImagePlus, Loader2, RefreshCcw, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { enviarMensajeProfesional, guardarFotoEnFicha, guardarNotaFoto, type Credenciales } from "@/app/(app)/valoraciones/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { INFO_ANGULO, MAX_NOTA_FOTO, type Angulo } from "@/lib/valoraciones";
import { CredencialesDialogo } from "./credenciales-dialogo";

export type FotoVista = { id: string; angulo: string; nota: string | null; enFicha: boolean };
const ZOOM_MIN = 1, ZOOM_MAX = 8;
const limitar = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
const etiqueta = (a: string) => INFO_ANGULO[a as Angulo]?.etiqueta ?? a;

/** Visor simple con zoom propio (rueda, botones, doble clic y arrastre): cada lado del modo «Comparar» tiene el suyo. */
function Lienzo({ src, alt }: { src: string; alt: string }) {
  const [t, setT] = useState({ z: 1, x: 0, y: 0 });
  const previo = useRef<{ x: number; y: number } | null>(null);
  const zoom = (f: number) => setT((p) => { const z = limitar(p.z * f); return z === 1 ? { z, x: 0, y: 0 } : { ...p, z }; });
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden rounded-md bg-black">
      <div className="absolute inset-0 touch-none select-none" onWheel={(e) => zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15)}
        onDoubleClick={() => setT((p) => (p.z > 1 ? { z: 1, x: 0, y: 0 } : { ...p, z: 2.5 }))}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); previo.current = { x: e.clientX, y: e.clientY }; }}
        onPointerMove={(e) => { const a = previo.current; if (!a) return; previo.current = { x: e.clientX, y: e.clientY }; if (t.z > 1) setT((p) => ({ ...p, x: p.x + e.clientX - a.x, y: p.y + e.clientY - a.y })); }}
        onPointerUp={() => { previo.current = null; }} onPointerCancel={() => { previo.current = null; }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- ruta autenticada con transformaciones propias */}
        <img src={src} alt={alt} draggable={false} className="absolute inset-0 m-auto max-h-full max-w-full object-contain" style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.z})`, cursor: t.z > 1 ? "grab" : "zoom-in" }} />
      </div>
      <div className="absolute right-2 bottom-2 flex gap-1">
        <Button type="button" size="icon-sm" variant="secondary" aria-label={`Acercar ${alt}`} onClick={() => zoom(1.25)}><ZoomIn /></Button>
        <Button type="button" size="icon-sm" variant="secondary" aria-label={`Alejar ${alt}`} onClick={() => zoom(0.8)}><ZoomOut /></Button>
      </div>
    </div>
  );
}

/** Comentario, «Pedir otra toma» y «Guardar en la ficha» de la foto abierta; las dos acciones con efecto piden confirmación explícita. */
function PanelFoto({ valoracionId, foto, puedePedir, puedeFicha, alPedir }: { valoracionId: string; foto: FotoVista; puedePedir: boolean; puedeFicha: boolean; alPedir: (c: Credenciales) => void }) {
  const [nota, setNota] = useState(foto.nota ?? "");
  const [confirmar, setConfirmar] = useState<"pedir" | "ficha" | null>(null);
  const [pendiente, iniciar] = useTransition();
  const nombre = etiqueta(foto.angulo);
  return (
    <div className="grid gap-2 rounded-md border p-3">
      <div className="grid gap-1.5">
        <Label htmlFor="nota-foto">Comentario de esta foto</Label>
        <Textarea id="nota-foto" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={MAX_NOTA_FOTO} rows={2} placeholder="Apunte para quien valora" />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={pendiente || nota === (foto.nota ?? "")} onClick={() => iniciar(async () => {
            const r = await guardarNotaFoto(valoracionId, foto.id, nota);
            if (r.error) toast.error(r.error); else toast.success("Comentario guardado");
          })}>Guardar comentario</Button>
          <span className="text-xs text-muted-foreground">Solo lo ven quienes valoran; no va al paciente. {nota.length}/{MAX_NOTA_FOTO}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {puedePedir && <Button type="button" size="sm" variant="outline" disabled={pendiente} onClick={() => setConfirmar("pedir")}><RefreshCcw /> Pedir otra toma</Button>}
        {foto.enFicha
          ? <span className="inline-flex items-center text-xs text-muted-foreground">Ya está en la ficha del paciente.</span>
          : <Button type="button" size="sm" variant="outline" disabled={pendiente || !puedeFicha} onClick={() => setConfirmar("ficha")}><ImagePlus /> Guardar en la ficha</Button>}
        {!foto.enFicha && !puedeFicha && <span className="text-xs text-muted-foreground">Disponible cuando la solicitud tenga ficha de paciente.</span>}
      </div>
      {confirmar === "ficha" && (
        <div role="alertdialog" aria-label="Confirmar guardar en la ficha" className="grid gap-2 rounded-md bg-muted p-3 text-sm">
          <p>La foto «{nombre}» se copiará a las imágenes de la ficha del paciente y quedará visible para quien ve las imágenes del paciente.</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={pendiente} onClick={() => iniciar(async () => {
              const r = await guardarFotoEnFicha(valoracionId, foto.id);
              setConfirmar(null);
              if (r.error) toast.error(r.error); else toast.success("Foto guardada en la ficha");
            })}>{pendiente && <Loader2 className="animate-spin" />} Confirmar y guardar</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmar(null)}>Cancelar</Button>
          </div>
        </div>
      )}
      {confirmar === "pedir" && (
        <div role="alertdialog" aria-label="Confirmar pedir otra toma" className="grid gap-2 rounded-md bg-muted p-3 text-sm">
          <p>Se le pedirá al paciente repetir «{nombre}» y recibirá un acceso nuevo por correo. La valoración pasa a «Requiere más información».</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={pendiente} onClick={() => iniciar(async () => {
              const r = await enviarMensajeProfesional(valoracionId, { texto: `¿Puedes repetir esta toma? ${INFO_ANGULO[foto.angulo as Angulo]?.instruccion ?? ""}`.trim(), solicitaMedia: foto.angulo as Angulo });
              setConfirmar(null);
              if ("error" in r) toast.error(r.error); else alPedir(r.credenciales);
            })}>{pendiente && <Loader2 className="animate-spin" />} Confirmar y pedir</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmar(null)}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Fotos por ángulo (ya ordenadas) con visor modal: zoom (rueda, botones, doble clic, pellizco), arrastre, rotación y teclado. Patrón copiado de components/estudios/visor-imagen.tsx. */
export function GaleriaValoracion({ valoracionId, fotos, puedePedir, puedeFicha }: { valoracionId: string; fotos: FotoVista[]; puedePedir: boolean; puedeFicha: boolean }) {
  const [indice, setIndice] = useState<number | null>(null);
  const [comparar, setComparar] = useState(false);
  const [otroId, setOtroId] = useState("");
  const [creds, setCreds] = useState<Credenciales | null>(null);
  const [t, setT] = useState({ z: 1, x: 0, y: 0, r: 0 });
  const punteros = useRef(new Map<number, { x: number; y: number }>());
  const pinza = useRef<number | null>(null);
  const foto = indice === null ? null : fotos[indice] ?? null;
  const otra = fotos.find((f) => f.id === otroId && f.id !== foto?.id) ?? fotos.find((f) => f.id !== foto?.id) ?? null;
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
              <span className="block truncate px-2 pt-1.5 text-xs font-medium">{etiqueta(f.angulo)}</span>
              <span className="block truncate px-2 pb-1.5 text-xs text-muted-foreground">{[f.nota && "Con comentario", f.enFicha && "En la ficha"].filter(Boolean).join(" · ") || " "}</span>
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={!!foto} onOpenChange={(a) => { if (!a) { setIndice(null); setComparar(false); } }}>
        <DialogContent onOpenAutoFocus={(e) => e.preventDefault()} className="flex h-[92dvh] w-[calc(100vw-1rem)] max-w-5xl flex-col gap-3 sm:max-w-5xl overflow-y-auto">
          <DialogTitle className="pr-8">{foto ? etiqueta(foto.angulo) : ""} <span className="text-xs font-normal text-muted-foreground">{(indice ?? 0) + 1} / {fotos.length}</span></DialogTitle>
          <DialogDescription className="sr-only">Flechas cambian de foto; más y menos hacen zoom; R rota.</DialogDescription>
          {foto && (
            <>
              {comparar && otra ? (
                <div className="grid min-h-[50dvh] flex-1 gap-2 sm:grid-cols-2" data-testid="comparar-fotos">
                  <figure className="flex min-h-[40dvh] flex-col gap-1"><figcaption className="text-xs font-medium">{etiqueta(foto.angulo)}</figcaption><Lienzo key={foto.id} src={url(foto.id, "web")} alt={etiqueta(foto.angulo)} /></figure>
                  <figure className="flex min-h-[40dvh] flex-col gap-1">
                    <figcaption className="flex items-center gap-2 text-xs font-medium">
                      <label htmlFor="comparar-con">Comparar con</label>
                      <select id="comparar-con" value={otra.id} onChange={(e) => setOtroId(e.target.value)} className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs">
                        {fotos.filter((f) => f.id !== foto.id).map((f) => <option key={f.id} value={f.id}>{etiqueta(f.angulo)}</option>)}
                      </select>
                    </figcaption>
                    <Lienzo key={otra.id} src={url(otra.id, "web")} alt={`${etiqueta(otra.angulo)} (comparación)`} />
                  </figure>
                </div>
              ) : (
              <div className="relative min-h-[40dvh] flex-1 overflow-hidden rounded-md bg-black">
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
              )}
              <div className="flex flex-wrap items-center gap-2">
                {!comparar && (<>
                  <Button type="button" size="icon" variant="outline" aria-label="Acercar" onClick={() => zoom(1.25)}><ZoomIn /></Button>
                  <Button type="button" size="icon" variant="outline" aria-label="Alejar" onClick={() => zoom(0.8)}><ZoomOut /></Button>
                  <Button type="button" size="icon" variant="outline" aria-label="Rotar" onClick={() => setT((p) => ({ ...p, r: (p.r + 90) % 360 }))}><RotateCw /></Button>
                  <span className="text-xs text-muted-foreground tabular-nums">{Math.round(t.z * 100)}%</span>
                </>)}
                {fotos.length > 1 && <Button type="button" variant={comparar ? "default" : "outline"} aria-pressed={comparar} onClick={() => setComparar((c) => !c)}><Columns2 /> Comparar</Button>}
                <Button asChild variant="outline" className="ml-auto"><a href={url(foto.id, "original")} download><Download /> Original</a></Button>
              </div>
              <PanelFoto key={foto.id} valoracionId={valoracionId} foto={foto} puedePedir={puedePedir} puedeFicha={puedeFicha} alPedir={(c) => { setCreds(c); setIndice(null); setComparar(false); }} />
            </>
          )}
        </DialogContent>
      </Dialog>
      <CredencialesDialogo credenciales={creds} onCerrar={() => setCreds(null)} />
    </>
  );
}
