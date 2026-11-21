import type { ReactNode } from "react";

/** Encabezado de página: título, descripción y acciones primarias (a la derecha; apiladas debajo en móvil). */
export function EncabezadoPagina({ titulo, descripcion, insignia, acciones, children }: {
  titulo: ReactNode;
  descripcion?: ReactNode;
  /** Estado junto al título (p. ej. un Badge). */
  insignia?: ReactNode;
  acciones?: ReactNode;
  /** Líneas extra bajo la descripción. */
  children?: ReactNode;
}) {
  return (
    // Las acciones bajan a su propia fila cuando no caben junto al título (móvil o muchos botones).
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
      <div className="min-w-0 flex-[1_1_20rem] space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{titulo}</h1>
          {insignia}
        </div>
        {descripcion && <p className="max-w-prose text-sm text-pretty text-muted-foreground">{descripcion}</p>}
        {children}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </header>
  );
}
