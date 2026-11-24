import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Anterior / siguiente por URL (?pagina=N) conservando los demás filtros (`params`). No se muestra con una sola página. */
export function Paginacion({ ruta, params, pagina, paginas, total, desde, hasta }: { ruta: string; params: Record<string, string | undefined>; pagina: number; paginas: number; total: number; desde: number; hasta: number }) {
  if (paginas <= 1) return null;
  const href = (n: number) => {
    const p = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1]));
    if (n > 1) p.set("pagina", String(n));
    const q = p.toString();
    return q ? `${ruta}?${q}` : ruta;
  };
  return (
    <nav aria-label="Paginación" className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
      <p aria-live="polite">Mostrando {desde}–{hasta} de {total} · página {pagina} de {paginas}</p>
      <div className="flex gap-2">
        {pagina > 1 ? <Button asChild size="sm" variant="outline"><Link href={href(pagina - 1)} rel="prev"><ChevronLeft /> Anterior</Link></Button> : <Button size="sm" variant="outline" disabled><ChevronLeft /> Anterior</Button>}
        {pagina < paginas ? <Button asChild size="sm" variant="outline"><Link href={href(pagina + 1)} rel="next">Siguiente <ChevronRight /></Link></Button> : <Button size="sm" variant="outline" disabled>Siguiente <ChevronRight /></Button>}
      </div>
    </nav>
  );
}
