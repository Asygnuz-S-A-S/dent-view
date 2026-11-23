"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ENLACES = [
  { href: "/crm", texto: "Panel", exacto: true, gestion: true },
  { href: "/crm/leads", texto: "Leads", gestion: false },
  { href: "/crm/tareas", texto: "Tareas", gestion: false },
  { href: "/crm/secuencias", texto: "Secuencias", gestion: true },
  { href: "/crm/fidelizacion", texto: "Fidelización", gestion: true },
];

/** Navegación interna del CRM; el especialista solo ve lo que puede usar (sus leads y tareas). */
export function NavCrm({ gestion }: { gestion: boolean }) {
  const ruta = usePathname();
  return (
    <nav aria-label="Secciones del CRM" className="-mx-1 flex gap-1 overflow-x-auto border-b px-1 pb-px">
      {ENLACES.filter((e) => gestion || !e.gestion).map((e) => {
        const activo = e.exacto ? ruta === e.href : ruta === e.href || ruta.startsWith(`${e.href}/`);
        return (
          <Link
            key={e.href} href={e.href} aria-current={activo ? "page" : undefined}
            className={cn("shrink-0 rounded-t-md border-b-2 px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50", activo ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {e.texto}
          </Link>
        );
      })}
    </nav>
  );
}
