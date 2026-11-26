"use client";

import { useState, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type PestanaOrden = { valor: string; etiqueta: string; contenido: ReactNode };

/** Pestañas de la orden sincronizadas con ?tab= (sin recargar el servidor). Radix aporta roles tab y teclado. */
export function PestanasOrden({ pestanas, inicial }: { pestanas: PestanaOrden[]; inicial: string }) {
  const [valor, setValor] = useState(pestanas.some((p) => p.valor === inicial) ? inicial : pestanas[0]!.valor);
  const cambiar = (v: string) => {
    setValor(v);
    const url = new URL(window.location.href);
    if (v === pestanas[0]!.valor) url.searchParams.delete("tab"); else url.searchParams.set("tab", v);
    window.history.replaceState(null, "", url);
  };
  return (
    <Tabs value={valor} onValueChange={cambiar} className="space-y-4">
      <TabsList className="max-w-full justify-start overflow-x-auto" aria-label="Secciones de la orden">
        {pestanas.map((p) => <TabsTrigger key={p.valor} value={p.valor} className="px-3">{p.etiqueta}</TabsTrigger>)}
      </TabsList>
      {pestanas.map((p) => <TabsContent key={p.valor} value={p.valor} className="space-y-6">{p.contenido}</TabsContent>)}
    </Tabs>
  );
}
