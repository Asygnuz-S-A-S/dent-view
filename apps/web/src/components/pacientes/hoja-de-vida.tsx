import { Activity, CalendarClock, ClipboardList, FileImage, FileText, HandCoins, Send, ShieldCheck, UserRound, PhoneCall, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { fechaHoraCompleta } from "@/lib/fechas";
import { ETIQUETA_TIPO_HOJA, type EntradaHoja, type TipoHoja } from "@/lib/pacientes-hoja";

const ICONOS: Record<TipoHoja, LucideIcon> = {
  orden: ClipboardList, cita: CalendarClock, estudio: FileImage, informe: FileText, entrega: Send,
  pago: HandCoins, consentimiento: ShieldCheck, seguimiento: PhoneCall, paciente: UserRound,
};

export function HojaDeVida({ entradas }: { entradas: EntradaHoja[] }) {
  if (!entradas.length) return <p className="py-8 text-center text-sm text-muted-foreground">No hay eventos para mostrar.</p>;
  return (
    <ol className="space-y-4">
      {entradas.map((e) => {
        const Icono = ICONOS[e.tipo] ?? Activity;
        return (
          <li key={e.id} className="flex gap-3 break-inside-avoid">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted"><Icono className="size-4" aria-hidden /></span>
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {e.href ? <Link href={e.href} className="underline-offset-4 hover:underline print:no-underline">{e.titulo}</Link> : e.titulo}
              </p>
              {e.detalle && <p className="text-sm text-muted-foreground">{e.detalle}</p>}
              <p className="text-xs text-muted-foreground">{ETIQUETA_TIPO_HOJA[e.tipo]} · {fechaHoraCompleta(e.fecha)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
