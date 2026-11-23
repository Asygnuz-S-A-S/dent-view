"use client";

import { Loader2, Send } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { enviarMensajeProfesional, type Credenciales } from "@/app/(app)/valoraciones/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ANGULOS, INFO_ANGULO, type Angulo } from "@/lib/valoraciones";
import { CredencialesDialogo } from "./credenciales-dialogo";

export type MensajeVista = { id: string; autor: "PACIENTE" | "PROFESIONAL"; nombre: string; texto: string; solicitaMedia: string | null; fecha: string };

/** Hilo con el paciente; el profesional puede pedir una foto concreta (el paciente la sube desde su enlace). */
export function MensajesValoracion({ valoracionId, mensajes, puedeEscribir }: { valoracionId: string; mensajes: MensajeVista[]; puedeEscribir: boolean }) {
  const [texto, setTexto] = useState("");
  const [angulo, setAngulo] = useState("__ninguna");
  const [pendiente, iniciar] = useTransition();
  const [creds, setCreds] = useState<Credenciales | null>(null);
  return (
    <div className="space-y-4">
      {mensajes.length === 0 ? <p className="text-sm text-muted-foreground">Sin mensajes todavía.</p> : (
        <ul className="space-y-2" aria-label="Mensajes">
          {mensajes.map((m) => (
            <li key={m.id} className={`max-w-[85%] rounded-lg border p-3 text-sm ${m.autor === "PROFESIONAL" ? "ml-auto bg-primary/5" : "bg-muted/40"}`}>
              <p className="text-xs text-muted-foreground">{m.nombre} · {m.fecha}</p>
              <p className="mt-1 whitespace-pre-wrap break-words">{m.texto}</p>
              {m.solicitaMedia && <p className="mt-1 text-xs font-medium">Foto pedida: {INFO_ANGULO[m.solicitaMedia as Angulo]?.etiqueta ?? m.solicitaMedia}</p>}
            </li>
          ))}
        </ul>
      )}
      {puedeEscribir && (
        <form className="grid gap-3" onSubmit={(e) => {
          e.preventDefault();
          iniciar(async () => {
            const r = await enviarMensajeProfesional(valoracionId, { texto, solicitaMedia: angulo === "__ninguna" ? undefined : (angulo as Angulo) });
            if ("error" in r) return void toast.error(r.error);
            setTexto(""); setAngulo("__ninguna"); setCreds(r.credenciales);
          });
        }}>
          <div className="grid gap-2">
            <Label htmlFor="mensaje">Mensaje al paciente</Label>
            <Textarea id="mensaje" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={1000} placeholder="Aclara algo o pide una foto más" />
          </div>
          <div className="grid gap-2 sm:max-w-xs">
            <Label htmlFor="pedir-foto">Pedir una foto concreta (opcional)</Label>
            <Select value={angulo} onValueChange={setAngulo}>
              <SelectTrigger id="pedir-foto" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__ninguna">Ninguna</SelectItem>
                {ANGULOS.map((a) => <SelectItem key={a} value={a}>{INFO_ANGULO[a].etiqueta}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">Al enviar, la valoración pasa a «Requiere más información» y el paciente recibe un acceso nuevo por correo.</p>
          <Button type="submit" disabled={pendiente || !texto.trim()} className="justify-self-start">{pendiente ? <Loader2 className="animate-spin" /> : <Send />} Enviar al paciente</Button>
        </form>
      )}
      <CredencialesDialogo credenciales={creds} onCerrar={() => setCreds(null)} />
    </div>
  );
}
