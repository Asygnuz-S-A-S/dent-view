"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** Ejecuta una acción de servidor con aviso de éxito/error y refresco de la pantalla. */
export function useAccion(alExito?: () => void) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const ejecutar = (fn: () => Promise<{ error?: string }>, ok?: string) =>
    iniciar(async () => {
      const r = await fn();
      if (r.error) return void toast.error(r.error);
      if (ok) toast.success(ok);
      alExito?.();
      router.refresh();
    });
  return { pendiente, ejecutar };
}

/** <select> nativo con el estilo de los campos: accesible por teclado y en móvil sin añadir otro popover. */
export function SelectNativo({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn("h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30", className)}
      {...props}
    />
  );
}
