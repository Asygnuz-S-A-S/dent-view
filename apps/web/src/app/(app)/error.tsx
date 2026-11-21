"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { EstadoVacio } from "@/components/comunes/estado-vacio";
import { Button } from "@/components/ui/button";

// Error dentro del área autenticada: conserva la barra lateral para que la persona pueda seguir navegando.
export default function ErrorApp({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div role="alert" className="rounded-xl border">
      <EstadoVacio
        icono={TriangleAlert}
        titulo="No pudimos cargar esta página"
        descripcion={<>Inténtalo de nuevo; si el problema sigue, avísale al administrador de tu centro.{error.digest && <span className="mt-1 block text-xs">Código: {error.digest}</span>}</>}
        accion={<div className="flex gap-2"><Button onClick={reset}>Reintentar</Button><Button asChild variant="outline"><Link href="/inicio">Ir al inicio</Link></Button></div>}
      />
    </div>
  );
}
