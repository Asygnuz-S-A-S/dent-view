"use client";

import { Copy, Link2, Mail, QrCode, RefreshCw } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { actualizarLinksFactura, anularLinkPago, enviarLinkPorCorreo, generarLinkPago } from "@/app/(app)/facturacion/[id]/actions";
import { ConfirmarAccion } from "@/components/comunes/confirmar-accion";
import { InputMoneda } from "@/components/comunes/input-moneda";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { validarAbono } from "@/lib/facturacion";
import { cop } from "@/lib/precios";

type Estado = "CREADO" | "PENDIENTE" | "APROBADO" | "RECHAZADO" | "EXPIRADO" | "ANULADO";
const ESTADO: Record<Estado, { texto: string; variante: React.ComponentProps<typeof Badge>["variant"] }> = {
  CREADO: { texto: "Creado", variante: "info" }, PENDIENTE: { texto: "Pendiente", variante: "warning" }, APROBADO: { texto: "Aprobado", variante: "success" },
  RECHAZADO: { texto: "Rechazado", variante: "danger" }, EXPIRADO: { texto: "Expirado", variante: "secondary" }, ANULADO: { texto: "Anulado", variante: "secondary" },
};
const BadgeLink = ({ estado }: { estado: Estado }) => <Badge variant={ESTADO[estado].variante}>{ESTADO[estado].texto}</Badge>;

export type LinkVista = { id: string; estado: Estado; monto: number; urlPago: string | null; expira: string | null; creado: string; proveedor: string };
type Props = { facturaId: string; puedeGenerar: boolean; disponible: number; pasarelas: { id: string; nombre: string }[]; links: LinkVista[] };

function Qr({ texto }: { texto: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => { void QRCode.toDataURL(texto, { margin: 1, width: 240 }).then(setSrc); }, [texto]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="Código QR del link de pago" width={240} height={240} className="mx-auto rounded-md border bg-white p-1" /> : <p className="text-sm text-muted-foreground">Generando…</p>;
}

export function LinksPago({ facturaId, puedeGenerar, disponible, pasarelas, links }: Props) {
  const [pendiente, iniciar] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [pasarelaId, setPasarelaId] = useState(pasarelas[0]?.id ?? "");
  const [parcial, setParcial] = useState(false);
  const [valor, setValor] = useState(String(disponible));
  const monto = parcial ? Number(valor) : disponible;
  const error = validarAbono(monto, disponible)?.replace("saldo", "saldo disponible");
  const copiar = (t: string) => navigator.clipboard.writeText(t).then(() => toast.success("Link copiado"), () => toast.error("No se pudo copiar"));
  const aviso = (r: { error?: string }, ok: string): void => void (r.error ? toast.error(r.error) : toast.success(ok));

  const generar = () => iniciar(async () => {
    const r = await generarLinkPago(facturaId, { pasarelaId, abono: parcial ? monto : undefined });
    aviso(r, "Link de pago generado");
    if (r.aviso) toast.warning(r.aviso);
    if (!r.error) setAbierto(false);
  });

  if (!puedeGenerar && links.length === 0) return null;
  return (
    <Card className="py-0 print:hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pt-6">
        <CardTitle>Pago en línea</CardTitle>
        <div className="flex gap-2">
          {links.some((l) => l.estado === "CREADO" || l.estado === "PENDIENTE") && (
            <Button type="button" variant="outline" size="sm" disabled={pendiente} onClick={() => iniciar(async () => { const r = await actualizarLinksFactura(facturaId); aviso(r, r.resumen ?? "Actualizado"); })}><RefreshCw /> Actualizar estado</Button>
          )}
          {puedeGenerar && (
            <Dialog open={abierto} onOpenChange={(o) => { setAbierto(o); if (o) { setValor(String(disponible)); setParcial(false); } }}>
              <DialogTrigger asChild><Button size="sm"><Link2 /> Generar link de pago</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Generar link de pago</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  {pasarelas.length > 1 && (
                    <div className="space-y-2">
                      <Label htmlFor="pasarela-link">Pasarela</Label>
                      <Select value={pasarelaId} onValueChange={setPasarelaId}>
                        <SelectTrigger id="pasarela-link" className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>{pasarelas.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  )}
                  <p className="text-sm">Monto a cobrar: <span className="font-medium">{cop(monto || 0)}</span> <span className="text-muted-foreground">(saldo disponible {cop(disponible)})</span></p>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={parcial} onChange={(e) => setParcial(e.target.checked)} /> Cobrar solo un abono parcial</label>
                  {parcial && (
                    <div className="space-y-2">
                      <Label htmlFor="valor-link">Valor del abono</Label>
                      <InputMoneda id="valor-link" value={valor} onValueChange={setValor} aria-invalid={!!error} />
                      {error && <p className="text-xs text-destructive">{error}</p>}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">El paciente paga en la página de la pasarela; el dinero va a la cuenta del centro. El link vence en 7 días.</p>
                </div>
                <DialogFooter><Button disabled={pendiente || !!error || !pasarelaId} onClick={generar}>Generar link</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-0">
        {links.length === 0 ? (
          <p className="p-6 pt-0 text-sm text-muted-foreground">Aún no hay links de pago para esta cuenta.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Creado</TableHead><TableHead>Pasarela</TableHead><TableHead>Estado</TableHead><TableHead>Vence</TableHead>
                <TableHead className="text-right">Monto</TableHead><TableHead className="pr-6 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {links.map((l) => {
                const activo = l.estado === "CREADO" || l.estado === "PENDIENTE";
                return (
                  <TableRow key={l.id} data-link={l.id}>
                    <TableCell className="pl-6">{l.creado}</TableCell>
                    <TableCell>{l.proveedor}</TableCell>
                    <TableCell><BadgeLink estado={l.estado} /></TableCell>
                    <TableCell>{l.expira ?? "—"}</TableCell>
                    <TableCell className="text-right">{cop(l.monto)}</TableCell>
                    <TableCell className="pr-6">
                      <div className="flex flex-wrap justify-end gap-1">
                        {activo && l.urlPago && (
                          <>
                            <Button type="button" variant="ghost" size="icon" aria-label="Copiar link" onClick={() => copiar(l.urlPago!)}><Copy /></Button>
                            <Dialog>
                              <DialogTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label="Mostrar QR"><QrCode /></Button></DialogTrigger>
                              <DialogContent><DialogHeader><DialogTitle>Link de pago {cop(l.monto)}</DialogTitle></DialogHeader><Qr texto={l.urlPago} /><p className="break-all text-center text-xs text-muted-foreground">{l.urlPago}</p></DialogContent>
                            </Dialog>
                            <Button type="button" variant="ghost" size="icon" aria-label="Enviar por correo" disabled={pendiente} onClick={() => iniciar(async () => aviso(await enviarLinkPorCorreo(l.id), "Correo enviado al paciente"))}><Mail /></Button>
                          </>
                        )}
                        {activo && (
                          <ConfirmarAccion titulo="¿Anular el link de pago?" descripcion="El link deja de estar disponible en dent-view. Si el paciente ya lo tiene abierto en la pasarela y paga, el pago igual se registrará." confirmar="Anular" onConfirmar={() => iniciar(async () => aviso(await anularLinkPago(l.id), "Link anulado"))}>
                            <Button type="button" variant="outline" size="sm" disabled={pendiente}>Anular</Button>
                          </ConfirmarAccion>
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
    </Card>
  );
}
