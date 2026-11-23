"use client";

import { MessageCircle, Pencil, UserCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { actualizarLead, agregarNota, completarTarea, convertirEnPaciente, crearTarea, fijarConsentimiento, fijarNoContactar, inscribirEnSecuencia, marcarPerdido, moverEtapa, registrarContacto } from "@/app/(app)/crm/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ETAPAS, ETIQUETA_ETAPA, ETIQUETA_ACTIVIDAD, TIPOS_CONTACTO, enlaceWhatsapp, type Etapa } from "@/lib/crm";
import { TIPOS_DOCUMENTO } from "@/lib/pacientes";
import { SelectNativo, useAccion } from "./comun";
import type { Responsable } from "./alta-lead";

export type DatosLead = {
  id: string; nombre: string; telefono: string | null; correo: string | null; ciudad: string | null; interes: string | null; etapa: Etapa;
  valorEstimado: number | null; responsableId: string | null; proximoContacto: string | null; noContactar: boolean; consentimientoMercadeo: boolean; pacienteId: string | null;
};
const Campo = ({ id, etiqueta, children }: { id: string; etiqueta: string; children: React.ReactNode }) => <div className="grid gap-1.5"><Label htmlFor={id}>{etiqueta}</Label>{children}</div>;

export function EditarLead({ lead, responsables }: { lead: DatosLead; responsables: Responsable[] }) {
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState({ nombre: lead.nombre, telefono: lead.telefono ?? "", correo: lead.correo ?? "", ciudad: lead.ciudad ?? "", interes: lead.interes ?? "", valorEstimado: lead.valorEstimado?.toString() ?? "", responsableId: lead.responsableId ?? "", proximoContacto: lead.proximoContacto ?? "" });
  const { pendiente, ejecutar } = useAccion(() => setAbierto(false));
  const c = (k: keyof typeof f) => ({ id: `ed-${k}`, value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value }) });
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild><Button variant="outline" size="sm"><Pencil /> Editar datos</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Datos del lead</DialogTitle><DialogDescription>Contacto, valor estimado, responsable y próxima fecha de contacto.</DialogDescription></DialogHeader>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); ejecutar(() => actualizarLead(lead.id, { ...f, valorEstimado: f.valorEstimado || null }), "Datos guardados"); }}>
          <div className="sm:col-span-2"><Campo id="ed-nombre" etiqueta="Nombre"><Input {...c("nombre")} required /></Campo></div>
          <Campo id="ed-telefono" etiqueta="Teléfono"><Input {...c("telefono")} inputMode="tel" /></Campo>
          <Campo id="ed-correo" etiqueta="Correo"><Input {...c("correo")} type="email" /></Campo>
          <Campo id="ed-ciudad" etiqueta="Ciudad"><Input {...c("ciudad")} /></Campo>
          <Campo id="ed-interes" etiqueta="Interés"><Input {...c("interes")} /></Campo>
          <Campo id="ed-valorEstimado" etiqueta="Valor estimado (COP)"><Input {...c("valorEstimado")} inputMode="numeric" /></Campo>
          <Campo id="ed-proximoContacto" etiqueta="Próximo contacto"><Input {...c("proximoContacto")} type="date" /></Campo>
          <div className="sm:col-span-2"><Campo id="ed-responsableId" etiqueta="Responsable"><SelectNativo {...c("responsableId")}><option value="">Sin responsable</option>{responsables.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}</SelectNativo></Campo></div>
          <Button type="submit" disabled={pendiente} className="sm:col-span-2">{pendiente ? "Guardando…" : "Guardar"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CambiarEtapa({ id, etapa }: { id: string; etapa: Etapa }) {
  const { pendiente, ejecutar } = useAccion();
  return (
    <div className="grid gap-1.5"><Label htmlFor="etapa-lead">Etapa</Label>
      <SelectNativo id="etapa-lead" value={etapa} disabled={pendiente} onChange={(e) => ejecutar(() => moverEtapa(id, e.target.value), "Etapa actualizada")}>
        {ETAPAS.map((e) => <option key={e} value={e} disabled={e === "PERDIDO"}>{ETIQUETA_ETAPA[e]}{e === "PERDIDO" ? " (usa «Marcar perdido»)" : ""}</option>)}
      </SelectNativo>
    </div>
  );
}

export function RegistrarContacto({ id }: { id: string }) {
  const [tipo, setTipo] = useState<(typeof TIPOS_CONTACTO)[number]>("LLAMADA");
  const [texto, setTexto] = useState("");
  const { pendiente, ejecutar } = useAccion(() => setTexto(""));
  return (
    <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); ejecutar(() => registrarContacto(id, { tipo, texto }), "Contacto registrado"); }}>
      <Campo id="contacto-tipo" etiqueta="Tipo de contacto"><SelectNativo id="contacto-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>{TIPOS_CONTACTO.map((t) => <option key={t} value={t}>{ETIQUETA_ACTIVIDAD[t]}</option>)}</SelectNativo></Campo>
      <Campo id="contacto-texto" etiqueta="¿Qué se habló?"><Input id="contacto-texto" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={1000} placeholder="Resumen breve (sin datos clínicos)" /></Campo>
      <Button type="submit" disabled={pendiente}>Registrar contacto</Button>
    </form>
  );
}

export function NotaForm({ id }: { id: string }) {
  const [texto, setTexto] = useState("");
  const { pendiente, ejecutar } = useAccion(() => setTexto(""));
  return (
    <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); ejecutar(() => agregarNota(id, texto), "Nota agregada"); }}>
      <Campo id="nota-texto" etiqueta="Nueva nota"><Input id="nota-texto" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={1000} required /></Campo>
      <Button type="submit" variant="secondary" disabled={pendiente}>Agregar nota</Button>
    </form>
  );
}

export function TareaForm({ id, responsables }: { id: string; responsables: Responsable[] }) {
  const [f, setF] = useState({ titulo: "", vence: "", asignadoId: "" });
  const { pendiente, ejecutar } = useAccion(() => setF({ titulo: "", vence: "", asignadoId: "" }));
  return (
    <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); ejecutar(() => crearTarea({ leadId: id, ...f }), "Tarea creada"); }}>
      <Campo id="tarea-titulo" etiqueta="Nueva tarea"><Input id="tarea-titulo" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} required maxLength={150} placeholder="p. ej. Llamar para agendar valoración" /></Campo>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id="tarea-vence" etiqueta="Vence"><Input id="tarea-vence" type="date" value={f.vence} onChange={(e) => setF({ ...f, vence: e.target.value })} /></Campo>
        <Campo id="tarea-asignado" etiqueta="Asignada a"><SelectNativo id="tarea-asignado" value={f.asignadoId} onChange={(e) => setF({ ...f, asignadoId: e.target.value })}><option value="">Sin asignar</option>{responsables.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}</SelectNativo></Campo>
      </div>
      <Button type="submit" variant="secondary" disabled={pendiente}>Crear tarea</Button>
    </form>
  );
}

export function TareaCheck({ id, titulo, hecha }: { id: string; titulo: string; hecha: boolean }) {
  const { pendiente, ejecutar } = useAccion();
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" className="size-4" checked={hecha} disabled={pendiente} onChange={(e) => ejecutar(() => completarTarea(id, e.target.checked))} aria-label={`Completar: ${titulo}`} />
      <span className={hecha ? "text-muted-foreground line-through" : ""}>{titulo}</span>
    </label>
  );
}

export function BotonWhatsapp({ telefono, nombre, centro }: { telefono: string | null; nombre: string; centro: string }) {
  const href = enlaceWhatsapp(telefono, `Hola ${nombre.split(/\s+/)[0]}, te escribimos de ${centro}. ¿Te puedo ayudar con tu consulta?`);
  if (!href) return <p className="text-sm text-muted-foreground">Sin un celular válido no se puede abrir WhatsApp.</p>;
  return (
    <div className="space-y-1">
      <Button asChild variant="outline" size="sm"><a href={href} target="_blank" rel="noopener noreferrer"><MessageCircle /> Escribir por WhatsApp</a></Button>
      <p className="text-xs text-muted-foreground">Abre WhatsApp con un mensaje prellenado; lo envías tú. Luego registra el contacto.</p>
    </div>
  );
}

export function Convertir({ id }: { id: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState({ tipoDocumento: "CC" as (typeof TIPOS_DOCUMENTO)[number], numeroDocumento: "" });
  const { pendiente, ejecutar } = useAccion();
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild><Button size="sm"><UserCheck /> Convertir en paciente</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Convertir en paciente</DialogTitle><DialogDescription>Se crea el paciente con los datos del lead (o se vincula si ya existe) y el lead pasa a «Ganado». Las secuencias de lead se detienen.</DialogDescription></DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); ejecutar(async () => { const r = await convertirEnPaciente(id, f); if (!r.error && r.pacienteId) router.push(`/pacientes/${r.pacienteId}`); return r; }, "Lead convertido"); }}>
          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            <Campo id="conv-tipo" etiqueta="Tipo"><SelectNativo id="conv-tipo" value={f.tipoDocumento} onChange={(e) => setF({ ...f, tipoDocumento: e.target.value as typeof f.tipoDocumento })}>{TIPOS_DOCUMENTO.map((t) => <option key={t}>{t}</option>)}</SelectNativo></Campo>
            <Campo id="conv-numero" etiqueta="Número de documento"><Input id="conv-numero" value={f.numeroDocumento} onChange={(e) => setF({ ...f, numeroDocumento: e.target.value })} required minLength={3} /></Campo>
          </div>
          <Button type="submit" disabled={pendiente}>{pendiente ? "Convirtiendo…" : "Convertir"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function Perdido({ id }: { id: string }) {
  const [motivo, setMotivo] = useState("");
  const { pendiente, ejecutar } = useAccion(() => setMotivo(""));
  return (
    <form id="perdido" className="grid gap-3" onSubmit={(e) => { e.preventDefault(); ejecutar(() => marcarPerdido(id, motivo), "Lead marcado como perdido"); }}>
      <Campo id="perdido-motivo" etiqueta="Motivo de pérdida"><Input id="perdido-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} required minLength={3} maxLength={200} placeholder="p. ej. Eligió otro centro por precio" /></Campo>
      <Button type="submit" variant="outline" disabled={pendiente}>Marcar perdido</Button>
    </form>
  );
}

export function Preferencias({ id, noContactar, consentimiento }: { id: string; noContactar: boolean; consentimiento: boolean }) {
  const { pendiente, ejecutar } = useAccion();
  return (
    <div className="space-y-2 text-sm">
      <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 size-4" checked={consentimiento} disabled={pendiente || noContactar} onChange={(e) => ejecutar(() => fijarConsentimiento(id, e.target.checked), "Consentimiento actualizado")} />
        <span>Aceptó recibir información comercial <span className="text-muted-foreground">(habilita los correos de mercadeo de las secuencias)</span></span></label>
      <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 size-4" checked={noContactar} disabled={pendiente} onChange={(e) => ejecutar(() => fijarNoContactar(id, e.target.checked), noContactar ? "Se quitó «no contactar»" : "Marcado como «no contactar»")} />
        <span>No contactar <span className="text-muted-foreground">(detiene todas las secuencias y bloquea los correos)</span></span></label>
    </div>
  );
}

export function InscribirSecuencia({ ref_, secuencias }: { ref_: { leadId?: string; pacienteId?: string }; secuencias: { id: string; nombre: string }[] }) {
  const [s, setS] = useState("");
  const { pendiente, ejecutar } = useAccion(() => setS(""));
  if (!secuencias.length) return <p className="text-sm text-muted-foreground">Aún no hay secuencias. <Link href="/crm/secuencias" className="underline">Crea o instala una</Link>.</p>;
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); ejecutar(() => inscribirEnSecuencia(s, ref_), "Inscrito en la secuencia"); }}>
      <div className="grid min-w-48 flex-1 gap-1.5"><Label htmlFor="insc-sec">Inscribir en una secuencia</Label>
        <SelectNativo id="insc-sec" value={s} onChange={(e) => setS(e.target.value)} required><option value="">Elige una secuencia</option>{secuencias.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</SelectNativo></div>
      <Button type="submit" variant="secondary" disabled={pendiente || !s}>Inscribir</Button>
    </form>
  );
}
