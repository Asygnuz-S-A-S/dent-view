import { Search, X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ORDENES_LISTA, type FiltrosPacientes } from "@/lib/pacientes-filtro";

const selectClase = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

/** Filtros por URL (GET): se pueden compartir y sobreviven al recargar. */
export function FiltrosPacientesForm({ f, doctores, activos }: { f: FiltrosPacientes; doctores: { id: string; nombre: string }[] | null; activos: boolean }) {
  return (
    <form role="search" aria-label="Filtros de pacientes" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="f-q">Buscar</Label>
        <Input id="f-q" name="q" defaultValue={f.q} placeholder="Nombre, documento o # de orden" aria-label="Buscar paciente" />
      </div>
      {doctores && (
        <div className="grid gap-1.5">
          <Label htmlFor="f-doctor">Doctor remitente</Label>
          <select id="f-doctor" name="doctor" defaultValue={f.doctor} className={selectClase}>
            <option value="">Todos</option>
            {doctores.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select>
        </div>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="f-esp">Especialidad</Label>
        <Input id="f-esp" name="especialidad" defaultValue={f.especialidad} placeholder="Ortodoncia…" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="f-desde">Último estudio desde</Label>
        <Input id="f-desde" name="desde" type="date" defaultValue={f.desde} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="f-hasta">Último estudio hasta</Label>
        <Input id="f-hasta" name="hasta" type="date" defaultValue={f.hasta} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="f-orden">Ordenar por</Label>
        <select id="f-orden" name="orden" defaultValue={f.orden} className={selectClase}>
          {Object.entries(ORDENES_LISTA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <fieldset className="flex flex-wrap items-end gap-x-5 gap-y-2 text-sm sm:col-span-2">
        <legend className="sr-only">Solo pacientes con</legend>
        <label className="flex items-center gap-2"><input type="checkbox" name="pendientes" value="1" defaultChecked={f.pendientes} className="size-4 accent-primary" /> Estudios pendientes</label>
        {doctores && <label className="flex items-center gap-2"><input type="checkbox" name="cartera" value="1" defaultChecked={f.cartera} className="size-4 accent-primary" /> Cartera pendiente</label>}
      </fieldset>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
        <Button type="submit" variant="secondary"><Search /> Aplicar filtros</Button>
        {activos && <Button asChild variant="ghost"><Link href="/pacientes"><X /> Limpiar</Link></Button>}
      </div>
    </form>
  );
}
