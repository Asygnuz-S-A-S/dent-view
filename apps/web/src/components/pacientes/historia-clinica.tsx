"use client";

// Implementación independiente (sala limpia) a partir de docs/sala-limpia/05-historia-clinica.md
import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { eliminarContacto, eliminarRepresentante, guardarAntecedentes, guardarContacto, guardarRepresentante } from "@/app/(app)/pacientes/historia-actions";
import { ConfirmarAccion } from "@/components/comunes/confirmar-accion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ETIQUETA_GRAVEDAD, GRAVEDADES } from "@/lib/historia-clinica";

export type AntecedentesForm = {
  contexto: {
    embarazo: boolean; semanasEmbarazo: string; lactancia: boolean; anticoagulantes: boolean; anticoagulanteNombre: string; inr: string; inrFecha: string;
    reaccionAnestesia: boolean; detalleAnestesia: string; implantesMetalicos: boolean; marcapasos: boolean; claustrofobia: boolean; estudiosRecientes: string;
  };
  alergias: { nombre: string; gravedad: string; reaccion: string }[];
  medicaciones: { nombre: string; notas: string }[];
  enfermedades: { nombre: string; critica: boolean; notas: string }[];
};
export type ContactoForm = { nombre: string; parentesco: string; telefono: string; correo: string };
export type RepresentanteForm = ContactoForm & { tipoDocumento: string; numeroDocumento: string; direccion: string };

const BOOLEANOS = [
  ["embarazo", "Embarazo o sospecha"], ["lactancia", "Lactancia"], ["anticoagulantes", "Usa anticoagulantes"], ["reaccionAnestesia", "Reacción adversa previa a anestesia"],
  ["implantesMetalicos", "Implantes o dispositivos metálicos"], ["marcapasos", "Marcapasos"], ["claustrofobia", "Claustrofobia"],
] as const;

function Casilla({ id, etiqueta, valor, alCambiar }: { id: string; etiqueta: string; valor: boolean; alCambiar: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2"><Checkbox id={id} checked={valor} onCheckedChange={(v) => alCambiar(v === true)} /><Label htmlFor={id}>{etiqueta}</Label></div>
  );
}
function Campo({ id, etiqueta, ...p }: { id: string; etiqueta: string } & React.ComponentProps<typeof Input>) {
  return <div className="grid gap-1.5"><Label htmlFor={id}>{etiqueta}</Label><Input id={id} {...p} /></div>;
}

export function Antecedentes({ pacienteId, inicial }: { pacienteId: string; inicial: AntecedentesForm }) {
  const [f, setF] = useState(inicial);
  const [pendiente, iniciar] = useTransition();
  const c = f.contexto;
  const setC = (p: Partial<typeof c>) => setF({ ...f, contexto: { ...c, ...p } });
  const guardar = () => iniciar(async () => {
    const r = await guardarAntecedentes(pacienteId, f);
    if (r.error) toast.error(r.error); else toast.success("Antecedentes guardados");
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Contexto médico y tamizaje del estudio</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {BOOLEANOS.map(([k, et]) => <Casilla key={k} id={`ctx-${k}`} etiqueta={et} valor={c[k]} alCambiar={(v) => setC({ [k]: v })} />)}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {c.embarazo && <Campo id="ctx-semanas" etiqueta="Semanas de embarazo (1–42)" inputMode="numeric" value={c.semanasEmbarazo} onChange={(e) => setC({ semanasEmbarazo: e.target.value })} />}
            {c.anticoagulantes && <>
              <Campo id="ctx-anticoag" etiqueta="Anticoagulante" value={c.anticoagulanteNombre} onChange={(e) => setC({ anticoagulanteNombre: e.target.value })} />
              <Campo id="ctx-inr" etiqueta="INR (0–20)" inputMode="decimal" value={c.inr} onChange={(e) => setC({ inr: e.target.value })} />
              <Campo id="ctx-inrfecha" etiqueta="Fecha del INR" type="date" value={c.inrFecha} onChange={(e) => setC({ inrFecha: e.target.value })} />
            </>}
            {c.reaccionAnestesia && <Campo id="ctx-anest" etiqueta="Detalle de la reacción" value={c.detalleAnestesia} onChange={(e) => setC({ detalleAnestesia: e.target.value })} />}
          </div>
          <Campo id="ctx-recientes" etiqueta="Estudios radiográficos recientes" value={c.estudiosRecientes} onChange={(e) => setC({ estudiosRecientes: e.target.value })} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Alergias</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {f.alergias.map((a, i) => (
            <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_9rem_1fr_auto]">
              <Campo id={`al-n-${i}`} etiqueta="Alergia" value={a.nombre} onChange={(e) => setF({ ...f, alergias: f.alergias.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)) })} />
              <div className="grid gap-1.5">
                <Label htmlFor={`al-g-${i}`}>Gravedad</Label>
                <Select value={a.gravedad} onValueChange={(v) => setF({ ...f, alergias: f.alergias.map((x, j) => (j === i ? { ...x, gravedad: v } : x)) })}>
                  <SelectTrigger id={`al-g-${i}`}><SelectValue /></SelectTrigger>
                  <SelectContent>{GRAVEDADES.map((g) => <SelectItem key={g} value={g}>{ETIQUETA_GRAVEDAD[g]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Campo id={`al-r-${i}`} etiqueta="Reacción" value={a.reaccion} onChange={(e) => setF({ ...f, alergias: f.alergias.map((x, j) => (j === i ? { ...x, reaccion: e.target.value } : x)) })} />
              <Button type="button" size="icon" variant="ghost" aria-label="Quitar alergia" onClick={() => setF({ ...f, alergias: f.alergias.filter((_, j) => j !== i) })}><Trash2 /></Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={() => setF({ ...f, alergias: [...f.alergias, { nombre: "", gravedad: "MEDIA", reaccion: "" }] })}><Plus /> Agregar alergia</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Medicación relevante</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {f.medicaciones.map((m, i) => (
            <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Campo id={`me-n-${i}`} etiqueta="Medicamento" value={m.nombre} onChange={(e) => setF({ ...f, medicaciones: f.medicaciones.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)) })} />
              <Campo id={`me-o-${i}`} etiqueta="Notas" value={m.notas} onChange={(e) => setF({ ...f, medicaciones: f.medicaciones.map((x, j) => (j === i ? { ...x, notas: e.target.value } : x)) })} />
              <Button type="button" size="icon" variant="ghost" aria-label="Quitar medicamento" onClick={() => setF({ ...f, medicaciones: f.medicaciones.filter((_, j) => j !== i) })}><Trash2 /></Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={() => setF({ ...f, medicaciones: [...f.medicaciones, { nombre: "", notas: "" }] })}><Plus /> Agregar medicamento</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Enfermedades sistémicas</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {f.enfermedades.map((en, i) => (
            <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
              <Campo id={`en-n-${i}`} etiqueta="Enfermedad" value={en.nombre} onChange={(e) => setF({ ...f, enfermedades: f.enfermedades.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)) })} />
              <Campo id={`en-o-${i}`} etiqueta="Notas" value={en.notas} onChange={(e) => setF({ ...f, enfermedades: f.enfermedades.map((x, j) => (j === i ? { ...x, notas: e.target.value } : x)) })} />
              <div className="pb-2"><Casilla id={`en-c-${i}`} etiqueta="Crítica" valor={en.critica} alCambiar={(v) => setF({ ...f, enfermedades: f.enfermedades.map((x, j) => (j === i ? { ...x, critica: v } : x)) })} /></div>
              <Button type="button" size="icon" variant="ghost" aria-label="Quitar enfermedad" onClick={() => setF({ ...f, enfermedades: f.enfermedades.filter((_, j) => j !== i) })}><Trash2 /></Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={() => setF({ ...f, enfermedades: [...f.enfermedades, { nombre: "", critica: false, notas: "" }] })}><Plus /> Agregar enfermedad</Button>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button disabled={pendiente} onClick={guardar}>Guardar antecedentes</Button>
        <p className="text-xs text-muted-foreground">Lo anterior queda archivado en la hoja de vida; nada se borra.</p>
      </div>
    </div>
  );
}


/** Contacto de emergencia o representante legal: uno por paciente, con baja lógica. */
export function ContactoPersona({ pacienteId, tipo, inicial, avisoMenor }: { pacienteId: string; tipo: "contacto" | "representante"; inicial: RepresentanteForm | null; avisoMenor?: boolean }) {
  const rep = tipo === "representante";
  const [f, setF] = useState<RepresentanteForm>(inicial ?? { nombre: "", parentesco: "", telefono: "", correo: "", tipoDocumento: "CC", numeroDocumento: "", direccion: "" });
  const [existe, setExiste] = useState(!!inicial);
  const [pendiente, iniciar] = useTransition();
  const set = (p: Partial<RepresentanteForm>) => setF({ ...f, ...p });
  const guardar = () => iniciar(async () => {
    const r = await (rep ? guardarRepresentante(pacienteId, f) : guardarContacto(pacienteId, f));
    if (r.error) toast.error(r.error); else { toast.success("Guardado"); setExiste(true); }
  });
  const quitar = () => iniciar(async () => {
    const r = await (rep ? eliminarRepresentante(pacienteId) : eliminarContacto(pacienteId));
    if (r.error) toast.error(r.error); else { toast.success("Eliminado"); setExiste(false); setF({ ...f, nombre: "", telefono: "" }); }
  });
  const p = `${tipo}`;
  return (
    <Card>
      <CardHeader><CardTitle>{rep ? "Representante legal" : "Contacto de emergencia"}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {rep && avisoMenor && !existe && <p role="alert" className="rounded-md border border-amber-500 bg-amber-50 p-2 text-sm text-amber-950">El paciente es menor de edad: el representante legal es obligatorio.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo id={`${p}-nombre`} etiqueta="Nombre" value={f.nombre} onChange={(e) => set({ nombre: e.target.value })} />
          <Campo id={`${p}-parentesco`} etiqueta={rep ? "Parentesco" : "Parentesco (opcional)"} value={f.parentesco} onChange={(e) => set({ parentesco: e.target.value })} />
          <Campo id={`${p}-tel`} etiqueta="Teléfono" value={f.telefono} onChange={(e) => set({ telefono: e.target.value })} />
          <Campo id={`${p}-correo`} etiqueta="Correo (opcional)" type="email" value={f.correo} onChange={(e) => set({ correo: e.target.value })} />
          {rep && <>
            <Campo id={`${p}-tipodoc`} etiqueta="Tipo de documento" value={f.tipoDocumento} onChange={(e) => set({ tipoDocumento: e.target.value })} />
            <Campo id={`${p}-numdoc`} etiqueta="Número de documento" value={f.numeroDocumento} onChange={(e) => set({ numeroDocumento: e.target.value })} />
            <Campo id={`${p}-dir`} etiqueta="Dirección" value={f.direccion} onChange={(e) => set({ direccion: e.target.value })} />
          </>}
        </div>
        <div className="flex gap-2">
          <Button size="sm" disabled={pendiente} onClick={guardar}>Guardar</Button>
          {existe && (
            <ConfirmarAccion titulo={rep ? "¿Eliminar al representante legal?" : "¿Eliminar el contacto de emergencia?"} descripcion="Se borrarán los datos guardados de esta persona. Podrás registrar otra después." confirmar="Eliminar" onConfirmar={quitar}>
              <Button size="sm" variant="outline" disabled={pendiente}>Eliminar</Button>
            </ConfirmarAccion>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
