"use client";

import { Camera, CheckCircle2, ImageIcon, Loader2, RotateCw, Trash2, Video } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ANGULOS, ANGULOS_CAMARA_FRONTAL, ANGULOS_MULTIPLES, INFO_ANGULO, MAX_FOTOS, MAX_VIDEOS, VIDEO_MAX_BYTES, VIDEO_MAX_SEG, type Angulo,
} from "@/lib/valoraciones";
import { comprimirImagen, duracionVideo } from "./comprimir";
import { SiluetaAngulo } from "./silueta-angulo";

export type MedioPaciente = { id: string; angulo: string; tipo: "FOTO" | "VIDEO"; duracionSeg: number | null };
type Subida = { clave: string; angulo: Angulo; nombre: string; progreso: number; error: string | null; archivo: Blob; duracion: number | null; vista: string | null };

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

export function CapturaGuiada({ token, medios, onMedios, pedidos, editable }: { token: string; medios: MedioPaciente[]; onMedios: (f: (prev: MedioPaciente[]) => MedioPaciente[]) => void; pedidos: string[]; editable: boolean }) {
  const [subidas, setSubidas] = useState<Subida[]>([]);
  const urlMedio = (id: string, v = "thumb") => `/api/valoraciones/publico/${encodeURIComponent(token)}/archivos/${id}?v=${v}`;
  const parcial = (clave: string, c: Partial<Subida>) => setSubidas((s) => s.map((x) => (x.clave === clave ? { ...x, ...c } : x)));

  async function ejecutar(s: Subida) {
    parcial(s.clave, { error: null, progreso: 0 });
    try {
      const r = await subir(token, s.archivo, s.nombre, s.angulo, s.duracion, (p) => parcial(s.clave, { progreso: p }));
      const esVideo = s.angulo === "VIDEO_APERTURA";
      // Repetir un ángulo único reemplaza la foto anterior (el servidor ya la borró).
      onMedios((prev) => [...prev.filter((m) => esVideo || ANGULOS_MULTIPLES.includes(s.angulo) || m.angulo !== s.angulo), { id: r.id, angulo: s.angulo, tipo: esVideo ? "VIDEO" : "FOTO", duracionSeg: s.duracion }]);
      setSubidas((x) => x.filter((y) => y.clave !== s.clave));
    } catch (e) {
      parcial(s.clave, { error: e instanceof Error ? e.message : "No se pudo subir." });
    }
  }

  async function elegir(angulo: Angulo, archivos: FileList | null) {
    for (const f of Array.from(archivos ?? [])) {
      const clave = `${angulo}-${crypto.randomUUID()}`;
      const base = { clave, angulo, nombre: f.name, progreso: 0, error: null, vista: null };
      if (angulo === "VIDEO_APERTURA") {
        if (f.size > VIDEO_MAX_BYTES) { setSubidas((s) => [...s, { ...base, archivo: f, duracion: null, error: "El video pesa más de 50 MB. Grábalo más corto." }]); continue; }
        const dur = await duracionVideo(f);
        if (dur !== null && dur > VIDEO_MAX_SEG + 1) { setSubidas((s) => [...s, { ...base, archivo: f, duracion: Math.round(dur), error: `El video dura más de ${VIDEO_MAX_SEG} segundos.` }]); continue; }
        const s: Subida = { ...base, archivo: f, duracion: dur === null ? null : Math.round(dur), vista: URL.createObjectURL(f) };
        setSubidas((x) => [...x, s]);
        void ejecutar(s);
      } else {
        const blob = await comprimirImagen(f);
        const s: Subida = { ...base, nombre: blob === f ? f.name : f.name.replace(/\.\w+$/, "") + ".jpg", archivo: blob, duracion: null, vista: URL.createObjectURL(blob) };
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
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground" aria-live="polite">{fotos} de {MAX_FOTOS} fotos · {medios.length - fotos} de {MAX_VIDEOS} videos</p>
      <ul className="space-y-3">
        {ANGULOS.map((a) => {
          const propios = medios.filter((m) => m.angulo === a), enCurso = subidas.filter((s) => s.angulo === a);
          const esVideo = a === "VIDEO_APERTURA", multiple = ANGULOS_MULTIPLES.includes(a), selfie = ANGULOS_CAMARA_FRONTAL.includes(a);
          const pedida = pedidos.includes(a) && propios.length === 0;
          return (
            <li key={a} data-angulo={a} className={`rounded-xl border bg-card p-3 ${pedida ? "border-primary ring-1 ring-primary" : ""}`}>
              <div className="flex gap-3">
                <SiluetaAngulo angulo={a} className="size-16 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="flex items-center gap-1.5 text-sm font-medium">{INFO_ANGULO[a].etiqueta}{propios.length > 0 && <CheckCircle2 className="size-4 text-success-ink" aria-label="Listo" />}</p>
                  {pedida && <p className="text-xs font-medium text-primary">El odontólogo te pidió esta foto.</p>}
                  <p className="text-xs text-pretty text-muted-foreground">{INFO_ANGULO[a].instruccion}</p>
                </div>
              </div>
              {editable && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <label className="inline-flex">
                    <input type="file" className="sr-only" aria-label={`${esVideo ? "Grabar video" : "Tomar foto"}: ${INFO_ANGULO[a].etiqueta}`}
                      accept={esVideo ? "video/*" : "image/*"} capture={esVideo ? "user" : selfie ? "user" : "environment"} multiple={false}
                      onChange={(e) => { void elegir(a, e.target.files); e.target.value = ""; }} />
                    <span className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground [input:focus-visible+&]:ring-3 [input:focus-visible+&]:ring-ring/50">{esVideo ? <Video className="size-4" /> : <Camera className="size-4" />}{esVideo ? "Grabar video" : "Tomar foto"}</span>
                  </label>
                  <label className="inline-flex">
                    <input type="file" className="sr-only" aria-label={`Elegir de la galería: ${INFO_ANGULO[a].etiqueta}`} accept={esVideo ? "video/mp4,video/quicktime,video/webm" : "image/*"} multiple={multiple}
                      onChange={(e) => { void elegir(a, e.target.files); e.target.value = ""; }} />
                    <span className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border bg-background px-4 text-sm font-medium [input:focus-visible+&]:ring-3 [input:focus-visible+&]:ring-ring/50"><ImageIcon className="size-4" />Galería</span>
                  </label>
                </div>
              )}
              {(propios.length > 0 || enCurso.length > 0) && (
                <ul className="mt-3 space-y-2">
                  {propios.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 rounded-lg bg-muted/50 p-2">
                      {m.tipo === "FOTO"
                        // eslint-disable-next-line @next/next/no-img-element -- ruta autenticada con la cookie del enlace
                        ? <img src={urlMedio(m.id)} alt={`Vista previa: ${INFO_ANGULO[a].etiqueta}`} className="size-14 rounded-md object-cover" />
                        : <video src={urlMedio(m.id, "web")} controls preload="metadata" playsInline className="h-14 w-24 rounded-md bg-black" aria-label="Vista previa del video" />}
                      <span className="flex-1 text-xs text-muted-foreground">{m.tipo === "VIDEO" && m.duracionSeg ? `Video de ${m.duracionSeg} s subido` : "Subida"}</span>
                      {editable && <Button type="button" size="icon" variant="ghost" aria-label={`Quitar ${INFO_ANGULO[a].etiqueta}`} onClick={() => void quitar(m)}><Trash2 /></Button>}
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
    </div>
  );
}
