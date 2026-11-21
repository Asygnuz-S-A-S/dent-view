"use client";

import { X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type FiltroUrl =
  | { tipo: "select"; clave: string; etiqueta: string; todos: string; opciones: { valor: string; texto: string }[]; ancho?: string }
  | { tipo: "fecha"; clave: string; etiqueta: string };

/** Filtros que viven en la URL (searchParams); cada cambio navega y el servidor vuelve a consultar acotado por centro. */
export function FiltrosUrl({ filtros }: { filtros: FiltroUrl[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const ir = (clave: string, valor: string) => {
    const p = new URLSearchParams(params);
    valor ? p.set(clave, valor) : p.delete(clave);
    const q = p.toString();
    router.push(q ? `${pathname}?${q}` : pathname);
  };
  const activos = filtros.some((f) => params.get(f.clave));
  return (
    <div className="flex flex-wrap items-end gap-3" role="group" aria-label="Filtros">
      {filtros.map((f) =>
        f.tipo === "select" ? (
          <Select key={f.clave} value={params.get(f.clave) || "__todos"} onValueChange={(v) => ir(f.clave, v === "__todos" ? "" : v)}>
            <SelectTrigger className={f.ancho ?? "w-44"} aria-label={f.etiqueta}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__todos">{f.todos}</SelectItem>
              {f.opciones.map((o) => <SelectItem key={o.valor} value={o.valor}>{o.texto}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <label key={`${f.clave}-${params.get(f.clave) ?? ""}`} className="flex items-center gap-2 text-sm text-muted-foreground">
            {f.etiqueta}
            <Input type="date" className="w-40" defaultValue={params.get(f.clave) ?? ""} onChange={(e) => ir(f.clave, e.target.value)} />
          </label>
        ),
      )}
      {activos && (
        <Button variant="ghost" size="sm" onClick={() => router.push(pathname)}><X /> Limpiar filtros</Button>
      )}
    </div>
  );
}
