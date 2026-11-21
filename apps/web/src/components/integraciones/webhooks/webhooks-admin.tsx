"use client";

import { Copy, KeyRound, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  cambiarWebhookActivo, crearWebhook, editarWebhook, eliminarWebhook, enviarPrueba, rotarSecreto, type EstadoWebhook,
} from "@/app/(app)/integraciones/webhooks/actions";
import { ConfirmarAccion } from "@/components/comunes/confirmar-accion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GRUPOS_EVENTOS } from "@/lib/webhooks-eventos";

export type WebhookFila = { id: string; nombre: string; url: string; eventos: string[]; activo: boolean; exito24h: number | null; entregas24h: number };

const copiar = (t: string) => navigator.clipboard.writeText(t).then(() => toast.success("Copiado"), () => toast.error("No se pudo copiar"));

export function WebhooksAdmin({ webhooks }: { webhooks: WebhookFila[] }) {
  const [editando, setEditando] = useState<WebhookFila | "nuevo" | null>(null);
  const [secreto, setSecreto] = useState<string | null>(null);
  const [, iniciar] = useTransition();
  const ejecutar = (f: () => Promise<{ error?: string; secreto?: string } | undefined>, ok: string) =>
    iniciar(async () => {
      const r = await f();
      if (r?.error) toast.error(r.error);
      else if (r?.secreto) setSecreto(r.secreto);
      else toast.success(ok);
    });
  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setEditando("nuevo")}><Plus /> Nuevo webhook</Button>
      </div>
      <Card className="py-0">
        <CardContent className="px-0">
          {webhooks.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">Aún no hay webhooks. Crea uno para recibir avisos de dent-view en tu sistema.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Webhook</TableHead>
                  <TableHead>Eventos</TableHead>
                  <TableHead>Éxito 24 h</TableHead>
                  <TableHead>Activo</TableHead>
                  <TableHead className="pr-6 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {webhooks.map((w) => (
                  <TableRow key={w.id} className={w.activo ? undefined : "opacity-60"}>
                    <TableCell className="pl-6">
                      <div className="font-medium">{w.nombre}</div>
                      <div className="max-w-xs truncate text-xs text-muted-foreground" title={w.url}>{w.url}</div>
                    </TableCell>
                    <TableCell className="text-sm">{w.eventos.includes("*") ? "Todos" : `${w.eventos.length} evento${w.eventos.length === 1 ? "" : "s"}`}</TableCell>
                    <TableCell className="text-sm">
                      {w.exito24h === null ? "—" : `${w.exito24h}%`}
                      {w.entregas24h > 0 && <span className="text-xs text-muted-foreground"> ({w.entregas24h})</span>}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={w.activo}
                        aria-label={`${w.activo ? "Desactivar" : "Activar"} ${w.nombre}`}
                        onCheckedChange={(v) => ejecutar(() => cambiarWebhookActivo(w.id, v), v ? "Webhook activado" : "Webhook desactivado: no recibirá eventos")}
                      />
                    </TableCell>
                    <TableCell className="pr-6">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" aria-label={`Enviar prueba a ${w.nombre}`} title="Enviar prueba" onClick={() => ejecutar(() => enviarPrueba(w.id), "Prueba en cola: aparece abajo en unos segundos")}><Send /></Button>
                        <Button size="icon" variant="ghost" aria-label={`Editar ${w.nombre}`} title="Editar" onClick={() => setEditando(w)}><Pencil /></Button>
                        <ConfirmarAccion titulo="¿Rotar el secreto?" descripcion="El secreto anterior deja de funcionar de inmediato: actualiza tu receptor con el nuevo." confirmar="Rotar" onConfirmar={() => ejecutar(() => rotarSecreto(w.id), "")}>
                          <Button size="icon" variant="ghost" aria-label={`Rotar secreto de ${w.nombre}`} title="Rotar secreto"><KeyRound /></Button>
                        </ConfirmarAccion>
                        <ConfirmarAccion titulo={`¿Eliminar "${w.nombre}"?`} descripcion="Se borra la suscripción y su registro de entregas. No se puede deshacer." confirmar="Eliminar" onConfirmar={() => ejecutar(() => eliminarWebhook(w.id), "Webhook eliminado")}>
                          <Button size="icon" variant="ghost" aria-label={`Eliminar ${w.nombre}`} title="Eliminar"><Trash2 /></Button>
                        </ConfirmarAccion>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {editando && <FormularioWebhook key={editando === "nuevo" ? "nuevo" : editando.id} webhook={editando === "nuevo" ? null : editando} cerrar={() => setEditando(null)} alSecreto={(s) => { setEditando(null); setSecreto(s); }} />}
      {secreto && (
        <Dialog open onOpenChange={(o) => !o && setSecreto(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Secreto de firma</DialogTitle>
              <DialogDescription>Cópialo ahora: no se vuelve a mostrar. Lo usas para verificar la cabecera X-DentView-Signature.</DialogDescription>
            </DialogHeader>
            <div className="flex gap-2">
              <Input readOnly value={secreto} aria-label="Secreto" className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" variant="outline" onClick={() => copiar(secreto)}><Copy /> Copiar</Button>
            </div>
            <DialogFooter><Button onClick={() => setSecreto(null)}>Ya lo guardé</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function FormularioWebhook({ webhook, cerrar, alSecreto }: { webhook: WebhookFila | null; cerrar: () => void; alSecreto: (s: string) => void }) {
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set(webhook?.eventos ?? []));
  // Controlados: React 19 vacía los campos no controlados tras cada envío, también cuando hay un error que corregir.
  const [nombre, setNombre] = useState(webhook?.nombre ?? "");
  const [url, setUrl] = useState(webhook?.url ?? "");
  const todos = seleccion.has("*");
  const [estado, setEstado] = useState<EstadoWebhook>();
  const [pendiente, iniciar] = useTransition();
  // Sin `action` de formulario: React lo reinicia tras cada envío (también los checkboxes de Radix) y se perdería lo escrito si hay un error.
  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    iniciar(async () => {
      const r = webhook ? await editarWebhook(webhook.id, undefined, fd) : await crearWebhook(undefined, fd);
      if (r?.secreto) alSecreto(r.secreto);
      else if (r?.ok) { toast.success("Webhook actualizado"); cerrar(); }
      else setEstado(r);
    });
  };
  const alternar = (e: string, v: boolean) => setSeleccion((s) => { const n = new Set(s); if (v) n.add(e); else n.delete(e); return n; });
  return (
    <Dialog open onOpenChange={(o) => !o && cerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{webhook ? "Editar webhook" : "Nuevo webhook"}</DialogTitle>
          <DialogDescription>dent-view envía un POST firmado a tu URL (https) cada vez que ocurre un evento elegido.</DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="wh-nombre">Nombre</Label>
            <Input id="wh-nombre" name="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={80} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wh-url">URL de destino</Label>
            <Input id="wh-url" name="url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://tu-sistema.com/dentview" required />
            <p className="text-xs text-muted-foreground">Solo https, sin usuario ni contraseña, puerto 443, 8443 u 8080. No se permiten direcciones internas.</p>
          </div>
          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-medium">Eventos</legend>
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox checked={todos} onCheckedChange={(v) => setSeleccion(v ? new Set(["*"]) : new Set())} /> Todos los eventos
            </label>
            {GRUPOS_EVENTOS.map((g) => (
              <div key={g.grupo} className="space-y-1.5">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{g.grupo}</div>
                {g.eventos.map((e) => (
                  <label key={e} className="flex items-center gap-2 text-sm">
                    <Checkbox disabled={todos} checked={todos || seleccion.has(e)} onCheckedChange={(v) => alternar(e, v === true)} />
                    <code className="text-xs">{e}</code>
                  </label>
                ))}
              </div>
            ))}
            {[...seleccion].map((e) => <input key={e} type="hidden" name="eventos" value={e} />)}
          </fieldset>
          {estado?.error && <p role="alert" className="text-sm text-destructive">{estado.error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={cerrar}>Cancelar</Button>
            <Button type="submit" disabled={pendiente}>{webhook ? "Guardar" : "Crear webhook"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
