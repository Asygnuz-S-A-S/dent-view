"use client";

// Implementación independiente (sala limpia) a partir de docs/sala-limpia/02-consentimientos-y-proteccion-de-datos.md
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { registrarAutorizacion } from "@/app/(app)/proteccion-datos/actions";
import { ConfirmarAccion } from "@/components/comunes/confirmar-accion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FINALIDADES_SUGERIDAS, finalidadProcedimiento } from "@/lib/consentimientos";

export type RegistroAut = { id: string; tipo: string; finalidad: string; otorgada: boolean; fecha: string; texto: string | null; version: string | null };
type Orden = { id: string; numero: number };

export function Consentimientos({ pacienteId, registros, vigentes, ordenes }: { pacienteId: string; registros: RegistroAut[]; vigentes: Record<string, boolean>; ordenes: Orden[] }) {
  const [tipo, setTipo] = useState<"DATOS" | "PROCEDIMIENTO">("DATOS");
  const [finalidad, setFinalidad] = useState("");
  const [ordenId, setOrdenId] = useState("");
  const [texto, setTexto] = useState("");
  const [version, setVersion] = useState("v1");
  const [pendiente, iniciar] = useTransition();

  const enviar = (otorgada: boolean, f = finalidad, t = texto, tp = tipo, oid = ordenId || null) =>
    iniciar(async () => {
      const r = await registrarAutorizacion({ pacienteId, tipo: tp, finalidad: f, otorgada, textoMostrado: t, version, ordenId: oid });
      if (r.error) return void toast.error(r.error);
      toast.success(otorgada ? "Autorización registrada" : "Revocación registrada");
      if (otorgada) { setTexto(""); setFinalidad(""); }
    });
  const elegirOrden = (id: string) => {
    setOrdenId(id);
    const o = ordenes.find((x) => x.id === id);
    if (o) setFinalidad(finalidadProcedimiento(o.numero));
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Estado vigente</CardTitle></CardHeader>
        <CardContent>
          {Object.keys(vigentes).length === 0 ? <p className="text-sm text-muted-foreground">Sin autorizaciones registradas.</p> : (
            <ul className="space-y-2">
              {Object.entries(vigentes).map(([f, ok]) => (
                <li key={f} className="flex items-center justify-between gap-2 text-sm">
                  <span>{f}</span>
                  <span className="flex items-center gap-2">
                    <Badge variant={ok ? "default" : "destructive"}>{ok ? "Otorgada" : "Revocada"}</Badge>
                    {ok && (
                      <ConfirmarAccion titulo="¿Revocar esta autorización?" descripcion={`Se registrará que el paciente retiró su autorización para «${f}». El historial se conserva y la revocación queda con fecha y usuario.`} confirmar="Revocar" onConfirmar={() => enviar(false, f, "", "DATOS", null)}>
                        <Button size="sm" variant="outline" disabled={pendiente}>Revocar</Button>
                      </ConfirmarAccion>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Registrar autorización o consentimiento</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="aut-tipo">Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
                <SelectTrigger id="aut-tipo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DATOS">Tratamiento de datos personales</SelectItem>
                  <SelectItem value="PROCEDIMIENTO">Consentimiento del procedimiento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {tipo === "PROCEDIMIENTO" ? (
              <div className="grid gap-1.5">
                <Label htmlFor="aut-orden">Orden</Label>
                <Select value={ordenId} onValueChange={elegirOrden}>
                  <SelectTrigger id="aut-orden"><SelectValue placeholder="Selecciona una orden" /></SelectTrigger>
                  <SelectContent>{ordenes.map((o) => <SelectItem key={o.id} value={o.id}>Orden {String(o.numero).padStart(4, "0")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ) : (
              <div className="grid gap-1.5">
                <Label htmlFor="aut-fin">Finalidad</Label>
                <Input id="aut-fin" list="finalidades" value={finalidad} onChange={(e) => setFinalidad(e.target.value)} />
                <datalist id="finalidades">{FINALIDADES_SUGERIDAS.map((f) => <option key={f} value={f} />)}</datalist>
              </div>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="aut-texto">Texto exacto que se mostró al titular</Label>
            <Textarea id="aut-texto" rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} />
          </div>
          <div className="grid gap-1.5 sm:max-w-40">
            <Label htmlFor="aut-ver">Versión del texto</Label>
            <Input id="aut-ver" value={version} onChange={(e) => setVersion(e.target.value)} />
          </div>
          <div><Button disabled={pendiente || !finalidad.trim() || !texto.trim()} onClick={() => enviar(true)}>Registrar como otorgada</Button></div>
          <p className="text-xs text-muted-foreground">Los registros solo se agregan: nunca se modifican ni se borran.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Historial</CardTitle></CardHeader>
        <CardContent>
          {registros.length === 0 ? <p className="text-sm text-muted-foreground">Sin registros.</p> : (
            <ul className="space-y-2 text-sm">
              {registros.map((r) => (
                <li key={r.id} className="rounded-md border p-3">
                  <p><span className="font-medium">{r.finalidad}</span> · {r.otorgada ? "otorgada" : "revocada"} · {r.fecha}{r.version ? ` · ${r.version}` : ""}</p>
                  {r.texto && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{r.texto}</p>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
