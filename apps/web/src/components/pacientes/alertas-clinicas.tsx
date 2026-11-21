// Implementación independiente (sala limpia) a partir de docs/sala-limpia/05-historia-clinica.md
import { Info, OctagonAlert, TriangleAlert } from "lucide-react";
import { ETIQUETA_GRAVEDAD, type Alerta, type Gravedad } from "@/lib/historia-clinica";

const ESTILO: Record<Gravedad, string> = {
  CRITICA: "border-red-600 bg-red-50 text-red-950 dark:bg-red-950/40 dark:text-red-100",
  ALTA: "border-orange-500 bg-orange-50 text-orange-950 dark:bg-orange-950/40 dark:text-orange-100",
  MEDIA: "border-amber-500 bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100",
  BAJA: "border-sky-500 bg-sky-50 text-sky-950 dark:bg-sky-950/40 dark:text-sky-100",
};
const ICONO = { CRITICA: OctagonAlert, ALTA: TriangleAlert, MEDIA: TriangleAlert, BAJA: Info };

/** Chips por gravedad: se distinguen por icono y rótulo, no solo por color. */
export function AlertasClinicas({ alertas }: { alertas: Alerta[] }) {
  if (!alertas.length) return null;
  return (
    <ul role="alert" aria-label="Alertas clínicas" className="flex flex-wrap gap-2">
      {alertas.map((a, i) => {
        const Icono = ICONO[a.gravedad];
        return (
          <li key={i} className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm ${ESTILO[a.gravedad]}`}>
            <Icono className="size-4 shrink-0" />
            <span className="font-semibold">{ETIQUETA_GRAVEDAD[a.gravedad]}:</span> {a.texto}
          </li>
        );
      })}
    </ul>
  );
}
