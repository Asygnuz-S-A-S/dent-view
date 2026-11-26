"use client";

import { Check, ChevronsUpDown, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { buscarCodigos, CIE10, CUPS, descripcionDe } from "@/lib/catalogos/buscar";
import { cn } from "@/lib/utils";

const CATALOGOS = {
  cups: { items: CUPS.items, patron: /^\d{6}$/, ayuda: "Código CUPS o nombre" },
  cie10: { items: CIE10.items, patron: /^[A-Z]\d{2}[0-9A-Z]$/, ayuda: "Código CIE-10 o nombre" },
} as const;

/**
 * Selector con autocompletado (sin tildes) sobre el catálogo embebido, que es parcial: si lo escrito tiene el formato
 * del código y no está en la lista, se ofrece usarlo tal cual (la validación oficial es contra SISPRO).
 */
export function SelectorCodigo({
  catalogo, value, onChange, id, etiqueta, deshabilitado, limpiable = true,
}: {
  catalogo: keyof typeof CATALOGOS;
  value: string | null;
  onChange: (codigo: string | null) => void;
  id?: string;
  etiqueta: string;
  deshabilitado?: boolean;
  limpiable?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const cat = CATALOGOS[catalogo];
  const resultados = buscarCodigos(cat.items, q, 15);
  const escrito = q.trim().toUpperCase();
  const ofrecerEscrito = cat.patron.test(escrito) && !cat.items.some((i) => i.codigo === escrito);
  const elegir = (c: string) => { onChange(c); setAbierto(false); setQ(""); };
  const desc = value ? descripcionDe(cat.items, value) : null;

  return (
    <div className="flex min-w-0 gap-1">
      <Popover open={abierto} onOpenChange={setAbierto}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={abierto} aria-label={etiqueta} disabled={deshabilitado} className="min-w-0 flex-1 justify-between font-normal">
            <span className={cn("truncate", !value && "text-muted-foreground")}>{value ? `${value}${desc ? ` · ${desc}` : ""}` : "Buscar…"}</span>
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-80 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder={cat.ayuda} value={q} onValueChange={setQ} />
            <CommandList>
              <CommandEmpty>Sin resultados en el catálogo parcial.</CommandEmpty>
              <CommandGroup>
                {resultados.map((i) => (
                  <CommandItem key={i.codigo} value={i.codigo} onSelect={() => elegir(i.codigo)}>
                    <Check className={cn(i.codigo === value ? "opacity-100" : "opacity-0")} />
                    <span className="font-mono text-xs tabular-nums">{i.codigo}</span>
                    <span className="truncate">{i.descripcion}</span>
                  </CommandItem>
                ))}
                {ofrecerEscrito && <CommandItem value={`usar-${escrito}`} onSelect={() => elegir(escrito)}>Usar el código {escrito} (fuera del catálogo)</CommandItem>}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {limpiable && value && !deshabilitado && (
        <Button type="button" variant="ghost" size="icon" aria-label={`Quitar ${etiqueta}`} onClick={() => onChange(null)}><X /></Button>
      )}
    </div>
  );
}
