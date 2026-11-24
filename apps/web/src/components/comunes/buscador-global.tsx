"use client";

import { ClipboardList, Search, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { buscarGlobal, type Resultado } from "@/app/(app)/buscar-actions";
import { Button } from "@/components/ui/button";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

export function BuscadorGlobal() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Resultado[]>([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setAbierto((a) => !a);
      }
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) return;
    let vigente = true;
    const t = setTimeout(() => {
      setBuscando(true);
      buscarGlobal(q)
        .then((r) => vigente && setRes(r))
        .catch(() => vigente && setRes([]))
        .finally(() => vigente && setBuscando(false));
    }, 250);
    return () => { vigente = false; clearTimeout(t); };
  }, [q]);

  const ir = (r: Resultado) => {
    setAbierto(false);
    router.push(r.tipo === "paciente" ? `/pacientes/${r.id}` : `/ordenes/${r.id}`);
  };
  const grupo = (tipo: Resultado["tipo"]) => (q.trim().length < 2 ? [] : res).filter((r) => r.tipo === tipo);

  return (
    <>
      <Button variant="outline" size="sm" className="ml-auto text-muted-foreground" onClick={() => setAbierto(true)} aria-label="Buscar pacientes y órdenes">
        <Search /> <span className="hidden sm:inline">Buscar…</span>
        {/* La pista del atajo va en un pseudo-elemento: no forma parte del texto visible del botón, que debe estar contenido en su nombre accesible (WCAG 2.5.3). */}
        <kbd aria-hidden className="pointer-events-none ml-2 hidden rounded border bg-muted px-1.5 font-mono text-[10px] after:content-['Ctrl_K'] sm:inline" />
      </Button>
      <CommandDialog open={abierto} onOpenChange={(o) => { setAbierto(o); if (!o) { setQ(""); setRes([]); } }} title="Búsqueda global" description="Busca pacientes por nombre o documento y órdenes por número">
        {/* shouldFilter=false: el servidor ya filtró. */}
        <Command shouldFilter={false}>
        <CommandInput placeholder="Paciente, documento o n.º de orden" value={q} onValueChange={setQ} />
        <CommandList>
          <CommandEmpty>{q.trim().length < 2 ? "Escribe al menos 2 caracteres." : buscando ? "Buscando…" : "Sin resultados."}</CommandEmpty>
          {(["paciente", "orden"] as const).map((t) => grupo(t).length > 0 && (
            <CommandGroup key={t} heading={t === "paciente" ? "Pacientes" : "Órdenes"}>
              {grupo(t).map((r) => (
                <CommandItem key={r.id} value={`${r.tipo}-${r.id}`} onSelect={() => ir(r)}>
                  {t === "paciente" ? <UserRound /> : <ClipboardList />}
                  <span className="capitalize">{r.titulo.toLowerCase()}</span>
                  <span className={`ml-auto text-xs text-muted-foreground ${r.tipo === "orden" ? "capitalize" : ""}`}>{r.tipo === "orden" ? r.detalle.toLowerCase() : r.detalle}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
