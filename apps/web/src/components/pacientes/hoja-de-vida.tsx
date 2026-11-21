import { Activity, CalendarClock, ClipboardList, FileImage, Smile, UserRound, type LucideIcon } from "lucide-react";
import { fechaHoraCompleta } from "@/lib/fechas";

export type EventoVista = { id: string; tipo: string; actor: string; creadoEn: Date };

const ICONOS: [string, LucideIcon][] = [
  ["paciente.", UserRound],
  ["odontograma.", Smile],
  ["orden.", ClipboardList],
  ["estudio.", FileImage],
  ["cita.", CalendarClock],
];
const ETIQUETAS: Record<string, string> = {
  "paciente.creado": "Paciente creado",
  "paciente.actualizado": "Datos del paciente actualizados",
  "odontograma.actualizado": "Odontograma actualizado",
};

export function HojaDeVida({ eventos }: { eventos: EventoVista[] }) {
  if (!eventos.length) return <p className="py-8 text-center text-sm text-muted-foreground">Aún no hay eventos registrados.</p>;
  return (
    <ol className="space-y-4">
      {eventos.map((e) => {
        const Icono = ICONOS.find(([p]) => e.tipo.startsWith(p))?.[1] ?? Activity;
        return (
          <li key={e.id} className="flex gap-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted"><Icono className="size-4" /></span>
            <div>
              <p className="text-sm font-medium">{ETIQUETAS[e.tipo] ?? e.tipo}</p>
              <p className="text-xs text-muted-foreground">
                {e.actor} · {fechaHoraCompleta(e.creadoEn)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
