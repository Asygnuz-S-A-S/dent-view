"use client";

import { notFound, usePathname } from "next/navigation";
import { rutaBloqueada, type TipoCentro } from "@/lib/tipo-centro";

/** Los layouts no se vuelven a ejecutar en navegación suave: repite en el cliente el guard por tipo de centro. */
export function GuardaModulo({ tipo, children }: { tipo: TipoCentro; children: React.ReactNode }) {
  if (rutaBloqueada(tipo, usePathname())) notFound();
  return children;
}
