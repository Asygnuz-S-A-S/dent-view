"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Props = {
  tab: "todos" | "por-asignar"; q: string; modalidad: string; modalidades: string[]; porAsignar: number;
  estado: string; doctor: string; desde: string; hasta: string; doctores: { id: string; nombre: string }[] | null;
};
const ESTADOS = { POR_ASIGNAR: "Por asignar", ASIGNADO: "Asignado", PUBLICADO: "Publicado" };

export function FiltrosEstudios({ tab, q, modalidad, modalidades, porAsignar, estado, doctor, desde, hasta, doctores }: Props) {
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
      <Select value={estado || "todos"} onValueChange={(v) => router.push(url({ estado: v === "todos" ? "" : v, tab: "" }))}>
        <SelectTrigger className="w-40" aria-label="Filtrar por estado"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todos los estados</SelectItem>
          {Object.entries(ESTADOS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
        </SelectContent>
      </Select>
      {doctores && (
        <Select value={doctor || "todos"} onValueChange={(v) => router.push(url({ doctor: v === "todos" ? "" : v }))}>
          <SelectTrigger className="w-48" aria-label="Filtrar por doctor remitente"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los doctores</SelectItem>
            {doctores.map((d) => <SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      <div className="flex items-center gap-2">
        <Input type="date" defaultValue={desde} max={hasta || undefined} aria-label="Fecha desde" className="w-40" onChange={(e) => router.push(url({ desde: e.target.value }))} />
        <span className="text-sm text-muted-foreground">a</span>
        <Input type="date" defaultValue={hasta} min={desde || undefined} aria-label="Fecha hasta" className="w-40" onChange={(e) => router.push(url({ hasta: e.target.value }))} />
      </div>
      {(q || modalidad || estado || doctor || desde || hasta) && <Button asChild variant="ghost" size="sm"><Link href={url({ q: "", modalidad: "", estado: "", doctor: "", desde: "", hasta: "" })}>Limpiar filtros</Link></Button>}
    </div>
  );
}
