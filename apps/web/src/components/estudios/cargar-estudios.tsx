"use client";

import { Camera, CircleAlert, CircleCheck, FileText, FileUp, Loader2, RotateCcw, ScanLine, Search, UploadCloud, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { buscarPacientesCarga, ordenesDeCarga, type OrdenOpcion, type PacienteOpcion } from "@/app/(app)/cargar/actions";
import { EstadoVacio } from "@/components/comunes/estado-vacio";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BYTES_FIRMA, CATEGORIAS, ETIQUETA_CATEGORIA, MAX_ARCHIVOS_IMAGEN, sugerirCategoria, tipoDeArchivo, validarCarga, type Categoria, type Destino } from "@/lib/estudios-carga";

type Estado = "lista" | "cola" | "subiendo" | "ok" | "error" | "cancelada";
type Item = { uid: number; file: File; cabeza: Uint8Array; categoria: Categoria; destino: Destino | null; estado: Estado; progreso: number; error: string | null; comprimible: boolean };

const PARALELO = 3;
const UMBRAL_REDUCIR = 8 * 1024 * 1024;
const SELECT = "h-9 rounded-md border border-input bg-background px-2 text-sm";
const mb = (n: number) => (n < 1024 ** 2 ? `${Math.max(1, Math.round(n / 1024))} KB` : n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : `${(n / 1024 ** 2).toFixed(n < 10 * 1024 ** 2 ? 1 : 0)} MB`);
let contador = 0;

/** Reduce una foto grande a 2400 px JPEG (la original no se toca); si no mejora o el navegador no la decodifica, devuelve la misma. */
async function reducirFoto(file: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.85));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch { return file; }
}

function enviar(it: Item, archivo: File, pacienteId: string, ordenId: string, progreso: (p: number) => void): { promesa: Promise<void>; abortar: () => void } {
  const xhr = new XMLHttpRequest();
  const promesa = new Promise<void>((ok, fallo) => {
    const dicom = it.destino === "dicom";
    xhr.open("POST", dicom ? `/api/estudios/cargar?pacienteId=${encodeURIComponent(pacienteId)}${ordenId ? `&ordenId=${encodeURIComponent(ordenId)}` : ""}` : "/api/imagenes");
    xhr.upload.onprogress = (e) => e.lengthComputable && progreso(Math.round((e.loaded / e.total) * 100));
    xhr.onerror = () => fallo(new Error("Sin conexión con el servidor"));
    xhr.onabort = () => fallo(new DOMException("cancelada", "AbortError"));
    xhr.onload = () => {
      let j: { error?: string; errores?: { error: string }[] } | null = null;
      try { j = JSON.parse(xhr.responseText); } catch { /* respuesta sin cuerpo */ }
      if (xhr.status >= 200 && xhr.status < 300) return ok();
      fallo(new Error(j?.errores?.[0]?.error ?? j?.error ?? (xhr.status === 413 ? "El archivo es demasiado grande" : xhr.status === 429 ? "Demasiadas subidas, espera unos minutos" : "No se pudo subir")));
    };
    if (dicom) {
      xhr.setRequestHeader("Content-Type", it.cabeza.length >= 4 && it.cabeza[0] === 0x50 ? "application/zip" : "application/dicom");
      xhr.send(archivo);
    } else {
      const f = new FormData();
      f.set("pacienteId", pacienteId); f.set("categoria", it.categoria);
      if (ordenId) f.set("ordenId", ordenId);
      f.append("archivos", archivo);
      xhr.send(f);
    }
  });
  return { promesa, abortar: () => xhr.abort() };
}

export function CargarEstudios({ inicial, ordenesIniciales, ordenInicial }: { inicial: PacienteOpcion | null; ordenesIniciales: OrdenOpcion[]; ordenInicial: string }) {
  const [paciente, setPaciente] = useState<PacienteOpcion | null>(inicial);
  const [ordenes, setOrdenes] = useState(ordenesIniciales);
  const [ordenId, setOrdenId] = useState(ordenInicial);
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<PacienteOpcion[] | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [reducir, setReducir] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [anuncio, setAnuncio] = useState("");
  const entrada = useRef<HTMLInputElement>(null);
  const camara = useRef<HTMLInputElement>(null);
  const activos = useRef(new Map<number, () => void>());
  const lanzados = useRef(new Set<number>());

  useEffect(() => {
    if (texto.trim().length < 2) return;
    const t = setTimeout(() => buscarPacientesCarga(texto).then(setResultados, () => setResultados([])), 250);
    return () => clearTimeout(t);
  }, [texto]);

  const cambiar = (uid: number, p: Partial<Item>) => setItems((l) => l.map((i) => (i.uid === uid ? { ...i, ...p } : i)));

  async function elegirPaciente(p: PacienteOpcion) {
    setPaciente(p); setTexto(""); setResultados(null); setOrdenId("");
    setOrdenes(await ordenesDeCarga(p.id).catch(() => []));
  }

  async function agregar(archivos: File[]) {
    const nuevos: Item[] = [];
    for (const file of archivos) {
      const cabeza = new Uint8Array(await file.slice(0, BYTES_FIRMA).arrayBuffer());
      const categoria = sugerirCategoria(file.name, tipoDeArchivo(cabeza));
      nuevos.push({ uid: ++contador, file, cabeza, categoria, ...validar(categoria, cabeza, file.size), estado: "lista", progreso: 0, comprimible: file.size > UMBRAL_REDUCIR && /^image\/(jpeg|png|webp)$/.test(file.type) });
    }
    setItems((l) => [...l, ...nuevos]);
    setAnuncio(`${nuevos.length} archivo${nuevos.length === 1 ? "" : "s"} agregado${nuevos.length === 1 ? "" : "s"}`);
  }
  const validar = (c: Categoria, cabeza: Uint8Array, bytes: number) => {
    const v = validarCarga(c, cabeza, bytes);
    return v.ok ? { destino: v.destino, error: null } : { destino: null, error: v.error };
  };

  // Planificador: mantiene hasta PARALELO subidas simultáneas.
  useEffect(() => {
    if (!paciente) return;
    const enCurso = items.filter((i) => i.estado === "subiendo").length;
    const siguientes = items.filter((i) => i.estado === "cola").slice(0, PARALELO - enCurso);
    for (const it of siguientes) {
      if (lanzados.current.has(it.uid)) continue;
      lanzados.current.add(it.uid);
      cambiar(it.uid, { estado: "subiendo", progreso: 0 });
      void (async () => {
        const archivo = reducir && it.comprimible && it.categoria !== "documento" ? await reducirFoto(it.file) : it.file;
        const { promesa, abortar } = enviar(it, archivo, paciente.id, ordenId, (progreso) => cambiar(it.uid, { progreso }));
        activos.current.set(it.uid, abortar);
        try {
          await promesa;
          cambiar(it.uid, { estado: "ok", progreso: 100 });
          setAnuncio(`${it.file.name}: subido`);
        } catch (e) {
          const cancelada = e instanceof DOMException;
          cambiar(it.uid, { estado: cancelada ? "cancelada" : "error", error: cancelada ? null : (e as Error).message });
          setAnuncio(`${it.file.name}: ${cancelada ? "cancelado" : "no se pudo subir"}`);
        } finally {
          activos.current.delete(it.uid);
          lanzados.current.delete(it.uid);
        }
      })();
    }
  }, [items, paciente, ordenId, reducir]);

  const pendientes = items.filter((i) => i.estado === "lista" && i.destino);
  const imagenes = items.filter((i) => i.destino && i.destino !== "dicom" && i.estado !== "ok").length;
  const ocupado = items.some((i) => i.estado === "cola" || i.estado === "subiendo");
  const subidos = items.filter((i) => i.estado === "ok").length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>1. Paciente y orden</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {paciente ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm"><span className="font-medium capitalize">{paciente.nombre.toLowerCase()}</span> <span className="tabular-nums text-muted-foreground">{paciente.documento}</span></p>
              <Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={() => { setPaciente(null); setOrdenes([]); setOrdenId(""); }}>Cambiar paciente</Button>
            </div>
          ) : (
            <div className="space-y-2">
              <label htmlFor="buscar-paciente" className="text-sm font-medium">Buscar paciente (nombre o documento)</label>
              <div className="relative max-w-md">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
                <Input id="buscar-paciente" className="pl-8" autoComplete="off" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej. Gomez o 1020304050" />
              </div>
              {texto.trim().length >= 2 && resultados && (resultados.length === 0
                ? <p className="text-sm text-muted-foreground">Sin resultados para «{texto}».</p>
                : <ul className="max-w-md divide-y rounded-md border" aria-label="Pacientes encontrados">
                    {resultados.map((r) => (
                      <li key={r.id}><button type="button" onClick={() => void elegirPaciente(r)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
                        <span className="capitalize">{r.nombre.toLowerCase()}</span><span className="tabular-nums text-muted-foreground">{r.documento}</span>
                      </button></li>
                    ))}
                  </ul>)}
            </div>
          )}
          {paciente && (
            <div className="space-y-1">
              <label htmlFor="orden-carga" className="text-sm font-medium">Orden (opcional)</label>
              <div><select id="orden-carga" className={SELECT} value={ordenId} disabled={ocupado} onChange={(e) => setOrdenId(e.target.value)}>
                <option value="">Sin orden</option>{ordenes.map((o) => <option key={o.id} value={o.id}>{o.etiqueta}</option>)}
              </select></div>
              {ordenes.length === 0 && <p className="text-xs text-muted-foreground">Este paciente no tiene órdenes solicitadas, agendadas o tomadas.</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>2. Archivos</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {!paciente ? <EstadoVacio icono={ScanLine} titulo="Elige primero un paciente" descripcion="Después podrás arrastrar fotografías, radiografías, estudios DICOM y órdenes médicas." className="py-6" /> : (<>
            <div
              role="button" tabIndex={0} aria-label="Zona para soltar archivos. Pulsa Enter para elegir archivos del equipo"
              onClick={() => entrada.current?.click()}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), entrada.current?.click())}
              onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }} onDragLeave={() => setArrastrando(false)}
              onDrop={(e) => { e.preventDefault(); setArrastrando(false); void agregar([...e.dataTransfer.files]); }}
              className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition focus-visible:ring-2 focus-visible:ring-ring ${arrastrando ? "border-primary bg-primary/5" : "border-input hover:bg-muted/50"}`}
            >
              <UploadCloud className="size-8 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium">Arrastra archivos aquí o pulsa para elegirlos</p>
              <p className="max-w-lg text-xs text-muted-foreground">Imágenes JPG, PNG, WebP o HEIC (25 MB c/u, hasta 20 por subida), PDF (20 MB) y DICOM (.dcm) o ZIP de DICOM (hasta 1 GB).</p>
            </div>
            <input ref={entrada} type="file" multiple className="sr-only" tabIndex={-1} aria-label="Elegir archivos" data-testid="cargar-archivos" accept="image/*,.heic,.heif,.pdf,.dcm,.zip,application/pdf,application/dicom,application/zip"
              onChange={(e) => { void agregar([...(e.target.files ?? [])]); e.target.value = ""; }} />
            <input ref={camara} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-label="Tomar fotografía" onChange={(e) => { void agregar([...(e.target.files ?? [])]); e.target.value = ""; }} />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" size="sm" onClick={() => camara.current?.click()}><Camera /> Tomar fotografía</Button>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reducir} onChange={(e) => setReducir(e.target.checked)} className="size-4" /> Reducir fotos de más de 8 MB antes de subir</label>
            </div>

            <p role="status" aria-live="polite" className="sr-only">{anuncio}</p>
            {items.length === 0 ? <p className="text-sm text-muted-foreground">Aún no has agregado archivos.</p> : (
              <ul className="divide-y rounded-lg border" aria-label="Archivos por subir">
                {items.map((it) => (
                  <li key={it.uid} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 text-sm">
                    <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-[1_1_12rem]">
                      <p className="truncate font-medium">{it.file.name}</p>
                      <p className="text-xs text-muted-foreground">{mb(it.file.size)}</p>
                      {it.error && it.estado !== "ok" && <p role="alert" className="flex items-center gap-1 text-xs text-destructive"><CircleAlert className="size-3.5" aria-hidden />{it.error}</p>}
                      {(it.estado === "cola" || it.estado === "subiendo") && <progress className="mt-1 h-1.5 w-full" max={100} value={it.progreso} aria-label={`Progreso de ${it.file.name}`} />}
                    </div>
                    <select aria-label={`Tipo de ${it.file.name}`} className={SELECT} value={it.categoria} disabled={it.estado !== "lista" && it.estado !== "error"}
                      onChange={(e) => { const c = e.target.value as Categoria; cambiar(it.uid, { categoria: c, ...validar(c, it.cabeza, it.file.size) }); }}>
                      {CATEGORIAS.map((c) => <option key={c} value={c}>{ETIQUETA_CATEGORIA[c]}</option>)}
                    </select>
                    <span className="flex w-24 items-center justify-end gap-2">
                      {it.estado === "ok" && <span className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400"><CircleCheck className="size-4" aria-hidden />Subido</span>}
                      {it.estado === "subiendo" && <Loader2 className="size-4 animate-spin" aria-hidden />}
                      {it.estado === "cancelada" && <span className="text-xs text-muted-foreground">Cancelado</span>}
                      {(it.estado === "error" || it.estado === "cancelada") && it.destino && <Button type="button" size="icon-sm" variant="ghost" aria-label={`Reintentar ${it.file.name}`} onClick={() => cambiar(it.uid, { estado: "cola", error: null })}><RotateCcw /></Button>}
                      {(it.estado === "cola" || it.estado === "subiendo") && <Button type="button" size="icon-sm" variant="ghost" aria-label={`Cancelar ${it.file.name}`} onClick={() => (activos.current.get(it.uid)?.(), cambiar(it.uid, { estado: it.estado === "cola" ? "cancelada" : it.estado }))}><X /></Button>}
                      {(it.estado === "lista" || it.estado === "error" || it.estado === "cancelada" || it.estado === "ok") && <Button type="button" size="icon-sm" variant="ghost" aria-label={`Quitar ${it.file.name}`} onClick={() => setItems((l) => l.filter((x) => x.uid !== it.uid))}><X /></Button>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {imagenes > MAX_ARCHIVOS_IMAGEN && <p role="alert" className="text-sm text-destructive">Máximo {MAX_ARCHIVOS_IMAGEN} imágenes o documentos por subida: quita algunos.</p>}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" disabled={pendientes.length === 0 || imagenes > MAX_ARCHIVOS_IMAGEN} onClick={() => setItems((l) => l.map((i) => (i.estado === "lista" && i.destino ? { ...i, estado: "cola" } : i)))}>
                <FileUp /> {ocupado ? "Subiendo…" : `Subir ${pendientes.length || ""} archivo${pendientes.length === 1 ? "" : "s"}`.replace("  ", " ")}
              </Button>
              {subidos > 0 && <Button asChild variant="outline"><Link href={`/pacientes/${paciente.id}`}>Ver ficha del paciente</Link></Button>}
            </div>
          </>)}
        </CardContent>
      </Card>
    </div>
  );
}
