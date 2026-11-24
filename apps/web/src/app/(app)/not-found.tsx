import { SearchX } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

// notFound() lanzado por una página dentro del layout: ya hay un <main> (SidebarInset), aquí solo un div.
export default function NoEncontradaEnApp() {
  return (
    <div className="flex min-h-[60svh] flex-col items-center justify-center gap-4 p-6 text-center">
      <SearchX className="size-10 text-muted-foreground" aria-hidden />
      <h1 className="text-2xl font-semibold tracking-tight">No encontramos esta página</h1>
      <p className="max-w-sm text-sm text-muted-foreground">Puede que el enlace esté mal escrito, que ya no exista o que no tengas permiso para verla.</p>
      <Button asChild><Link href="/inicio">Ir al inicio</Link></Button>
    </div>
  );
}
