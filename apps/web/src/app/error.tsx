"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPagina({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <TriangleAlert className="size-10 text-destructive" aria-hidden />
      <h1 className="text-2xl font-semibold tracking-tight">Algo salió mal</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        No pudimos completar la acción. Inténtalo de nuevo; si el problema sigue, avísale al administrador de tu centro.
        {error.digest && <span className="mt-1 block text-xs">Código: {error.digest}</span>}
      </p>
      <div className="flex gap-2">
        <Button onClick={reset}>Reintentar</Button>
        <Button asChild variant="outline"><Link href="/inicio">Ir al inicio</Link></Button>
      </div>
    </main>
  );
}
