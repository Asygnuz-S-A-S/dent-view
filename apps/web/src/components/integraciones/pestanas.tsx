"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const PESTANAS = [
  { href: "/integraciones/api", etiqueta: "API y tokens" },
  { href: "/integraciones/webhooks", etiqueta: "Webhooks" },
  { href: "/integraciones/conectores", etiqueta: "Conectores" },
];

export function PestanasIntegraciones() {
  const ruta = usePathname();
  return (
    <nav aria-label="Secciones de integraciones" className="flex gap-1 overflow-x-auto border-b">
      {PESTANAS.map((p) => (
        <Link
          key={p.href}
          href={p.href}
          aria-current={ruta.startsWith(p.href) ? "page" : undefined}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            ruta.startsWith(p.href) ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {p.etiqueta}
        </Link>
      ))}
    </nav>
  );
}
