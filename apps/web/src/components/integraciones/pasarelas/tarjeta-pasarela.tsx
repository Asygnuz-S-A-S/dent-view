"use client";

import { Copy, RefreshCw, TriangleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { alternarPasarela, conciliarPasarelas, eliminarPasarela, guardarPasarela, probarPasarela } from "@/app/(app)/integraciones/pasarelas/actions";
import { ConfirmarAccion } from "@/components/comunes/confirmar-accion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type Modo = "SANDBOX" | "PRODUCCION";
type Props = {
  adaptador: { clave: string; nombre: string; descripcion: string; noProbado: boolean; advertencia: string | null; campos: { clave: string; etiqueta: string; secreto: boolean }[] };
  // Nunca llegan llaves al cliente: solo los últimos 4 caracteres de cada una.
  pasarela: { id: string; modo: Modo; activa: boolean; links: number; ultimos: Record<string, string>; urlWebhook: string } | null;
};

export function BotonConciliar() {
  const [pendiente, iniciar] = useTransition();
  return (
    <Button type="button" variant="outline" disabled={pendiente} onClick={() => iniciar(async () => {
      const r = await conciliarPasarelas();
      r.error ? toast.error(r.error) : toast.success(`Conciliación: ${r.resumen}`);
    })}><RefreshCw /> Conciliar links pendientes</Button>
  );
}

export function TarjetaPasarela({ adaptador, pasarela }: Props) {
  const [valores, setValores] = useState<Record<string, string>>({});
  const [modo, setModo] = useState<Modo>(pasarela?.modo ?? "SANDBOX");
  const [editando, setEditando] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const formulario = !pasarela || editando;
  const completo = adaptador.campos.every((c) => valores[c.clave]?.trim());
  const copiar = (t: string) => navigator.clipboard.writeText(t).then(() => toast.success("Copiado"), () => toast.error("No se pudo copiar"));
  const resultado = (r: { error?: string }, ok: string): void => void (r.error ? toast.error(r.error) : toast.success(ok));

  const probar = () => iniciar(async () => {
    const r = await probarPasarela({ proveedor: adaptador.clave, modo, pasarelaId: pasarela && !editando ? pasarela.id : undefined, llaves: valores });
    r.error ? toast.error(r.error) : toast.success(r.mensaje ?? "Conexión correcta");
  });
  const guardar = () => iniciar(async () => {
    const r = await guardarPasarela({ proveedor: adaptador.clave, modo, llaves: valores });
    resultado(r, pasarela ? "Llaves actualizadas" : "Pasarela conectada");
    if (!r.error) { setEditando(false); setValores({}); }
  });

  return (
    <Card data-pasarela={adaptador.clave}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="flex flex-wrap items-center gap-2">{adaptador.nombre}{adaptador.noProbado && <Badge variant="warning">No probado</Badge>}</CardTitle>
          {pasarela ? (
            <div className="flex items-center gap-2">
              <Label htmlFor={`activa-${adaptador.clave}`} className="text-xs text-muted-foreground">{pasarela.activa ? "Activa" : "Inactiva"}</Label>
              <Switch id={`activa-${adaptador.clave}`} checked={pasarela.activa} disabled={pendiente} onCheckedChange={(v) => iniciar(async () => resultado(await alternarPasarela(pasarela.id, v), v ? "Activada" : "Desactivada"))} />
            </div>
          ) : <Badge variant="outline">Sin configurar</Badge>}
        </div>
        <CardDescription>{adaptador.descripcion}</CardDescription>
        {adaptador.advertencia && (
          <p className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-pretty">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {adaptador.advertencia}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {formulario ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`modo-${adaptador.clave}`}>Modo</Label>
              <Select value={modo} onValueChange={(v) => setModo(v as Modo)}>
                <SelectTrigger id={`modo-${adaptador.clave}`} className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SANDBOX">Sandbox (pruebas)</SelectItem>
                  <SelectItem value="PRODUCCION" disabled={adaptador.noProbado}>Producción{adaptador.noProbado ? " (bloqueado: no probado)" : ""}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {adaptador.campos.map((c) => (
              <div key={c.clave} className="space-y-1.5">
                <Label htmlFor={`${adaptador.clave}-${c.clave}`}>{c.etiqueta}</Label>
                <Input id={`${adaptador.clave}-${c.clave}`} type="password" autoComplete="off" maxLength={500} value={valores[c.clave] ?? ""} onChange={(e) => setValores({ ...valores, [c.clave]: e.target.value })} placeholder={pasarela ? `Actual: ${pasarela.ultimos[c.clave] ?? "—"}` : ""} />
              </div>
            ))}
          </div>
        ) : pasarela && (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Modo</dt><dd><Badge variant={pasarela.modo === "PRODUCCION" ? "success" : "info"}>{pasarela.modo === "PRODUCCION" ? "Producción" : "Sandbox"}</Badge></dd>
              {adaptador.campos.map((c) => (
                <div key={c.clave} className="col-span-2 grid grid-cols-subgrid"><dt className="text-muted-foreground">{c.etiqueta}</dt><dd className="font-mono text-xs">{pasarela.ultimos[c.clave] ?? "—"}</dd></div>
              ))}
              <dt className="text-muted-foreground">Links generados</dt><dd>{pasarela.links}</dd>
            </dl>
            <div className="space-y-1.5 text-sm">
              <Label htmlFor={`url-${adaptador.clave}`}>URL del webhook (pégala en el panel de {adaptador.nombre})</Label>
              <div className="flex gap-2">
                <Input id={`url-${adaptador.clave}`} readOnly value={pasarela.urlWebhook} className="font-mono text-xs" />
                <Button type="button" variant="outline" size="icon" aria-label="Copiar URL del webhook" onClick={() => copiar(pasarela.urlWebhook)}><Copy /></Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        {formulario ? (
          <>
            <Button type="button" variant="outline" disabled={pendiente || !completo} onClick={probar}>Probar conexión</Button>
            <Button type="button" disabled={pendiente || !completo} onClick={guardar}>{pasarela ? "Guardar llaves nuevas" : "Guardar y conectar"}</Button>
            {editando && <Button type="button" variant="ghost" onClick={() => { setEditando(false); setValores({}); }}>Cancelar</Button>}
          </>
        ) : pasarela && (
          <>
            <Button type="button" variant="outline" disabled={pendiente} onClick={probar}>Probar conexión</Button>
            <Button type="button" variant="outline" onClick={() => setEditando(true)}>Rotar llaves</Button>
            <ConfirmarAccion titulo={`¿Eliminar ${adaptador.nombre}?`} descripcion="Se borran las llaves guardadas. Solo se puede si no hay links de pago generados." confirmar="Eliminar" onConfirmar={() => iniciar(async () => resultado(await eliminarPasarela(pasarela.id), "Pasarela eliminada"))}>
              <Button type="button" variant="destructive" disabled={pendiente}>Eliminar</Button>
            </ConfirmarAccion>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
