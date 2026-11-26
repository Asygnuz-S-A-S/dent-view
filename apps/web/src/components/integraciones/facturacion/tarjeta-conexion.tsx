"use client";

import { Copy, TriangleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { alternarConexionFe, eliminarConexionFe, guardarAjustesConexionFe, guardarConexionFe, probarConexionFe } from "@/app/(app)/integraciones/facturacion/actions";
import { ConfirmarAccion } from "@/components/comunes/confirmar-accion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type Modo = "SANDBOX" | "PRODUCCION";
type CampoConfig = { clave: string; etiqueta: string; ayuda?: string; tipo: "texto" | "numero" | "select"; opciones?: { valor: string; etiqueta: string }[]; opcional?: boolean };
type Props = {
  adaptador: { clave: string; nombre: string; descripcion: string; noProbado: boolean; simulado: boolean; bloqueadoProduccion: boolean; advertencia: string | null; campos: { clave: string; etiqueta: string; secreto: boolean; opcional?: boolean }[]; camposConfig: CampoConfig[]; tieneWebhook: boolean };
  // Nunca llegan credenciales al cliente: solo los últimos 4 caracteres y los ajustes no secretos.
  conexion: { id: string; modo: Modo; activa: boolean; documentos: number; ultimos: Record<string, string>; config: Record<string, string>; urlWebhook: string } | null;
};

export function TarjetaConexion({ adaptador, conexion }: Props) {
  const [valores, setValores] = useState<Record<string, string>>({});
  const [config, setConfig] = useState<Record<string, string>>({
    tratamientoIva: "EXCLUIDO",
    ...Object.fromEntries(adaptador.camposConfig.filter((c) => c.tipo === "select" && c.opciones?.[0]).map((c) => [c.clave, c.opciones![0]!.valor])), // el select muestra su primera opción: también debe viajar
    ...(conexion?.config ?? {}),
  });
  const [modo, setModo] = useState<Modo>(conexion?.modo ?? "SANDBOX");
  const [editando, setEditando] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const formulario = !conexion || editando;
  const completo = adaptador.campos.every((c) => c.opcional || valores[c.clave]?.trim()) && adaptador.camposConfig.every((c) => c.opcional || config[c.clave]?.trim());
  const copiar = (t: string) => navigator.clipboard.writeText(t).then(() => toast.success("Copiado"), () => toast.error("No se pudo copiar"));
  const resultado = (r: { error?: string }, ok: string): void => void (r.error ? toast.error(r.error) : toast.success(ok));

  const probar = () => iniciar(async () => {
    const r = await probarConexionFe({ proveedor: adaptador.clave, modo, conexionId: conexion && !editando ? conexion.id : undefined, llaves: valores, config });
    r.error ? toast.error(r.error) : toast.success(r.mensaje ?? "Conexión correcta");
  });
  const guardar = () => iniciar(async () => {
    const r = await guardarConexionFe({ proveedor: adaptador.clave, modo, llaves: valores, config });
    resultado(r, conexion ? "Credenciales actualizadas" : "Proveedor conectado");
    if (!r.error) { setEditando(false); setValores({}); }
  });
  const ajustes = (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`iva-${adaptador.clave}`}>Tratamiento tributario</Label>
        <Select value={config.tratamientoIva} onValueChange={(v) => setConfig({ ...config, tratamientoIva: v })}>
          <SelectTrigger id={`iva-${adaptador.clave}`} className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="EXCLUIDO">Servicios de salud sin IVA (excluidos)</SelectItem>
            <SelectItem value="IVA_19">IVA 19 % sobre el valor</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Por defecto sin IVA. Debe validarlo tu contador.</p>
      </div>
      {adaptador.camposConfig.map((c) => (
        <div key={c.clave} className="space-y-1.5">
          <Label htmlFor={`${adaptador.clave}-cfg-${c.clave}`}>{c.etiqueta}</Label>
          {c.tipo === "select" ? (
            <Select value={config[c.clave] ?? c.opciones?.[0]?.valor ?? ""} onValueChange={(v) => setConfig({ ...config, [c.clave]: v })}>
              <SelectTrigger id={`${adaptador.clave}-cfg-${c.clave}`} className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{c.opciones?.map((o) => <SelectItem key={o.valor} value={o.valor}>{o.etiqueta}</SelectItem>)}</SelectContent>
            </Select>
          ) : (
            <Input id={`${adaptador.clave}-cfg-${c.clave}`} inputMode={c.tipo === "numero" ? "numeric" : undefined} maxLength={200} value={config[c.clave] ?? ""} onChange={(e) => setConfig({ ...config, [c.clave]: e.target.value })} />
          )}
          {c.ayuda && <p className="text-xs text-muted-foreground">{c.ayuda}</p>}
        </div>
      ))}
    </div>
  );

  return (
    <Card data-conexion-fe={adaptador.clave}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="flex flex-wrap items-center gap-2">
            {adaptador.nombre}
            {adaptador.simulado ? <Badge variant="info">Simulado</Badge> : adaptador.noProbado && <Badge variant="warning">No probado</Badge>}
          </CardTitle>
          {conexion ? (
            <div className="flex items-center gap-2">
              <Label htmlFor={`activa-fe-${adaptador.clave}`} className="text-xs text-muted-foreground">{conexion.activa ? "Activa" : "Inactiva"}</Label>
              <Switch id={`activa-fe-${adaptador.clave}`} checked={conexion.activa} disabled={pendiente} onCheckedChange={(v) => iniciar(async () => resultado(await alternarConexionFe(conexion.id, v), v ? "Activada" : "Desactivada"))} />
            </div>
          ) : <Badge variant="outline">Sin configurar</Badge>}
        </div>
        <CardDescription>{adaptador.descripcion}</CardDescription>
        {adaptador.advertencia && (
          <p className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-pretty"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{adaptador.advertencia}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {formulario ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`modo-fe-${adaptador.clave}`}>Modo</Label>
              <Select value={modo} onValueChange={(v) => setModo(v as Modo)}>
                <SelectTrigger id={`modo-fe-${adaptador.clave}`} className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SANDBOX">Sandbox (pruebas)</SelectItem>
                  <SelectItem value="PRODUCCION" disabled={adaptador.bloqueadoProduccion}>Producción{adaptador.bloqueadoProduccion ? " (bloqueado)" : ""}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {adaptador.campos.map((c) => (
              <div key={c.clave} className="space-y-1.5">
                <Label htmlFor={`${adaptador.clave}-${c.clave}`}>{c.etiqueta}{c.opcional ? " (opcional)" : ""}</Label>
                <Input id={`${adaptador.clave}-${c.clave}`} type={c.secreto ? "password" : "text"} autoComplete="off" maxLength={500} value={valores[c.clave] ?? ""} onChange={(e) => setValores({ ...valores, [c.clave]: e.target.value })} placeholder={conexion ? `Actual: ${conexion.ultimos[c.clave] ?? "—"}` : ""} />
              </div>
            ))}
            {ajustes}
          </div>
        ) : conexion && (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Modo</dt><dd><Badge variant={conexion.modo === "PRODUCCION" ? "success" : "info"}>{conexion.modo === "PRODUCCION" ? "Producción" : "Sandbox"}</Badge></dd>
              {adaptador.campos.map((c) => (
                <div key={c.clave} className="col-span-2 grid grid-cols-subgrid"><dt className="text-muted-foreground">{c.etiqueta}</dt><dd className="font-mono text-xs">{conexion.ultimos[c.clave] ?? "—"}</dd></div>
              ))}
              <dt className="text-muted-foreground">Documentos emitidos</dt><dd>{conexion.documentos}</dd>
            </dl>
            {ajustes}
            <Button type="button" variant="outline" size="sm" disabled={pendiente} onClick={() => iniciar(async () => resultado(await guardarAjustesConexionFe(conexion.id, { modo: conexion.modo, config }), "Ajustes guardados"))}>Guardar ajustes</Button>
            {adaptador.tieneWebhook && (
              <div className="space-y-1.5 text-sm">
                <Label htmlFor={`url-fe-${adaptador.clave}`}>URL del webhook (pégala en el panel de {adaptador.nombre})</Label>
                <div className="flex gap-2">
                  <Input id={`url-fe-${adaptador.clave}`} readOnly value={conexion.urlWebhook} className="font-mono text-xs" />
                  <Button type="button" variant="outline" size="icon" aria-label="Copiar URL del webhook" onClick={() => copiar(conexion.urlWebhook)}><Copy /></Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        {formulario ? (
          <>
            <Button type="button" variant="outline" disabled={pendiente || !completo} onClick={probar}>Probar conexión</Button>
            <Button type="button" disabled={pendiente || !completo} onClick={guardar}>{conexion ? "Guardar credenciales nuevas" : "Guardar y conectar"}</Button>
            {editando && <Button type="button" variant="ghost" onClick={() => { setEditando(false); setValores({}); }}>Cancelar</Button>}
          </>
        ) : conexion && (
          <>
            <Button type="button" variant="outline" disabled={pendiente} onClick={probar}>Probar conexión</Button>
            <Button type="button" variant="outline" onClick={() => setEditando(true)}>Rotar credenciales</Button>
            <ConfirmarAccion titulo={`¿Eliminar ${adaptador.nombre}?`} descripcion="Se borran las credenciales guardadas. Solo se puede si no ha emitido documentos." confirmar="Eliminar" onConfirmar={() => iniciar(async () => resultado(await eliminarConexionFe(conexion.id), "Conexión eliminada"))}>
              <Button type="button" variant="destructive" disabled={pendiente}>Eliminar</Button>
            </ConfirmarAccion>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
