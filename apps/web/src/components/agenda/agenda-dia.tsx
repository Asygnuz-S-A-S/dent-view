"use client";

import { CalendarIcon, ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import { es } from "date-fns/locale";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { guardarCita, marcarLlegada } from "@/app/(app)/agenda/actions";
import { PacienteCombobox, type PacienteOpcion } from "@/components/ordenes/paciente-combobox";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  COLOR_ESTADO_CITA, COLORES_SALA, DURACIONES, ESTADOS_CITA, ETIQUETA_ESTADO_CITA, FIN_DIA_MIN, horaTexto,
  INICIO_DIA_MIN, PASO_MIN, type EstadoCita,
} from "@/lib/agenda";
import { fechaLargaDeIso } from "@/lib/fechas";
import { numeroOrden } from "@/lib/ordenes";
import { cn } from "@/lib/utils";
import { EstadoVacio } from "@/components/comunes/estado-vacio";

type Sala = { id: string; nombre: string; color: string };
type OrdenOpcion = { id: string; numero: number; pacienteId: string; servicios: string[] };
type Cita = {
  id: string; salaId: string; pacienteId: string; pacienteNombre: string; ordenId: string | null;
  servicios: string[]; inicioMin: number; duracion: number; estado: string; notas: string | null; alertas: string | null;
};
type Borrador = { id?: string; salaId: string; inicioMin: number; pacienteId: string; ordenId: string; duracion: number; notas: string; estado: string };

const ALTO = 28; // px por franja de 15 min
const FRANJAS = Array.from({ length: (FIN_DIA_MIN - INICIO_DIA_MIN) / PASO_MIN }, (_, i) => INICIO_DIA_MIN + i * PASO_MIN);
const sumarDias = (f: string, n: number) => new Date(Date.parse(`${f}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export function AgendaDia({ fecha, hoy, salas: todasSalas, salaFiltro, citas, pacientes, ordenes, alertasPacientes, ordenInicial }: {
  fecha: string; hoy: string; salas: Sala[]; salaFiltro: string; citas: Cita[]; pacientes: PacienteOpcion[]; ordenes: OrdenOpcion[];
  alertasPacientes: Record<string, string>; ordenInicial: string | null;
}) {
  const router = useRouter();
  // El filtro `?sala=` solo recorta las columnas; el diálogo de cita sigue ofreciendo todas las salas.
  const salas = salaFiltro ? todasSalas.filter((s) => s.id === salaFiltro) : todasSalas;
  const sufijo = salaFiltro ? `&sala=${salaFiltro}` : "";
  const orden0 = ordenInicial ? ordenes.find((o) => o.id === ordenInicial) : undefined;
  const [borrador, setBorrador] = useState<Borrador | null>(
    orden0 && salas[0] ? { salaId: salas[0].id, inicioMin: 9 * 60, pacienteId: orden0.pacienteId, ordenId: orden0.id, duracion: 30, notas: "", estado: "PROGRAMADA" } : null,
  );
  const [salaVista, setSalaVista] = useState(salas[0]?.id ?? ""); // en móvil se ve una sala a la vez
  const [llegando, iniciarLlegada] = useTransition();
  const llego = (id: string) =>
    iniciarLlegada(async () => {
      const r = await marcarLlegada(id);
      if (r.error) return void toast.error(r.error);
      toast.success("Paciente marcado como llegado");
      router.refresh();
    });
  const [ahora, setAhora] = useState<number | null>(null);
  const [calAbierto, setCalAbierto] = useState(false);

  useEffect(() => {
    // La hora actual se calcula en el cliente (en Bogotá) para no desajustar la hidratación.
    const tick = () => {
      const l = new Date(Date.now() - 5 * 3600_000);
      setAhora(l.getUTCHours() * 60 + l.getUTCMinutes());
    };
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, []);

  const ir = (f: string) => router.push(`/agenda?fecha=${f}${sufijo}`);
  const titulo = fechaLargaDeIso(fecha);
  const lineaAhora = fecha === hoy && ahora !== null && ahora >= INICIO_DIA_MIN && ahora <= FIN_DIA_MIN;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="icon" aria-label="Día anterior"><Link href={`/agenda?fecha=${sumarDias(fecha, -1)}${sufijo}`}><ChevronLeft /></Link></Button>
        <Button asChild variant="outline"><Link href={`/agenda?fecha=${hoy}${sufijo}`}>Hoy</Link></Button>
        <Button asChild variant="outline" size="icon" aria-label="Día siguiente"><Link href={`/agenda?fecha=${sumarDias(fecha, 1)}${sufijo}`}><ChevronRight /></Link></Button>
        <Popover open={calAbierto} onOpenChange={setCalAbierto}>
          <PopoverTrigger asChild>
            <Button variant="outline" aria-label="Elegir fecha"><CalendarIcon /> <span className="first-letter:uppercase">{titulo}</span></Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              locale={es}
              selected={new Date(`${fecha}T12:00:00`)}
              defaultMonth={new Date(`${fecha}T12:00:00`)}
              onSelect={(d) => {
                if (!d) return;
                setCalAbierto(false);
                ir(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
              }}
            />
          </PopoverContent>
        </Popover>
      </div>

      {salas.length === 0 ? (
        <EstadoVacio className="rounded-lg border" titulo="No hay salas activas" descripcion="Un administrador puede crearlas en Salas y ajustes." />
      ) : (
        <>
        <div className="md:hidden">
          <Label htmlFor="sala-vista" className="sr-only">Sala</Label>
          <Select value={salaVista} onValueChange={setSalaVista}>
            <SelectTrigger id="sala-vista" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{salas.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="max-h-[75svh] overflow-auto rounded-lg border bg-card">
          <div
            className="grid max-md:grid-cols-[3.5rem_1fr] md:min-w-[40rem] md:grid-cols-[3.5rem_repeat(var(--salas),minmax(10rem,1fr))]"
            style={{ "--salas": salas.length } as React.CSSProperties}
          >
            <div className="sticky top-0 z-20 border-b bg-card" />
            {salas.map((s) => (
              <div key={s.id} className={cn("sticky top-0 z-20 flex items-center gap-2 border-b border-l bg-card px-3 py-2 text-sm font-medium", s.id !== salaVista && "max-md:hidden")}>
                <span className={cn("size-3 rounded-full", COLORES_SALA[s.color] ?? "bg-zinc-400")} aria-hidden /> {s.nombre}
              </div>
            ))}

            <div className="relative" style={{ height: FRANJAS.length * ALTO }}>
              {FRANJAS.filter((m) => m % 60 === 0).map((m) => (
                <span key={m} className="absolute right-2 -translate-y-1/2 text-xs text-muted-foreground" style={{ top: ((m - INICIO_DIA_MIN) / PASO_MIN) * ALTO + (m === INICIO_DIA_MIN ? 8 : 0) }}>
                  {horaTexto(m)}
                </span>
              ))}
            </div>
            {salas.map((s) => (
              <div key={s.id} className={cn("relative border-l", s.id !== salaVista && "max-md:hidden")} style={{ height: FRANJAS.length * ALTO }}>
                {FRANJAS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-label={`Agendar en ${s.nombre} a las ${horaTexto(m)}`}
                    onClick={() => setBorrador({ salaId: s.id, inicioMin: m, pacienteId: "", ordenId: "", duracion: 30, notas: "", estado: "PROGRAMADA" })}
                    className={cn("block w-full cursor-pointer hover:bg-muted/60 focus-visible:bg-muted", m % 60 === 0 ? "border-t" : m % 30 === 0 ? "border-t border-dashed" : "")}
                    style={{ height: ALTO }}
                  />
                ))}
                {citas.filter((c) => c.salaId === s.id).map((c) => {
                  const pendienteLlegada = c.estado === "PROGRAMADA" || c.estado === "CONFIRMADA";
                  return (
                    <div
                      key={c.id}
                      className={cn("absolute inset-x-1 overflow-hidden rounded-md border-l-4 text-xs shadow-sm", COLOR_ESTADO_CITA[c.estado as EstadoCita])}
                      style={{ top: ((c.inicioMin - INICIO_DIA_MIN) / PASO_MIN) * ALTO + 1, height: (c.duracion / PASO_MIN) * ALTO - 2 }}
                    >
                      <button
                        type="button"
                        onClick={() => setBorrador({ id: c.id, salaId: c.salaId, inicioMin: c.inicioMin, pacienteId: c.pacienteId, ordenId: c.ordenId ?? "", duracion: c.duracion, notas: c.notas ?? "", estado: c.estado })}
                        className={cn("block size-full px-2 py-1 text-left", pendienteLlegada && "pr-14")}
                        aria-label={`${c.pacienteNombre.toLowerCase()}, ${horaTexto(c.inicioMin)}, ${ETIQUETA_ESTADO_CITA[c.estado as EstadoCita]}${c.alertas ? `. Alerta: ${c.alertas}` : ""}`}
                      >
                        <div className="flex items-center gap-1 font-medium">
                          {c.alertas && <TriangleAlert className="size-3.5 shrink-0 text-red-600 dark:text-red-400" aria-hidden />}
                          <span className="truncate capitalize">{c.pacienteNombre.toLowerCase()}</span>
                        </div>
                        <div className="truncate opacity-80">{horaTexto(c.inicioMin)} · {ETIQUETA_ESTADO_CITA[c.estado as EstadoCita]}</div>
                        {c.alertas && c.duracion >= 45 && <div className="truncate font-medium text-red-700 dark:text-red-300">{c.alertas}</div>}
                        {c.servicios.length > 0 && c.duracion >= 45 && <div className="truncate opacity-80">{c.servicios.join(", ")}</div>}
                      </button>
                      {pendienteLlegada && fecha === hoy && (
                        <Button type="button" size="sm" variant="secondary" disabled={llegando} onClick={() => llego(c.id)} className="absolute right-1 top-1 h-5 px-1.5 text-[11px]" aria-label={`Marcar llegada de ${c.pacienteNombre.toLowerCase()}`}>
                          Llegó
                        </Button>
                      )}
                    </div>
                  );
                })}
                {lineaAhora && (
                  <div aria-hidden className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-500" style={{ top: ((ahora! - INICIO_DIA_MIN) / PASO_MIN) * ALTO }} />
                )}
              </div>
            ))}
          </div>
        </div>
        </>
      )}

      {borrador && (
        <CitaDialog
          key={borrador.id ?? `${borrador.salaId}-${borrador.inicioMin}`}
          inicial={borrador}
          fecha={fecha}
          salas={todasSalas}
          pacientes={pacientes}
          ordenes={ordenes}
          alertas={alertasPacientes}
          cerrar={() => setBorrador(null)}
        />
      )}
    </>
  );
}

function CitaDialog({ inicial, fecha, salas, pacientes, ordenes, alertas, cerrar }: {
  inicial: Borrador; fecha: string; salas: Sala[]; pacientes: PacienteOpcion[]; ordenes: OrdenOpcion[]; alertas: Record<string, string>; cerrar: () => void;
}) {
  const router = useRouter();
  const [b, setB] = useState(inicial);
  const [pendiente, iniciar] = useTransition();
  const set = (p: Partial<Borrador>) => setB((x) => ({ ...x, ...p }));
  const delPaciente = ordenes.filter((o) => o.pacienteId === b.pacienteId);

  const guardar = () =>
    iniciar(async () => {
      const r = await guardarCita({
        id: b.id, salaId: b.salaId, pacienteId: b.pacienteId, ordenId: b.ordenId || null, fecha,
        inicioMin: b.inicioMin, duracion: b.duracion, notas: b.notas, estado: b.id ? (b.estado as EstadoCita) : undefined,
      });
      if (r.error) return void toast.error(r.error);
      toast.success(b.id ? "Cita actualizada" : "Cita creada");
      router.refresh();
      cerrar();
    });

  return (
    <Dialog open onOpenChange={(o) => !o && cerrar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{b.id ? "Editar cita" : "Nueva cita"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cita-paciente">Paciente</Label>
            <PacienteCombobox id="cita-paciente" pacientes={pacientes} value={b.pacienteId} onChange={(id) => set({ pacienteId: id, ordenId: "" })} />
          </div>
          {alertas[b.pacienteId] && (
            <p role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> <span><strong>Alerta del paciente:</strong> {alertas[b.pacienteId]}</span>
            </p>
          )}
          <div className="space-y-2">
            <Label>Orden (opcional)</Label>
            <Select value={b.ordenId || "ninguna"} onValueChange={(v) => set({ ordenId: v === "ninguna" ? "" : v })} disabled={!b.pacienteId}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ninguna">Sin orden</SelectItem>
                {delPaciente.map((o) => <SelectItem key={o.id} value={o.id}>{numeroOrden(o.numero)} · {o.servicios.join(", ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Sala</Label>
              <Select value={b.salaId} onValueChange={(v) => set({ salaId: v })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{salas.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Inicio</Label>
              <Select value={String(b.inicioMin)} onValueChange={(v) => set({ inicioMin: Number(v) })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{FRANJAS.map((m) => <SelectItem key={m} value={String(m)}>{horaTexto(m)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Duración</Label>
              <Select value={String(b.duracion)} onValueChange={(v) => set({ duracion: Number(v) })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{DURACIONES.map((d) => <SelectItem key={d} value={String(d)}>{d} min</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {b.id && (
            <div className="space-y-2">
              <Label>Estado</Label>
              <Select value={b.estado} onValueChange={(v) => set({ estado: v })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{ESTADOS_CITA.map((e) => <SelectItem key={e} value={e}>{ETIQUETA_ESTADO_CITA[e]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="cita-notas">Notas</Label>
            <Textarea id="cita-notas" value={b.notas} onChange={(e) => set({ notas: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={cerrar}>Cancelar</Button>
          <Button disabled={pendiente || !b.pacienteId} onClick={guardar}>{pendiente ? "Guardando…" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
