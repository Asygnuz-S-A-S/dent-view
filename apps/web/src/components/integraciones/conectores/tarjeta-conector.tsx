"use client";

import { Copy, RefreshCw, TriangleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { actualizarCredenciales, alternarIntegracion, crearIntegracion, eliminarIntegracion, probarConexion, rotarSecretoEntrada, sincronizarAhora } from "@/app/(app)/integraciones/conectores/actions";
import { ConfirmarAccion } from "@/components/comunes/confirmar-accion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { fechaHoraCompleta } from "@/lib/fechas";

type Props = {
  adaptador: { clave: string; nombre: string; descripcion: string; verificado: boolean; advertencia: string | null; campos: { clave: string; etiqueta: string; secreto: boolean }[] };
  // Nunca llegan credenciales al cliente: solo el hecho de que existen.
  integracion: { id: string; activa: boolean; ultimaSync: string | null; estadoSync: string | null; errorSync: string | null; vinculados: number; urlEntrada: string | null } | null;
};

export function TarjetaConector({ adaptador, integracion }: Props) {
  const [valores, setValores] = useState<Record<string, string>>({});
  const [secreto, setSecreto] = useState<string | null>(null); // se muestra una sola vez
  const [editando, setEditando] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const formulario = !integracion || editando;
  const copiar = (t: string) => navigator.clipboard.writeText(t).then(() => toast.success("Copiado"), () => toast.error("No se pudo copiar"));
  const resultado = (r: { error?: string }, ok: string): void => void (r.error ? toast.error(r.error) : toast.success(ok));

  const probar = () => iniciar(async () => {
    const r = await probarConexion({ proveedor: adaptador.clave, integracionId: integracion && !editando ? integracion.id : undefined, credenciales: valores });
    r.error ? toast.error(r.error) : toast.success(r.mensaje ?? "Conexión correcta");
  });
  const guardar = () => iniciar(async () => {
    if (integracion) {
      const r = await actualizarCredenciales({ id: integracion.id, credenciales: valores });
      resultado(r, "Credenciales actualizadas");
      if (!r.error) { setEditando(false); setValores({}); }
    } else {
      const r = await crearIntegracion({ proveedor: adaptador.clave, credenciales: valores });
      resultado(r, "Conexión guardada");
      if (!r.error) { setSecreto(r.secretoEntrada ?? null); setValores({}); }
    }
  });
  const sincronizar = () => iniciar(async () => {
    const r = await sincronizarAhora(integracion!.id);
    r.error ? toast.error(r.error) : toast.success(`Sincronizado: ${r.resumen}`);
  });
  const rotar = () => iniciar(async () => {
    const r = await rotarSecretoEntrada(integracion!.id);
    r.error ? toast.error(r.error) : setSecreto(r.secretoEntrada ?? null);
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle>{adaptador.nombre}</CardTitle>
          {integracion ? (
            <div className="flex items-center gap-2">
              <Label htmlFor={`activa-${adaptador.clave}`} className="text-xs text-muted-foreground">{integracion.activa ? "Activa" : "Inactiva"}</Label>
              <Switch id={`activa-${adaptador.clave}`} checked={integracion.activa} disabled={pendiente} onCheckedChange={(v) => iniciar(async () => resultado(await alternarIntegracion(integracion.id, v), v ? "Activada" : "Desactivada"))} />
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
            {adaptador.campos.map((c) => (
              <div key={c.clave} className="space-y-1.5">
                <Label htmlFor={`${adaptador.clave}-${c.clave}`}>{c.etiqueta}</Label>
                <Input id={`${adaptador.clave}-${c.clave}`} type={c.secreto ? "password" : "text"} autoComplete="off" maxLength={500} value={valores[c.clave] ?? ""} onChange={(e) => setValores({ ...valores, [c.clave]: e.target.value })} placeholder={integracion ? "Escribe el nuevo valor" : ""} />
              </div>
            ))}
          </div>
        ) : integracion && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Credenciales</dt><dd>Configuradas ✓</dd>
            <dt className="text-muted-foreground">Estado</dt>
            <dd>{integracion.estadoSync === "OK" ? <Badge>Correcta</Badge> : integracion.estadoSync === "ERROR" ? <Badge variant="destructive">Con error</Badge> : <Badge variant="outline">Sin sincronizar</Badge>}</dd>
            <dt className="text-muted-foreground">Última sincronización</dt><dd>{fechaHoraCompleta(integracion.ultimaSync ? new Date(integracion.ultimaSync) : null)}</dd>
            <dt className="text-muted-foreground">Registros vinculados</dt><dd>{integracion.vinculados}</dd>
          </dl>
        )}
        {integracion && !formulario && integracion.errorSync && <p role="alert" className="text-sm text-destructive">{integracion.errorSync}</p>}
        {integracion?.urlEntrada && !formulario && (
          <div className="space-y-1.5 text-sm">
            <Label>Webhook de entrada (el proveedor nos avisa de cambios)</Label>
            <div className="flex gap-2">
              <Input readOnly value={integracion.urlEntrada} aria-label="URL del webhook de entrada" />
              <Button type="button" variant="outline" size="icon" aria-label="Copiar URL" onClick={() => copiar(integracion.urlEntrada!)}><Copy /></Button>
            </div>
            <p className="text-xs text-muted-foreground">Firma cada petición con HMAC-SHA256 del texto «marca.cuerpo» (cabeceras x-dentview-timestamp y x-dentview-signature).</p>
          </div>
        )}
        {secreto && (
          <div role="status" className="space-y-1.5 rounded-md border bg-muted/50 p-3 text-sm">
            <p className="font-medium">Secreto de firma del webhook de entrada</p>
            <p className="text-xs text-muted-foreground">Cópialo ahora: no se vuelve a mostrar.</p>
            <div className="flex gap-2">
              <Input readOnly value={secreto} aria-label="Secreto del webhook de entrada" className="font-mono text-xs" />
              <Button type="button" variant="outline" size="icon" aria-label="Copiar secreto" onClick={() => copiar(secreto)}><Copy /></Button>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSecreto(null)}>Ya lo guardé</Button>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        {formulario ? (
          <>
            <Button type="button" variant="outline" disabled={pendiente} onClick={probar}>Probar conexión</Button>
            <Button type="button" disabled={pendiente || adaptador.campos.some((c) => !valores[c.clave]?.trim())} onClick={guardar}>{integracion ? "Guardar cambios" : "Guardar y conectar"}</Button>
            {editando && <Button type="button" variant="ghost" onClick={() => { setEditando(false); setValores({}); }}>Cancelar</Button>}
          </>
        ) : integracion && (
          <>
            <Button type="button" disabled={pendiente || !integracion.activa} onClick={sincronizar}><RefreshCw /> Sincronizar ahora</Button>
            <Button type="button" variant="outline" disabled={pendiente} onClick={probar}>Probar conexión</Button>
            <Button type="button" variant="outline" onClick={() => setEditando(true)}>Cambiar credenciales</Button>
            <ConfirmarAccion titulo="¿Generar un secreto nuevo?" descripcion="El secreto actual dejará de funcionar y el proveedor deberá usar el nuevo." confirmar="Generar" onConfirmar={rotar}>
              <Button type="button" variant="outline" disabled={pendiente}>Rotar secreto</Button>
            </ConfirmarAccion>
            <ConfirmarAccion titulo={`¿Eliminar la conexión con ${adaptador.nombre}?`} descripcion="Se borran las credenciales y los vínculos con el sistema externo. Los pacientes y citas ya importados se conservan." confirmar="Eliminar" onConfirmar={() => iniciar(async () => resultado(await eliminarIntegracion(integracion.id), "Conexión eliminada"))}>
              <Button type="button" variant="destructive" disabled={pendiente}>Eliminar</Button>
            </ConfirmarAccion>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
