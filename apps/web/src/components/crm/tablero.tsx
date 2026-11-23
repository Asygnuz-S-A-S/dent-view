"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { moverEtapa } from "@/app/(app)/crm/actions";
import { Badge } from "@/components/ui/badge";
import { ETAPAS, ETIQUETA_ETAPA, etiquetaOrigen, type Etapa } from "@/lib/crm";
import { fechaCorta } from "@/lib/fechas";
import { cop } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { SelectNativo, useAccion } from "./comun";

export type TarjetaLead = {
  id: string; nombre: string; etapa: Etapa; origen: string; interes: string | null; valorEstimado: number | null;
  proximoContacto: string | null; noContactar: boolean; responsable: string | null;
};

/** Tablero por etapa. Arrastrar y soltar (HTML5) o el selector «Mover a» de cada tarjeta (teclado y móvil). «Perdido» pide motivo: se marca en la ficha. */
export function Tablero({ leads, puedeMover }: { leads: TarjetaLead[]; puedeMover: boolean }) {
  const router = useRouter();
  const { pendiente, ejecutar } = useAccion();
  const [sobre, setSobre] = useState<Etapa | null>(null);
  const mover = (id: string, etapa: Etapa) => ejecutar(() => moverEtapa(id, etapa), `Movido a «${ETIQUETA_ETAPA[etapa]}»`);
  return (
    <div className="flex gap-3 overflow-x-auto pb-2" aria-busy={pendiente}>
      {ETAPAS.map((etapa) => {
        const items = leads.filter((l) => l.etapa === etapa);
        const valor = items.reduce((s, l) => s + (l.valorEstimado ?? 0), 0);
        return (
          <section
            key={etapa} aria-label={`Etapa ${ETIQUETA_ETAPA[etapa]}`}
            onDragOver={(e) => { if (puedeMover && etapa !== "PERDIDO") { e.preventDefault(); setSobre(etapa); } }}
            onDragLeave={() => setSobre((s) => (s === etapa ? null : s))}
            onDrop={(e) => { e.preventDefault(); setSobre(null); const id = e.dataTransfer.getData("text/lead"); if (id && etapa !== "PERDIDO") mover(id, etapa); }}
            className={cn("flex w-64 shrink-0 flex-col rounded-lg border bg-muted/40 p-2 transition-colors", sobre === etapa && "border-primary bg-primary/5")}
          >
            <header className="flex items-baseline justify-between gap-2 px-1 pb-2">
              <h3 className="text-sm font-semibold">{ETIQUETA_ETAPA[etapa]} <span className="font-normal text-muted-foreground tabular-nums">{items.length}</span></h3>
              {valor > 0 && <span className="text-xs text-muted-foreground tabular-nums">{cop(valor)}</span>}
            </header>
            <ul className="flex flex-1 flex-col gap-2">
              {items.length === 0 && <li className="px-1 py-3 text-xs text-muted-foreground">Sin leads</li>}
              {items.map((l) => (
                <li
                  key={l.id} draggable={puedeMover} onDragStart={(e) => e.dataTransfer.setData("text/lead", l.id)}
                  className={cn("space-y-2 rounded-md border bg-card p-3 text-sm shadow-xs", puedeMover && "cursor-grab active:cursor-grabbing")}
                >
                  <Link href={`/crm/leads/${l.id}`} className="block font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">{l.nombre}</Link>
                  <p className="text-xs text-muted-foreground">{[l.interes, etiquetaOrigen(l.origen)].filter(Boolean).join(" · ")}</p>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {l.valorEstimado ? <span className="tabular-nums">{cop(l.valorEstimado)}</span> : null}
                    {l.proximoContacto && <span>Próx. {fechaCorta(new Date(l.proximoContacto))}</span>}
                    {l.noContactar && <Badge variant="danger">No contactar</Badge>}
                  </div>
                  {l.responsable && <p className="truncate text-xs text-muted-foreground">{l.responsable}</p>}
                  {puedeMover && (
                    <SelectNativo aria-label={`Mover a: ${l.nombre}`} value={l.etapa} disabled={pendiente} className="h-7 text-xs" onChange={(e) => (e.target.value === "PERDIDO" ? router.push(`/crm/leads/${l.id}#perdido`) : mover(l.id, e.target.value as Etapa))}>
                      {ETAPAS.map((x) => <option key={x} value={x}>{x === l.etapa ? `En: ${ETIQUETA_ETAPA[x]}` : `Mover a ${ETIQUETA_ETAPA[x]}${x === "PERDIDO" ? " (con motivo)" : ""}`}</option>)}
                    </SelectNativo>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
