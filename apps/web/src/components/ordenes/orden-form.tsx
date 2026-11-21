"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { crearOrden, crearPacienteRapido } from "@/app/(app)/ordenes/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CUADRANTES_FDI, usaDientes } from "@/lib/ordenes";
import { CATEGORIAS, cop, resolverPrecio, totalOrden, type Entrega, type OrigenPrecio } from "@/lib/precios";
import type { ConvenioOpcion, TarifasDoctor } from "@/lib/precios-datos";
import { PacienteCombobox, type PacienteOpcion } from "./paciente-combobox";

type Servicio = {
  id: string; categoria: string; nombre: string; descripcion: string | null;
  precioImpreso: number | null; precioDigital: number | null; descuento: number;
};
type Seleccion = { opciones: string; dientes: string[] };

export function OrdenForm({
  pacientes: inicial, doctores, servicios, esDoctor, pacienteInicial, convenios, tarifasDoctor, doctorPropioId, fecha,
}: {
  pacientes: PacienteOpcion[];
  doctores: { id: string; nombre: string }[];
  servicios: Servicio[];
  esDoctor: boolean;
  pacienteInicial?: string;
  /** Convenios activos y vigentes (vacío para doctores remitentes). */
  convenios: ConvenioOpcion[];
  tarifasDoctor: TarifasDoctor;
  /** Solo para doctores remitentes: su propio id (siempre se aplica su tarifa). */
  doctorPropioId?: string;
  fecha: string;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [pacientes, setPacientes] = useState(inicial);
  const [pacienteId, setPacienteId] = useState(pacienteInicial ?? "");
  const [doctorId, setDoctorId] = useState("");
  const [convenioId, setConvenioId] = useState("");
  const [entrega, setEntrega] = useState<Entrega>("DIGITAL");
  const [embarazo, setEmbarazo] = useState(false);
  const [observaciones, setObservaciones] = useState("");
  const [sel, setSel] = useState<Record<string, Seleccion>>({});
  const [nuevo, setNuevo] = useState(false);

  const convenio = convenios.find((c) => c.id === convenioId);
  const doctorEfectivo = esDoctor ? doctorPropioId : doctorId;
  const nombreDoctor = doctores.find((d) => d.id === doctorEfectivo)?.nombre;
  // Misma función que usa el servidor al crear la orden (allí se recalcula siempre).
  const aplicado = (s: Servicio) => {
    const r = resolverPrecio({
      servicio: s, entrega, fecha,
      tarifaDoctor: doctorEfectivo ? tarifasDoctor[doctorEfectivo]?.[s.id] : null,
      convenio: convenio && { ...convenio, tarifa: convenio.tarifas[s.id] },
    });
    return { precio: r.precio, origen: etiquetaOrigen(r.origen, nombreDoctor, convenio) };
  };
  const elegidos = servicios.filter((s) => sel[s.id]);
  const total = totalOrden(elegidos.map((s) => ({ precio: aplicado(s).precio ?? 0 })));

  const alternar = (id: string, on: boolean) =>
    setSel((p) => {
      const { [id]: _, ...resto } = p;
      return on ? { ...resto, [id]: { opciones: "", dientes: [] } } : resto;
    });
  const editar = (id: string, parche: Partial<Seleccion>) => setSel((p) => ({ ...p, [id]: { ...p[id]!, ...parche } }));

  const guardar = () =>
    iniciar(async () => {
      const r = await crearOrden({
        pacienteId,
        doctorId: esDoctor ? null : doctorId || null,
        convenioId: esDoctor ? null : convenioId || null,
        entrega,
        embarazo,
        observaciones,
        items: elegidos.map((s) => {
          const { opciones, dientes } = sel[s.id]!;
          const partes = [dientes.length ? `Dientes: ${dientes.join(", ")}` : "", opciones.trim()].filter(Boolean);
          return { servicioId: s.id, opciones: partes.join(" · ") };
        }),
      });
      if ("error" in r) return void toast.error(r.error);
      toast.success("Orden creada");
      router.push(`/ordenes/${r.id}`);
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Paciente y remisión</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="paciente">Paciente</Label>
              <PacienteCombobox id="paciente" pacientes={pacientes} value={pacienteId} onChange={setPacienteId} onNuevo={() => setNuevo(true)} />
            </div>
            {!esDoctor && (
              <div className="space-y-2">
                <Label>Doctor remitente</Label>
                <Select value={doctorId} onValueChange={setDoctorId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Sin doctor remitente" /></SelectTrigger>
                  <SelectContent>
                    {doctores.map((d) => <SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {!esDoctor && (
              <div className="space-y-2">
                <Label>Convenio</Label>
                <Select value={convenioId || "ninguno"} onValueChange={(v) => setConvenioId(v === "ninguno" ? "" : v)}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Sin convenio" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ninguno">Sin convenio</SelectItem>
                    {convenios.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label id="lbl-entrega">Entrega</Label>
              <RadioGroup aria-labelledby="lbl-entrega" value={entrega} onValueChange={(v) => setEntrega(v as Entrega)} className="flex gap-6 pt-1">
                {(["IMPRESA", "DIGITAL"] as const).map((e) => (
                  <div key={e} className="flex items-center gap-2">
                    <RadioGroupItem id={`e-${e}`} value={e} />
                    <Label htmlFor={`e-${e}`}>{e === "IMPRESA" ? "Impresa" : "Digital"}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Checkbox id="embarazo" checked={embarazo} onCheckedChange={(v) => setEmbarazo(v === true)} />
              <Label htmlFor="embarazo">La paciente está embarazada o podría estarlo</Label>
            </div>
          </CardContent>
        </Card>

        {CATEGORIAS.map((c) => {
          const lista = servicios.filter((s) => s.categoria === c.valor);
          if (!lista.length) return null;
          return (
            <Card key={c.valor}>
              <CardHeader><CardTitle>{c.etiqueta}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {lista.map((s) => {
                  const { precio, origen } = aplicado(s);
                  const marcado = sel[s.id];
                  return (
                    <div key={s.id} className="space-y-3 rounded-lg border p-3">
                      <div className="flex items-start gap-3">
                        <Checkbox id={`s-${s.id}`} className="mt-0.5" checked={!!marcado} onCheckedChange={(v) => alternar(s.id, v === true)} />
                        <Label htmlFor={`s-${s.id}`} className="flex-1 flex-col items-start gap-0.5">
                          <span>{s.nombre}</span>
                          {s.descripcion && <span className="text-xs font-normal text-muted-foreground">{s.descripcion}</span>}
                        </Label>
                        <div className="text-right">
                          <div className="text-sm font-medium">{precio === null ? "Sin precio fijo" : cop(precio)}</div>
                          {origen && <div className="text-xs text-muted-foreground">{origen}</div>}
                        </div>
                      </div>
                      {marcado && (
                        <div className="space-y-3 pl-7">
                          <Input
                            aria-label={`Opciones de ${s.nombre}`}
                            placeholder="Opciones: FOV, zona, adicionales (FaceScan, CS MAR, vías aéreas)"
                            value={marcado.opciones}
                            onChange={(e) => editar(s.id, { opciones: e.target.value })}
                          />
                          {usaDientes(s) && (
                            <div className="space-y-2">
                              <p className="text-xs text-muted-foreground">Dientes (FDI)</p>
                              <ToggleGroup type="multiple" variant="outline" size="sm" spacing={1} className="flex-wrap" value={marcado.dientes} onValueChange={(v) => editar(s.id, { dientes: v })}>
                                {CUADRANTES_FDI.map((q, i) => (
                                  <div key={i} className="flex gap-1">
                                    {q.map((d) => <ToggleGroupItem key={d} value={d} aria-label={`Diente ${d}`} className="w-9">{d}</ToggleGroupItem>)}
                                  </div>
                                ))}
                              </ToggleGroup>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}

        <Card>
          <CardHeader><CardTitle>Observaciones clínicas</CardTitle></CardHeader>
          <CardContent>
            <Textarea aria-label="Observaciones clínicas" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
          </CardContent>
        </Card>
      </div>

      <aside className="lg:sticky lg:top-4 lg:self-start">
        <Card>
          <CardHeader><CardTitle>Resumen</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {elegidos.length === 0 ? (
              <p className="text-muted-foreground">Aún no hay servicios seleccionados.</p>
            ) : (
              <ul className="space-y-1">
                {elegidos.map((s) => {
                  const { precio, origen } = aplicado(s);
                  return (
                    <li key={s.id} className="flex justify-between gap-2">
                      <span>
                        {s.nombre}
                        {origen && <span className="block text-xs text-muted-foreground">{origen}</span>}
                      </span>
                      <span className="text-muted-foreground">{cop(precio ?? 0)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex justify-between border-t pt-3 text-base font-semibold" aria-live="polite">
              <span>Total</span><span>{cop(total)}</span>
            </div>
            <Button className="w-full" disabled={pendiente || !pacienteId || elegidos.length === 0} onClick={guardar}>
              {pendiente && <Loader2 className="animate-spin" />} Crear orden
            </Button>
          </CardContent>
        </Card>
      </aside>

      {nuevo && (
        <PacienteRapido
          cerrar={() => setNuevo(false)}
          creado={(p) => {
            setPacientes((l) => (l.some((x) => x.id === p.id) ? l : [p, ...l]));
            setPacienteId(p.id);
            setNuevo(false);
          }}
        />
      )}
    </div>
  );
}

/** Texto de dónde sale el precio ("Tarifa Dr. X", "Convenio Y −10 %"); vacío si es el del catálogo. */
function etiquetaOrigen(o: OrigenPrecio, doctor: string | undefined, c: ConvenioOpcion | undefined) {
  if (o === "DOCTOR") return doctor ? `Tarifa ${/^dr[a]?\.?\s/i.test(doctor) ? doctor : `Dr. ${doctor}`}` : "Tu tarifa especial";
  if (o === "CONVENIO_TARIFA") return `Tarifa convenio ${c?.nombre}`;
  if (o === "CONVENIO_DESCUENTO") return `Convenio ${c?.nombre} −${c?.descuentoGeneral} %`;
  return "";
}

function PacienteRapido({ cerrar, creado }: { cerrar: () => void; creado: (p: PacienteOpcion) => void }) {
  const [pendiente, iniciar] = useTransition();
  const [tipo, setTipo] = useState("CC");
  return (
    <Dialog open onOpenChange={(o) => !o && cerrar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nuevo paciente</DialogTitle></DialogHeader>
        <form
          className="space-y-4"
          action={(fd) =>
            iniciar(async () => {
              const r = await crearPacienteRapido({
                tipoDocumento: tipo,
                numeroDocumento: String(fd.get("numeroDocumento")),
                nombre: String(fd.get("nombre")),
                celular: String(fd.get("celular")),
              });
              if ("error" in r) return void toast.error(r.error);
              creado(r.paciente);
            })
          }
        >
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["CC", "TI", "CE", "PA", "RC"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="numeroDocumento">Número de documento</Label>
              <Input id="numeroDocumento" name="numeroDocumento" required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre completo</Label>
            <Input id="nombre" name="nombre" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="celular">Celular</Label>
            <Input id="celular" name="celular" type="tel" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={cerrar}>Cancelar</Button>
            <Button type="submit" disabled={pendiente}>{pendiente ? "Guardando…" : "Crear paciente"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
