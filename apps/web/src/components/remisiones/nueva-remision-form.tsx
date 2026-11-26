"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { crearRemision } from "@/app/(app)/remisiones/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ALCANCES, ETIQUETA_ALCANCE, type Alcance } from "@/lib/remisiones";

export function NuevaRemisionForm({ pacienteId, destinos, textoConsentimiento }: {
  pacienteId: string; destinos: { id: string; nombre: string }[]; textoConsentimiento: string;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [destinoId, setDestinoId] = useState(destinos.length === 1 ? destinos[0]!.id : "");
  const [motivo, setMotivo] = useState("");
  const [estudios, setEstudios] = useState("");
  const [alcance, setAlcance] = useState<Alcance[]>(["IDENTIFICACION"]);
  const [embarazo, setEmbarazo] = useState(false);
  const [autorizado, setAutorizado] = useState(false);

  const alternar = (a: Alcance, on: boolean) => setAlcance((p) => (on ? [...p, a] : p.filter((x) => x !== a)));
  const enviar = () =>
    iniciar(async () => {
      const r = await crearRemision({ pacienteId, destinoId, motivo, estudiosSolicitados: estudios, alcance, embarazo: alcance.includes("EMBARAZO") ? embarazo : undefined, autorizado: autorizado as true });
      if (r.error || !r.id) return void toast.error(r.error ?? "No se pudo enviar");
      toast.success("Remisión enviada");
      router.push(`/remisiones/${r.id}`);
    });

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader><CardTitle>Remisión</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="destino">Centro destino</Label>
            <Select value={destinoId} onValueChange={setDestinoId}>
              <SelectTrigger id="destino" className="w-full"><SelectValue placeholder="Selecciona un centro" /></SelectTrigger>
              <SelectContent>{destinos.map((d) => <SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="motivo">Motivo de la remisión</Label>
            <Textarea id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={1000} rows={3} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="estudios">Estudios solicitados</Label>
            <Textarea id="estudios" value={estudios} onChange={(e) => setEstudios(e.target.value)} maxLength={1000} rows={3} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Datos del paciente que se comparten</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {ALCANCES.map((a) => (
            <div key={a} className="flex items-center gap-2">
              <Checkbox id={`alcance-${a}`} checked={alcance.includes(a)} disabled={a === "IDENTIFICACION"} onCheckedChange={(v) => alternar(a, v === true)} />
              <Label htmlFor={`alcance-${a}`}>{ETIQUETA_ALCANCE[a]}{a === "IDENTIFICACION" && " (obligatorio)"}</Label>
            </div>
          ))}
          {alcance.includes("EMBARAZO") && (
            <div className="flex items-center gap-2 pl-6">
              <Checkbox id="embarazo" checked={embarazo} onCheckedChange={(v) => setEmbarazo(v === true)} />
              <Label htmlFor="embarazo">La paciente está o puede estar embarazada</Label>
            </div>
          )}
          <p className="rounded-lg border bg-muted/40 p-3 text-sm text-pretty text-muted-foreground">{textoConsentimiento}</p>
          <div className="flex items-start gap-2">
            <Checkbox id="autorizado" checked={autorizado} onCheckedChange={(v) => setAutorizado(v === true)} className="mt-0.5" />
            <Label htmlFor="autorizado" className="text-pretty">El paciente autorizó expresamente compartir estos datos con el centro destino.</Label>
          </div>
        </CardContent>
      </Card>

      <Button onClick={enviar} disabled={pendiente || !autorizado || !destinoId || !motivo.trim() || !estudios.trim()}>
        {pendiente && <Loader2 className="animate-spin" />} Enviar remisión
      </Button>
    </div>
  );
}
