"use client";

import { Pencil, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { cargarRipsPaciente, guardarPaciente, type DatosRipsPaciente } from "@/app/(app)/pacientes/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SEXOS, TIPOS_USUARIO, ZONAS } from "@/lib/catalogos/referencias-rips";
import { TIPOS_DOCUMENTO } from "@/lib/pacientes";

export type PacienteForm = {
  id: string;
  tipoDocumento: string;
  numeroDocumento: string;
  nombre: string;
  fechaNacimiento: string; // YYYY-MM-DD
  celular: string;
  correo: string;
  direccion: string;
  alertas: string;
  notas: string;
};

export function PacienteDialog({ paciente }: { paciente?: PacienteForm }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const vacio: DatosRipsPaciente = { sexo: "", codMunicipio: "", codPaisResidencia: "170", zonaTerritorial: "", tipoUsuarioDefecto: "", aseguradoraNit: "" };
  const [rips, setRips] = useState<DatosRipsPaciente>(vacio);
  const [ripsListo, setRipsListo] = useState(!paciente);
  const setR = (k: keyof DatosRipsPaciente, v: string) => setRips((r) => ({ ...r, [k]: v }));

  // En edición los datos RIPS se piden al abrir (la ficha no los envía).
  useEffect(() => {
    if (!abierto || !paciente) return;
    let activo = true;
    cargarRipsPaciente(paciente.id).then((d) => { if (activo && d) { setRips(d); setRipsListo(true); } });
    return () => { activo = false; };
  }, [abierto, paciente]);

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    setError(null);
    iniciar(async () => {
      const r = await guardarPaciente(datos);
      if ("error" in r) return setError(r.error);
      if ("existente" in r) {
        toast.info("Este paciente ya está registrado en el centro");
        router.push(`/pacientes/${r.existente}`);
        return setAbierto(false);
      }
      toast.success(paciente ? "Paciente actualizado" : "Paciente creado");
      setAbierto(false);
      if (!paciente) setRips(vacio);
      if (paciente) router.refresh();
      else router.push(`/pacientes/${r.id}`);
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={(o) => { setAbierto(o); if (!o && !paciente) setRips(vacio); /* alta: no arrastrar datos al siguiente */ }}>
      <DialogTrigger asChild>
        {paciente ? (
          <Button variant="outline" size="sm"><Pencil /> Editar</Button>
        ) : (
          <Button><UserPlus /> Nuevo paciente</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{paciente ? "Editar paciente" : "Nuevo paciente"}</DialogTitle>
          <DialogDescription>
            Si el documento ya existe en la plataforma, se vincula al centro sin duplicarlo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="grid gap-4 sm:grid-cols-2">
          {paciente && <input type="hidden" name="id" value={paciente.id} />}
          <div className="grid gap-2">
            <Label htmlFor="tipoDocumento">Tipo de documento</Label>
            {/* En edición el documento es la identidad de la persona: no se cambia. */}
            <Select name="tipoDocumento" defaultValue={paciente?.tipoDocumento ?? "CC"} disabled={!!paciente}>
              <SelectTrigger id="tipoDocumento" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS_DOCUMENTO.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            {paciente && <input type="hidden" name="tipoDocumento" value={paciente.tipoDocumento} />}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="numeroDocumento">Número de documento</Label>
            <Input id="numeroDocumento" name="numeroDocumento" required defaultValue={paciente?.numeroDocumento} readOnly={!!paciente} />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="nombre">Nombre completo</Label>
            <Input id="nombre" name="nombre" required defaultValue={paciente?.nombre} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="fechaNacimiento">Fecha de nacimiento</Label>
            <Input id="fechaNacimiento" name="fechaNacimiento" type="date" defaultValue={paciente?.fechaNacimiento} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="celular">Celular</Label>
            <Input id="celular" name="celular" type="tel" defaultValue={paciente?.celular} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="correo">Correo</Label>
            <Input id="correo" name="correo" type="email" defaultValue={paciente?.correo} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="direccion">Dirección</Label>
            <Input id="direccion" name="direccion" defaultValue={paciente?.direccion} />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="alertas">Alertas (alergias, embarazo, condiciones)</Label>
            <Textarea id="alertas" name="alertas" rows={2} defaultValue={paciente?.alertas} />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="notas">Notas</Label>
            <Textarea id="notas" name="notas" rows={2} defaultValue={paciente?.notas} />
          </div>
          <fieldset className="grid items-start gap-4 rounded-lg border p-3 sm:col-span-2 sm:grid-cols-2">
            <legend className="px-1 text-sm font-medium">Datos para RIPS (opcional)</legend>
            {ripsListo && <input type="hidden" name="ripsCargado" value="1" />}
            {([["sexo", "Sexo", SEXOS], ["zonaTerritorial", "Zona de residencia", ZONAS], ["tipoUsuarioDefecto", "Tipo de usuario habitual", TIPOS_USUARIO]] as const).map(([k, etiqueta, ops]) => (
              <div key={k} className="grid gap-2">
                <Label htmlFor={`rips-${k}`}>{etiqueta}</Label>
                <Select value={rips[k] || "_"} onValueChange={(v) => setR(k, v === "_" ? "" : v)} disabled={!ripsListo}>
                  <SelectTrigger id={`rips-${k}`} className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_">Sin definir</SelectItem>
                    {ops.map((o) => <SelectItem key={o.valor} value={o.valor}>{o.valor} · {o.etiqueta}</SelectItem>)}
                  </SelectContent>
                </Select>
                <input type="hidden" name={k} value={rips[k]} />
              </div>
            ))}
            <div className="grid gap-2">
              <Label htmlFor="codMunicipio">Municipio de residencia (DIVIPOLA)</Label>
              <Input id="codMunicipio" name="codMunicipio" inputMode="numeric" pattern="\d{5}" maxLength={5} placeholder="Ej. 11001" aria-describedby="ayuda-divipola" value={rips.codMunicipio} disabled={!ripsListo} onChange={(e) => setR("codMunicipio", e.target.value.replace(/\D/g, ""))} />
              <p id="ayuda-divipola" className="text-xs text-muted-foreground">Código de 5 dígitos del DANE (departamento + municipio). Bogotá: 11001.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="codPaisResidencia">País de residencia (código)</Label>
              <Input id="codPaisResidencia" name="codPaisResidencia" inputMode="numeric" maxLength={3} placeholder="170" value={rips.codPaisResidencia} disabled={!ripsListo} onChange={(e) => setR("codPaisResidencia", e.target.value.replace(/\D/g, ""))} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="aseguradoraNit">NIT de la aseguradora</Label>
              <Input id="aseguradoraNit" name="aseguradoraNit" value={rips.aseguradoraNit} disabled={!ripsListo} onChange={(e) => setR("aseguradoraNit", e.target.value)} />
            </div>
          </fieldset>
          {error && <p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p>}
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={pendiente || !ripsListo}>{pendiente ? "Guardando…" : "Guardar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
