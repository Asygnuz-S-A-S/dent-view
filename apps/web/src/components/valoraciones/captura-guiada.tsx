"use client";

import { Camera, CheckCircle2, ImageIcon, Loader2, RotateCw, Trash2, Video } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { avisosDeArchivo, TEXTO_AVISO, type AvisoFoto } from "@/lib/calidad-foto";
import {
  ANGULOS, ANGULOS_CAMARA_FRONTAL, ANGULOS_MULTIPLES, INFO_ANGULO, MAX_FOTOS, MAX_VIDEOS, VIDEO_MAX_BYTES, VIDEO_MAX_SEG, ordenarTomas, type Angulo,
} from "@/lib/valoraciones";
import { comprimirImagen, duracionVideo } from "./comprimir";
import { GuiaCaptura } from "./guia-captura";
import { SiluetaAngulo } from "./silueta-angulo";

export type MedioPaciente = { id: string; angulo: string; tipo: "FOTO" | "VIDEO"; duracionSeg: number | null };
type Subida = { clave: string; angulo: Angulo; nombre: string; progreso: number; error: string | null; archivo: Blob; duracion: number | null; vista: string | null; avisos: AvisoFoto[] };

/** Sube un archivo con XHR para tener progreso por archivo. */
function subir(token: string, archivo: Blob, nombre: string, angulo: Angulo, duracion: number | null, progreso: (p: number) => void) {
  return new Promise<{ id: string }>((resolver, rechazar) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/valoraciones/publico/${encodeURIComponent(token)}/archivos`);
    xhr.upload.onprogress = (e) => e.lengthComputable && progreso(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let cuerpo: { id?: string; error?: string } = {};
      try { cuerpo = JSON.parse(xhr.responseText); } catch { /* respuesta no JSON (p. ej. 413 del proxy) */ }
      if (xhr.status >= 200 && xhr.status < 300 && cuerpo.id) resolver({ id: cuerpo.id });
      else rechazar(new Error(cuerpo.error ?? (xhr.status === 413 ? "El archivo es demasiado grande." : "No se pudo subir. Inténtalo de nuevo.")));
    };
    xhr.onerror = () => rechazar(new Error("Sin conexión. Inténtalo de nuevo."));
    const datos = new FormData();
    datos.append("archivo", archivo, nombre);
    datos.append("angulo", angulo);
    if (duracion !== null) datos.append("duracion", String(duracion));
    xhr.send(datos);
  });
}

/** `angulos`: tomas sugeridas por el odontólogo (las demás quedan tras «Mostrar otras tomas»); `pedidos`: fotos que pidió y siguen pendientes. */
export function CapturaGuiada({ token, medios, onMedios, angulos, pedidos, editable }: {
  token: string; medios: MedioPaciente[]; onMedios: (f: (prev: MedioPaciente[]) => MedioPaciente[]) => void; angulos: Angulo[]; pedidos: string[]; editable: boolean;
}) {
  const [subidas, setSubidas] = useState<Subida[]>([]);
  const [avisos, setAvisos] = useState<Record<string, AvisoFoto[]>>({}); // por id de medio, de las fotos subidas en esta sesión
  const [subidasAhora, setSubidasAhora] = useState<string[]>([]); // ángulos subidos en esta sesión: cumplen lo que se pidió
  const [otras, setOtras] = useState(false);
  const urlMedio = (id: string, v = "thumb") => `/api/valoraciones/publico/${encodeURIComponent(token)}/archivos/${id}?v=${v}`;
  const parcial = (clave: string, c: Partial<Subida>) => setSubidas((s) => s.map((x) => (x.clave === clave ? { ...x, ...c } : x)));

  async function ejecutar(s: Subida) {
    parcial(s.clave, { error: null, progreso: 0 });
    try {
      const r = await subir(token, s.archivo, s.nombre, s.angulo, s.duracion, (p) => parcial(s.clave, { progreso: p }));
      const esVideo = s.angulo === "VIDEO_APERTURA";
      // Repetir un ángulo único reemplaza la foto anterior (el servidor ya la borró).
      onMedios((prev) => [...prev.filter((m) => esVideo || ANGULOS_MULTIPLES.includes(s.angulo) || m.angulo !== s.angulo), { id: r.id, angulo: s.angulo, tipo: esVideo ? "VIDEO" : "FOTO", duracionSeg: s.duracion }]);
      setSubidasAhora((x) => [...x, s.angulo]);
      if (s.avisos.length) setAvisos((x) => ({ ...x, [r.id]: s.avisos }));
      setSubidas((x) => x.filter((y) => y.clave !== s.clave));
    } catch (e) {
      parcial(s.clave, { error: e instanceof Error ? e.message : "No se pudo subir." });
    }
  }

  async function elegir(angulo: Angulo, archivos: FileList | null) {
    for (const f of Array.from(archivos ?? [])) {
      const clave = `${angulo}-${crypto.randomUUID()}`;
      const base = { clave, angulo, nombre: f.name, progreso: 0, error: null, vista: null, avisos: [] as AvisoFoto[] };
      if (angulo === "VIDEO_APERTURA") {
        if (f.size > VIDEO_MAX_BYTES) { setSubidas((s) => [...s, { ...base, archivo: f, duracion: null, error: "El video pesa más de 50 MB. Grábalo más corto." }]); continue; }
        const dur = await duracionVideo(f);
        if (dur !== null && dur > VIDEO_MAX_SEG + 1) { setSubidas((s) => [...s, { ...base, archivo: f, duracion: Math.round(dur), error: `El video dura más de ${VIDEO_MAX_SEG} segundos.` }]); continue; }
        const s: Subida = { ...base, archivo: f, duracion: dur === null ? null : Math.round(dur), vista: URL.createObjectURL(f) };
        setSubidas((x) => [...x, s]);
        void ejecutar(s);
      } else {
        const blob = await comprimirImagen(f);
        // Solo avisa: la foto se sube igual y el paciente decide si la repite.
        const s: Subida = { ...base, nombre: blob === f ? f.name : f.name.replace(/\.\w+$/, "") + ".jpg", archivo: blob, duracion: null, vista: URL.createObjectURL(blob), avisos: await avisosDeArchivo(blob, INFO_ANGULO[angulo].orientacion) };
        setSubidas((x) => [...x, s]);
        void ejecutar(s);
      }
    }
  }

  async function quitar(m: MedioPaciente) {
    const r = await fetch(`/api/valoraciones/publico/${encodeURIComponent(token)}/archivos?id=${m.id}`, { method: "DELETE" });
    if (r.ok) onMedios((prev) => prev.filter((x) => x.id !== m.id));
  }

  const fotos = medios.filter((m) => m.tipo === "FOTO").length;
  const pendientes = pedidos.filter((a) => !subidasAhora.includes(a)) as Angulo[];
  const sugeridas = ordenarTomas([...angulos, ...pendientes]);
  const obligatorias = sugeridas.filter((a) => !INFO_ANGULO[a].opcional);
  const hechas = obligatorias.filter((a) => medios.some((m) => m.angulo === a)).length;
  // Con otras tomas desplegadas (o ya subidas) se ven todas; si no, solo las sugeridas.
  const visibles = ordenarTomas(otras ? ANGULOS : [...sugeridas, ...ANGULOS.filter((a) => medios.some((m) => m.angulo === a))]);
  const hayOtras = ANGULOS.some((a) => !visibles.includes(a));
  return (
    <div className="space-y-4">
      {pendientes.length > 0 && (
        <p role="status" className="rounded-lg border border-primary bg-primary/5 p-3 text-sm font-medium">
          Tu odontólogo te pidió: {pendientes.map((a) => INFO_ANGULO[a].etiqueta).join(", ")}.
        </p>
      )}
      <GuiaCaptura encabezado="h3" />
      <div className="space-y-1.5">
        <p className="text-sm font-medium tabular-nums" aria-live="polite">{hechas} de {obligatorias.length} tomas</p>
        <div role="progressbar" aria-label="Tomas listas" aria-valuenow={hechas} aria-valuemin={0} aria-valuemax={obligatorias.length} className="h-2 overflow-hidden rounded-full bg-border">
          <div className="h-full bg-primary transition-[width]" style={{ width: `${obligatorias.length ? (hechas / obligatorias.length) * 100 : 0}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">{fotos} de {MAX_FOTOS} fotos · {medios.length - fotos} de {MAX_VIDEOS} videos. Las tomas son una sugerencia; lo mínimo son 3 fotos.</p>
      </div>
      <ul className="space-y-3">
        {visibles.map((a) => {
          const propios = medios.filter((m) => m.angulo === a), enCurso = subidas.filter((s) => s.angulo === a);
          const esVideo = a === "VIDEO_APERTURA", multiple = ANGULOS_MULTIPLES.includes(a), selfie = ANGULOS_CAMARA_FRONTAL.includes(a);
          const pedida = pendientes.includes(a);
          const info = INFO_ANGULO[a];
          return (
            <li key={a} data-angulo={a} className={`rounded-xl border bg-card p-3 ${pedida ? "border-primary ring-1 ring-primary" : ""}`}>
              <div className="flex gap-3">
                <SiluetaAngulo angulo={a} className="size-16 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="flex items-center gap-1.5 text-sm font-medium">{info.etiqueta}{info.opcional && <span className="text-xs font-normal text-muted-foreground">(opcional)</span>}{propios.length > 0 && <CheckCircle2 className="size-4 text-success-ink" aria-label="Listo" />}</p>
                  {pedida && <p className="text-xs font-medium text-primary">El odontólogo te pidió esta foto.</p>}
                  <p className="text-xs text-pretty text-muted-foreground">{info.instruccion}</p>
                  <p className="text-xs text-muted-foreground">{esVideo ? "Celular en vertical." : `Celular en ${info.orientacion === "vertical" ? "vertical" : "horizontal"}.`}</p>
                </div>
              </div>
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer rounded text-muted-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">Ver consejos</summary>
                <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                  <div><p className="font-medium">Así sí</p><ul className="list-disc space-y-0.5 pl-4">{info.bien.map((t) => <li key={t}>{t}</li>)}</ul></div>
                  <div><p className="font-medium">Evita</p><ul className="list-disc space-y-0.5 pl-4">{info.evita.map((t) => <li key={t}>{t}</li>)}</ul></div>
                </div>
              </details>
              {editable && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <label className="inline-flex">
                    <input type="file" className="sr-only" aria-label={`${esVideo ? "Grabar video" : "Tomar foto"}: ${info.etiqueta}`}
                      accept={esVideo ? "video/*" : "image/*"} capture={esVideo ? "user" : selfie ? "user" : "environment"} multiple={false}
                      onChange={(e) => { void elegir(a, e.target.files); e.target.value = ""; }} />
                    <span className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground [input:focus-visible+&]:ring-3 [input:focus-visible+&]:ring-ring/50">{esVideo ? <Video className="size-4" /> : <Camera className="size-4" />}{esVideo ? "Grabar video" : "Tomar foto"}</span>
                  </label>
                  <label className="inline-flex">
                    <input type="file" className="sr-only" aria-label={`Elegir de la galería: ${info.etiqueta}`} accept={esVideo ? "video/mp4,video/quicktime,video/webm" : "image/*"} multiple={multiple}
                      onChange={(e) => { void elegir(a, e.target.files); e.target.value = ""; }} />
                    <span className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border bg-background px-4 text-sm font-medium [input:focus-visible+&]:ring-3 [input:focus-visible+&]:ring-ring/50"><ImageIcon className="size-4" />Galería</span>
                  </label>
                </div>
              )}
              {(propios.length > 0 || enCurso.length > 0) && (
                <ul className="mt-3 space-y-2">
                  {propios.map((m) => (
                    <li key={m.id} className="space-y-1.5 rounded-lg bg-muted/50 p-2">
                      <div className="flex items-center gap-3">
                        {m.tipo === "FOTO"
                          // eslint-disable-next-line @next/next/no-img-element -- ruta autenticada con la cookie del enlace
                          ? <img src={urlMedio(m.id)} alt={`Vista previa: ${info.etiqueta}`} className="size-14 rounded-md object-cover" />
                          : <video src={urlMedio(m.id, "web")} controls preload="metadata" playsInline className="h-14 w-24 rounded-md bg-black" aria-label="Vista previa del video" />}
                        <span className="flex-1 text-xs text-muted-foreground">{m.tipo === "VIDEO" && m.duracionSeg ? `Video de ${m.duracionSeg} s subido` : "Subida"}</span>
                        {editable && <Button type="button" size="icon" variant="ghost" aria-label={`Quitar ${info.etiqueta}`} onClick={() => void quitar(m)}><Trash2 /></Button>}
                      </div>
                      {avisos[m.id] && (
                        <div className="flex flex-wrap items-center gap-2 text-xs text-warning-ink" role="status">
                          <span className="min-w-0 flex-1">{avisos[m.id]!.map((x) => TEXTO_AVISO[x]).join(" ")}</span>
                          {editable && (
                            <label className="inline-flex">
                              <input type="file" className="sr-only" aria-label={`Repetir foto: ${info.etiqueta}`} accept="image/*" capture={selfie ? "user" : "environment"} multiple={false}
                                onChange={(e) => { void elegir(a, e.target.files); e.target.value = ""; }} />
                              <span className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border bg-background px-3 text-xs font-medium text-foreground [input:focus-visible+&]:ring-3 [input:focus-visible+&]:ring-ring/50"><RotateCw className="size-3.5" />Repetir foto</span>
                            </label>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                  {enCurso.map((s) => (
                    <li key={s.clave} className="space-y-1 rounded-lg bg-muted/50 p-2">
                      <div className="flex items-center gap-3">
                        {s.vista && (a === "VIDEO_APERTURA"
                          ? <video src={s.vista} muted playsInline className="h-14 w-24 rounded-md bg-black" />
                          // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob)
                          : <img src={s.vista} alt="" className="size-14 rounded-md object-cover" />)}
                        <span className="min-w-0 flex-1 truncate text-xs">{s.nombre}</span>
                        {s.error ? (
                          s.archivo.size <= VIDEO_MAX_BYTES && !s.error.startsWith("El video") && <Button type="button" size="sm" variant="outline" onClick={() => void ejecutar(s)}><RotateCw /> Reintentar</Button>
                        ) : <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />}
                        <Button type="button" size="icon" variant="ghost" aria-label="Descartar" onClick={() => setSubidas((x) => x.filter((y) => y.clave !== s.clave))}><Trash2 /></Button>
                      </div>
                      {s.error
                        ? <p role="alert" className="text-xs text-destructive">{s.error}</p>
                        : <div role="progressbar" aria-valuenow={s.progreso} aria-valuemin={0} aria-valuemax={100} aria-label={`Subiendo ${s.nombre}`} className="h-1.5 overflow-hidden rounded-full bg-border"><div className="h-full bg-primary transition-[width]" style={{ width: `${s.progreso}%` }} /></div>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {editable && hayOtras && <Button type="button" variant="outline" className="w-full" onClick={() => setOtras(true)}>Mostrar otras tomas</Button>}
    </div>
  );
}
