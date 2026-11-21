"use client";

import { RotateCw } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { reenviarEntrega } from "@/app/(app)/integraciones/webhooks/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fechaHoraCompleta } from "@/lib/fechas";

export type EntregaFila = {
  id: string; webhook: string; evento: string; estado: string; codigoRespuesta: number | null; intentos: number;
  error: string | null; creadoEn: Date; proximoIntento: Date; payload: unknown;
};

const VARIANTE = { ENTREGADO: "success", PENDIENTE: "warning", FALLIDO: "danger" } as const;
const TEXTO = { ENTREGADO: "Entregado", PENDIENTE: "Pendiente", FALLIDO: "Fallido" } as const;

export function EntregasWebhooks({ entregas }: { entregas: EntregaFila[] }) {
  const [ver, setVer] = useState<EntregaFila | null>(null);
  const [, iniciar] = useTransition();
  return (
    <Card className="py-0">
      <CardHeader className="pt-6"><CardTitle>Últimas entregas</CardTitle></CardHeader>
      <CardContent className="px-0 pb-2">
        {entregas.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Todavía no hay entregas. Usa “Enviar prueba” en un webhook.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Evento</TableHead>
                <TableHead>Webhook</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Intentos</TableHead>
                <TableHead>Error</TableHead>
                <TableHead className="pr-6 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entregas.map((e) => {
                const estado = e.estado as keyof typeof VARIANTE;
                return (
                  <TableRow key={e.id}>
                    <TableCell className="pl-6">
                      <code className="text-xs">{e.evento}</code>
                      <div className="text-xs text-muted-foreground">{fechaHoraCompleta(e.creadoEn)}</div>
                    </TableCell>
                    <TableCell className="text-sm">{e.webhook}</TableCell>
                    <TableCell>
                      <Badge variant={VARIANTE[estado] ?? "outline"}>{TEXTO[estado] ?? e.estado}</Badge>
                      {estado === "PENDIENTE" && e.intentos > 0 && <div className="text-xs text-muted-foreground">Reintento {fechaHoraCompleta(e.proximoIntento)}</div>}
                    </TableCell>
                    <TableCell className="text-sm">{e.codigoRespuesta ?? "—"}</TableCell>
                    <TableCell className="text-sm">{e.intentos}</TableCell>
                    <TableCell className="max-w-48 truncate text-xs text-muted-foreground" title={e.error ?? undefined}>{e.error ?? "—"}</TableCell>
                    <TableCell className="pr-6">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setVer(e)}>Payload</Button>
                        {estado !== "PENDIENTE" && (
                          <Button size="sm" variant="outline" onClick={() => iniciar(async () => {
                            const r = await reenviarEntrega(e.id);
                            if (r.error) toast.error(r.error); else toast.success("Entrega en cola");
                          })}><RotateCw /> Reenviar</Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {ver && (
        <Dialog open onOpenChange={(o) => !o && setVer(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader><DialogTitle>{ver.evento}</DialogTitle></DialogHeader>
            <p className="text-xs text-muted-foreground">Id de entrega (X-DentView-Delivery): <code>{ver.id}</code></p>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(ver.payload, null, 2)}</pre>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}
