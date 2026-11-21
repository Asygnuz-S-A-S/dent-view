"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_CAPTURAS, MAX_LEYENDA, moverCaptura } from "@/lib/imagenes";

export type CapturaUI = { origen: "IMAGEN" | "DICOM"; imagenId?: string; estudioId?: string; estudioUid?: string; serieUid?: string | null; leyenda: string; etiqueta: string };
const clave = (c: CapturaUI) => (c.origen === "IMAGEN" ? `i:${c.imagenId}` : `d:${c.estudioUid}:${c.serieUid ?? ""}`);
const vista = (c: CapturaUI) => (c.origen === "IMAGEN" ? `/api/imagenes/${c.imagenId}?v=thumb` : `/api/estudios/${c.estudioId}/captura${c.serieUid ? `?serie=${encodeURIComponent(c.serieUid)}` : ""}`);

/** Elige, ordena y rotula las capturas que van en el PDF: imágenes subidas y cortes de estudios DICOM. */
export function SelectorCapturas({ disponibles, value, onChange }: { disponibles: CapturaUI[]; value: CapturaUI[]; onChange: (v: CapturaUI[]) => void }) {
  const usadas = new Set(value.map(clave));
  const lleno = value.length >= MAX_CAPTURAS;
  const cambiar = (i: number, p: Partial<CapturaUI>) => onChange(value.map((c, j) => (j === i ? { ...c, ...p } : c)));
  return (
    <div className="grid gap-4 lg:col-span-2" data-testid="selector-capturas">
      <div>
        <h3 className="text-sm font-medium">Capturas para el PDF ({value.length}/{MAX_CAPTURAS})</h3>
        <p className="text-xs text-muted-foreground">Se imprimen en una grilla de dos columnas, en el orden de abajo, con su leyenda.</p>
      </div>
      {disponibles.length === 0 ? (
        <p className="text-sm text-muted-foreground">Este paciente no tiene imágenes subidas ni series DICOM para elegir. Sube imágenes desde la pestaña Estudios de su ficha.</p>
      ) : (
        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Capturas disponibles">
          {disponibles.map((c) => (
            <li key={clave(c)} className="w-28 shrink-0 space-y-1">
              {/* eslint-disable-next-line @next/next/no-img-element -- ruta autenticada */}
              <img src={vista(c)} alt={c.etiqueta} loading="lazy" className="aspect-square w-full rounded-md border bg-black object-cover" />
              <p className="truncate text-xs" title={c.etiqueta}>{c.etiqueta}</p>
              <Button type="button" size="xs" variant="outline" className="w-full" disabled={usadas.has(clave(c)) || lleno} onClick={() => onChange([...value, { ...c, leyenda: c.leyenda || "" }])}>
                <Plus /> {usadas.has(clave(c)) ? "Agregada" : "Agregar"}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {value.length > 0 && (
        <ol className="grid gap-3 sm:grid-cols-2" aria-label="Capturas en el informe">
          {value.map((c, i) => (
            <li key={clave(c)} className="flex gap-3 rounded-lg border p-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- ruta autenticada */}
              <img src={vista(c)} alt={c.etiqueta} className="size-20 shrink-0 rounded-md bg-black object-cover" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate text-xs text-muted-foreground">{i + 1}. {c.etiqueta}</p>
                <Input aria-label={`Leyenda de la captura ${i + 1}`} value={c.leyenda} maxLength={MAX_LEYENDA} placeholder="Leyenda (opcional)" onChange={(e) => cambiar(i, { leyenda: e.target.value })} />
                <div className="flex gap-1">
                  <Button type="button" size="icon-sm" variant="ghost" aria-label="Subir" disabled={i === 0} onClick={() => onChange(moverCaptura(value, i, -1))}><ArrowUp /></Button>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label="Bajar" disabled={i === value.length - 1} onClick={() => onChange(moverCaptura(value, i, 1))}><ArrowDown /></Button>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label="Quitar" onClick={() => onChange(value.filter((_, j) => j !== i))}><X /></Button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
