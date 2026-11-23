"use client";

import { Loader2, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { enviarValoracion, guardarCuestionario, responderMensaje } from "@/app/valoracion/[token]/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CONSENTIMIENTO_TEXTO, CONSENTIMIENTO_VERSION, ETIQUETA_SINTOMA, faltaParaEnviar, type Cuestionario } from "@/lib/valoraciones";
import { CapturaGuiada, type MedioPaciente } from "./captura-guiada";

export type MensajePaciente = { id: string; autor: "PACIENTE" | "PROFESIONAL"; texto: string; solicitaMedia: string | null; fecha: string };
type Q = Partial<Cuestionario>;

/** Flujo del paciente en una sola página móvil: 1) consentimiento y cuestionario, 2) fotos y video guiados, 3) mensajes y envío. */
export function FormularioPaciente({ token, motivoInicial, cuestionario, consentido, medios: inicial, mensajes, pedidos }: {
  token: string; motivoInicial: string; cuestionario: Q | null; consentido: boolean; medios: MedioPaciente[]; mensajes: MensajePaciente[]; pedidos: string[];
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [q, setQ] = useState<Q>({ dolor: 0, sintomas: [], embarazo: "NA", ...cuestionario, motivo: cuestionario?.motivo ?? motivoInicial });
  const [acepto, setAcepto] = useState(consentido);
  const [guardado, setGuardado] = useState(consentido && !!cuestionario);
  const [medios, setMedios] = useState(inicial);
  const [respuesta, setRespuesta] = useState("");
  const sintomas = q.sintomas ?? [];
  const falta = faltaParaEnviar({ consentimiento: guardado && acepto, motivo: q.motivo ?? "", medios });

  const guardar = () => iniciar(async () => {
    const r = await guardarCuestionario(token, { dolor: q.dolor ?? 0, sintomas, desde: q.desde, alergias: q.alergias, medicamentos: q.medicamentos, embarazo: q.embarazo, motivo: q.motivo ?? "", acepto });
    if (r.error) return void toast.error(r.error);
    setGuardado(true);
    toast.success("Datos guardados");
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>1. Tus datos y tu consentimiento</CardTitle><CardDescription>Son pocas preguntas. Puedes salir y volver con el mismo enlace y código mientras no venza.</CardDescription></CardHeader>
        <CardContent>
          <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); guardar(); }}>
            <div className="grid gap-2">
              <Label htmlFor="motivo">¿Cuál es el motivo de tu consulta?</Label>
              <Textarea id="motivo" value={q.motivo ?? ""} onChange={(e) => setQ({ ...q, motivo: e.target.value })} maxLength={500} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dolor">Nivel de dolor: <span className="font-semibold tabular-nums">{q.dolor ?? 0}</span> de 10</Label>
              <input id="dolor" type="range" min={0} max={10} step={1} value={q.dolor ?? 0} onChange={(e) => setQ({ ...q, dolor: Number(e.target.value) })} className="h-8 w-full accent-primary" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="desde">¿Desde cuándo?</Label>
              <Input id="desde" value={q.desde ?? ""} onChange={(e) => setQ({ ...q, desde: e.target.value })} maxLength={120} placeholder="Ej.: hace 2 semanas" />
            </div>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">¿Qué sientes?</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(ETIQUETA_SINTOMA) as (keyof typeof ETIQUETA_SINTOMA)[]).map((s) => (
                  <label key={s} className="flex min-h-10 items-center gap-2 text-sm">
                    <Checkbox checked={sintomas.includes(s)} onCheckedChange={(c) => setQ({ ...q, sintomas: c === true ? [...sintomas, s] : sintomas.filter((x) => x !== s) })} />
                    {ETIQUETA_SINTOMA[s]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-2">
              <Label htmlFor="alergias">Alergias (medicamentos, anestesia, látex…)</Label>
              <Input id="alergias" value={q.alergias ?? ""} onChange={(e) => setQ({ ...q, alergias: e.target.value })} maxLength={300} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="medicamentos">Medicamentos que tomas</Label>
              <Input id="medicamentos" value={q.medicamentos ?? ""} onChange={(e) => setQ({ ...q, medicamentos: e.target.value })} maxLength={300} />
            </div>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">¿Estás en embarazo?</legend>
              <div className="flex flex-wrap gap-4 text-sm">
                {([["NA", "No aplica"], ["NO", "No"], ["SI", "Sí"]] as const).map(([v, t]) => (
                  <label key={v} className="flex min-h-10 items-center gap-2"><input type="radio" name="embarazo" value={v} checked={q.embarazo === v} onChange={() => setQ({ ...q, embarazo: v })} className="size-4 accent-primary" />{t}</label>
                ))}
              </div>
            </fieldset>
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <p className="text-sm font-medium">Autorización de tratamiento de datos <span className="font-normal text-muted-foreground">(versión {CONSENTIMIENTO_VERSION})</span></p>
              <div className="space-y-2 text-sm text-muted-foreground">{CONSENTIMIENTO_TEXTO.map((t) => <p key={t}>{t}</p>)}</div>
              <label className="flex items-start gap-2 text-sm font-medium">
                <Checkbox checked={acepto} disabled={consentido} onCheckedChange={(c) => setAcepto(c === true)} className="mt-0.5" aria-label="Acepto el tratamiento de mis datos de salud e imágenes" />
                Acepto el tratamiento de mis datos de salud e imágenes para esta valoración.
              </label>
            </div>
            <Button type="submit" size="lg" disabled={pendiente || !acepto || !(q.motivo ?? "").trim()}>{pendiente && <Loader2 className="animate-spin" />} {guardado ? "Actualizar datos" : "Guardar y continuar"}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>2. Fotos y video</CardTitle><CardDescription>Busca buena luz. Sube al menos 3 fotos; mientras más ángulos, mejor valoración.</CardDescription></CardHeader>
        <CardContent>
          {guardado ? <CapturaGuiada token={token} medios={medios} onMedios={setMedios} pedidos={pedidos} editable />
            : <p className="text-sm text-muted-foreground">Guarda primero tus datos y tu consentimiento para poder subir fotos.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>3. Mensajes y envío</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {mensajes.length > 0 && (
            <ul className="space-y-2" aria-label="Mensajes con el odontólogo">
              {mensajes.map((m) => (
                <li key={m.id} className={`max-w-[90%] rounded-lg border p-3 text-sm ${m.autor === "PACIENTE" ? "ml-auto bg-primary/5" : "bg-muted/40"}`}>
                  <p className="text-xs text-muted-foreground">{m.autor === "PACIENTE" ? "Tú" : "Odontólogo"} · {m.fecha}</p>
                  <p className="mt-1 whitespace-pre-wrap break-words">{m.texto}</p>
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-2">
            <Label htmlFor="respuesta">{mensajes.length ? "Responder al odontólogo (opcional)" : "¿Algo más que quieras contarnos? (opcional)"}</Label>
            <Textarea id="respuesta" value={respuesta} onChange={(e) => setRespuesta(e.target.value)} maxLength={1000} />
            {respuesta.trim() && <Button type="button" variant="outline" className="justify-self-start" disabled={pendiente} onClick={() => iniciar(async () => {
              const r = await responderMensaje(token, respuesta);
              if (r.error) return void toast.error(r.error);
              setRespuesta(""); toast.success("Mensaje enviado"); router.refresh();
            })}>Enviar mensaje</Button>}
          </div>
          {falta && <p className="text-sm text-muted-foreground" role="status">{falta}</p>}
          <Button type="button" size="lg" className="w-full" disabled={pendiente || !!falta} onClick={() => iniciar(async () => {
            const r = await enviarValoracion(token);
            if (r.error) return void toast.error(r.error);
            router.refresh();
          })}>{pendiente ? <Loader2 className="animate-spin" /> : <Send />} Enviar valoración</Button>
        </CardContent>
      </Card>
    </div>
  );
}
