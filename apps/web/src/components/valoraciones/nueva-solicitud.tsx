"use client";

import { Loader2, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { crearSolicitud, type Credenciales } from "@/app/(app)/valoraciones/actions";
import { PacienteCombobox, type PacienteOpcion } from "@/components/ordenes/paciente-combobox";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ANGULOS, CLAVES_PLANTILLA, INFO_ANGULO, PLANTILLAS_CAPTURA, enlaceWhatsapp, type Angulo, type PlantillaCaptura } from "@/lib/valoraciones";
import { CredencialesDialogo } from "./credenciales-dialogo";

export type PacienteContacto = PacienteOpcion & { correo: string; celular: string; ciudad: string };
type Inicial = { nombre: string; telefono: string; correo: string; ciudad: string; pacienteId: string; leadId: string };

/** `urlGuia`: página pública de la guía de captura; `fijarOdontologo`: el especialista se la asigna a sí mismo (no elige). */
export function NuevaSolicitud({ pacientes, odontologos, inicial, urlGuia, fijarOdontologo }: { pacientes: PacienteContacto[]; odontologos: { id: string; nombre: string }[]; inicial: Inicial; urlGuia: string; fijarOdontologo: boolean }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [f, setF] = useState({ nombre: inicial.nombre, telefono: inicial.telefono, correo: inicial.correo, ciudad: inicial.ciudad, motivo: "", doctorId: "" });
  const [pacienteId, setPacienteId] = useState(inicial.pacienteId);
  const [plantilla, setPlantilla] = useState<PlantillaCaptura>("REVISION");
  const [angulos, setAngulos] = useState<Angulo[]>([...PLANTILLAS_CAPTURA.REVISION.angulos]);
  const [creada, setCreada] = useState<{ id: string; credenciales: Credenciales } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  const elegirPlantilla = (k: PlantillaCaptura) => { setPlantilla(k); if (k !== "PERSONALIZADA") setAngulos([...PLANTILLAS_CAPTURA[k].angulos]); };
  const alternar = (a: Angulo, on: boolean) => { setPlantilla("PERSONALIZADA"); setAngulos((p) => (on ? ANGULOS.filter((x) => x === a || p.includes(x)) : p.filter((x) => x !== a))); };
  const guia = enlaceWhatsapp(f.telefono, `Hola, antes de tu valoración virtual mira esta guía para tomar buenas fotos y video: ${urlGuia}${plantilla === "PERSONALIZADA" ? "" : `?tipo=${plantilla}`}`);

  function elegirPaciente(id: string) {
    setPacienteId(id);
    const p = pacientes.find((x) => x.id === id);
    if (p) setF((x) => ({ ...x, nombre: p.nombre, correo: p.correo, telefono: p.celular, ciudad: p.ciudad }));
  }

  return (
    <>
      <Card>
        <CardContent>
          <form
            className="grid max-w-2xl gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              iniciar(async () => {
                const r = await crearSolicitud({ ...f, doctorId: fijarOdontologo ? undefined : f.doctorId || undefined, plantilla, angulos, pacienteId: pacienteId || undefined, leadId: inicial.leadId || undefined });
                if ("error" in r) return void toast.error(r.error);
                setCreada({ id: r.id, credenciales: r.credenciales });
              });
            }}
          >
            {!inicial.leadId && (
              <div className="grid gap-2">
                <Label htmlFor="paciente">Paciente existente (opcional)</Label>
                <PacienteCombobox id="paciente" pacientes={pacientes} value={pacienteId} onChange={elegirPaciente} />
                {pacienteId
                  ? <Button type="button" variant="link" size="sm" className="justify-self-start px-0" onClick={() => setPacienteId("")}>Quitar paciente (persona nueva)</Button>
                  : <p className="text-xs text-muted-foreground">Si es una persona nueva, se crea un contacto en el CRM con origen «Valoración virtual» (sin autorización de mercadeo).</p>}
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="nombre">Nombre</Label>
              <Input id="nombre" value={f.nombre} onChange={set("nombre")} autoComplete="off" required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="telefono">Teléfono / WhatsApp</Label>
                <Input id="telefono" type="tel" value={f.telefono} onChange={set("telefono")} autoComplete="off" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="correo">Correo</Label>
                <Input id="correo" type="email" value={f.correo} onChange={set("correo")} autoComplete="off" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="ciudad">Ciudad donde vive</Label>
                <Input id="ciudad" value={f.ciudad} onChange={set("ciudad")} autoComplete="off" />
              </div>
              {!fijarOdontologo && <div className="grid gap-2">
                <Label htmlFor="odontologo">Odontólogo asignado (opcional)</Label>
                <Select value={f.doctorId || "__ninguno"} onValueChange={(v) => setF((p) => ({ ...p, doctorId: v === "__ninguno" ? "" : v }))}>
                  <SelectTrigger id="odontologo" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ninguno">Sin asignar</SelectItem>
                    {odontologos.map((o) => <SelectItem key={o.id} value={o.id}>{o.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="motivo">Motivo de la consulta</Label>
              <Textarea id="motivo" value={f.motivo} onChange={set("motivo")} maxLength={500} required />
            </div>
            <div className="grid gap-3">
              <div className="grid gap-2 sm:max-w-xs">
                <Label htmlFor="tipo">Tipo de consulta</Label>
                <Select value={plantilla} onValueChange={(v) => elegirPlantilla(v as PlantillaCaptura)}>
                  <SelectTrigger id="tipo" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{CLAVES_PLANTILLA.map((k) => <SelectItem key={k} value={k}>{PLANTILLAS_CAPTURA[k].nombre}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <fieldset className="grid gap-1">
                <legend className="mb-1 text-sm font-medium">Tomas que se le sugieren al paciente</legend>
                <p className="text-xs text-muted-foreground">Son una sugerencia: el paciente puede subir otras y el mínimo sigue siendo 3 fotos. Sin ninguna marcada se piden todas.</p>
                <div className="grid gap-x-4 sm:grid-cols-2">
                  {ANGULOS.map((a) => (
                    <label key={a} className="flex min-h-10 items-center gap-2 text-sm">
                      <Checkbox checked={angulos.includes(a)} onCheckedChange={(c) => alternar(a, c === true)} />
                      {INFO_ANGULO[a].etiqueta}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pendiente}>{pendiente && <Loader2 className="animate-spin" />} Crear solicitud y generar enlace</Button>
              {guia && <Button asChild variant="outline"><a href={guia} target="_blank" rel="noopener noreferrer"><MessageCircle /> Enviar guía por WhatsApp</a></Button>}
            </div>
          </form>
        </CardContent>
      </Card>
      <CredencialesDialogo credenciales={creada?.credenciales ?? null} onCerrar={() => creada && router.push(`/valoraciones/${creada.id}`)} />
    </>
  );
}
