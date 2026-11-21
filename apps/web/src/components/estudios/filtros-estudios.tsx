"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Props = { tab: "todos" | "por-asignar"; q: string; modalidad: string; modalidades: string[]; porAsignar: number };

export function FiltrosEstudios({ tab, q, modalidad, modalidades, porAsignar }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const url = (cambios: Record<string, string>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cambios)) v ? p.set(k, v) : p.delete(k);
    return `${pathname}?${p}`;
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Tabs value={tab}>
        <TabsList>
          <TabsTrigger value="todos" asChild><Link href={url({ tab: "" })}>Todos</Link></TabsTrigger>
          <TabsTrigger value="por-asignar" asChild>
            <Link href={url({ tab: "por-asignar" })}>Por asignar ({porAsignar})</Link>
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <form
        className="relative min-w-56 flex-1 sm:max-w-xs"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(url({ q: String(new FormData(e.currentTarget).get("q") ?? "").trim() }));
        }}
      >
        <Search className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
        <Input name="q" defaultValue={q} placeholder="Paciente o documento" aria-label="Buscar estudios" className="pl-8" />
      </form>
      <Select value={modalidad || "todas"} onValueChange={(v) => router.push(url({ modalidad: v === "todas" ? "" : v }))}>
        <SelectTrigger className="w-40" aria-label="Filtrar por modalidad"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="todas">Todas las modalidades</SelectItem>
          {modalidades.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
