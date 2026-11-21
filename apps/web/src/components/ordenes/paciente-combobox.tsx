"use client";

import { Check, ChevronsUpDown, UserPlus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type PacienteOpcion = { id: string; nombre: string; documento: string };

// shortcut: filtra en el cliente sobre la lista que manda el servidor; pasar a búsqueda en servidor con miles de pacientes.
export function PacienteCombobox({
  pacientes, value, onChange, onNuevo, id,
}: {
  pacientes: PacienteOpcion[];
  value: string;
  onChange: (id: string) => void;
  onNuevo?: () => void;
  id?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const actual = pacientes.find((p) => p.id === value);
  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={abierto} className="w-full justify-between font-normal">
          <span className={cn("truncate capitalize", !actual && "text-muted-foreground")}>
            {actual ? `${actual.nombre.toLowerCase()} · ${actual.documento}` : "Buscar paciente…"}
          </span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Nombre o documento" />
          <CommandList>
            <CommandEmpty>Sin resultados.</CommandEmpty>
            <CommandGroup>
              {pacientes.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.nombre} ${p.documento} ${p.id}`}
                  onSelect={() => { onChange(p.id); setAbierto(false); }}
                >
                  <Check className={cn(p.id === value ? "opacity-100" : "opacity-0")} />
                  <span className="capitalize">{p.nombre.toLowerCase()}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{p.documento}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            {onNuevo && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => { setAbierto(false); onNuevo(); }}>
                    <UserPlus /> Crear paciente nuevo
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
