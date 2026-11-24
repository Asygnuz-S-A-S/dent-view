"use client";

import { Copy, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { entregarResultados, revocarEnlace, type ResultadoEntrega } from "@/app/(app)/entrega/actions";
import { HojaEntrega, type CentroHoja } from "@/components/entrega/hoja-entrega";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type FilaEnlace = { id: string; tipo: string; nombre: string; correo: string; estado: string; vence: string; accesos: number; ultimoAcceso: string | null };
export type Origen = { informeId?: string; estudioId?: string; nombre: string; correo: string; centro?: CentroHoja };

const ETIQUETA: Record<string, string> = { ACTIVO: "Activo", VENCIDO: "Vencido", REVOCADO: "Revocado", BLOQUEADO: "Bloqueado" };

function Entregar({ origen, abrirInicial }: { origen: Origen; abrirInicial: boolean }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(abrirInicial);
  const [nombre, setNombre] = useState(origen.nombre);
  const [correo, setCorreo] = useState(origen.correo);
  const [dias, setDias] = useState("30");
  const [res, setRes] = useState<Extract<ResultadoEntrega, { codigo: string }> | null>(null);
  const [pendiente, iniciar] = useTransition();

  const enviar = () =>
    iniciar(async () => {
      const r = await entregarResultados({ informeId: origen.informeId, estudioId: origen.estudioId, nombre, correo, dias: Number(dias) });
      if ("error" in r) return void toast.error(r.error);
      setRes(r);
      router.refresh();
    });
  const copiar = (t: string) => navigator.clipboard.writeText(t).then(() => toast.success("Copiado"), () => toast.error("No se pudo copiar"));

  return (
    <Dialog open={abierto} onOpenChange={(o) => { setAbierto(o); if (!o) setRes(null); }}>
      <DialogTrigger asChild><Button><Send /> Entregar resultados</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Entregar resultados al paciente</DialogTitle>
          <DialogDescription>Se envía un enlace y, en un correo aparte, un código de 6 dígitos. El paciente puede reenviarlos a su doctor.</DialogDescription>
        </DialogHeader>
        {res ? (
          <div className="space-y-3 text-sm">
            <p>{res.enviado ? "Correos en cola: el enlace y el código salen en mensajes separados." : "No se envió correo (sin correo o el paciente no desea ser contactado). Entregue estos datos en persona."}</p>
            <p className="text-muted-foreground">Se muestran una sola vez; luego solo se guardan cifrados.</p>
            <div className="grid gap-1"><Label htmlFor="ent-res-enlace">Enlace</Label><div className="flex gap-2"><Input id="ent-res-enlace" readOnly value={res.enlace} /><Button type="button" variant="outline" size="icon" aria-label="Copiar enlace" onClick={() => copiar(res.enlace)}><Copy /></Button></div></div>
            <div className="grid gap-1"><Label htmlFor="ent-res-codigo">Código</Label><div className="flex gap-2"><Input id="ent-res-codigo" readOnly value={res.codigo} className="font-mono tracking-widest" /><Button type="button" variant="outline" size="icon" aria-label="Copiar código" onClick={() => copiar(res.codigo)}><Copy /></Button></div></div>
            <DialogFooter><HojaEntrega centro={origen.centro} paciente={origen.nombre} enlace={res.enlace} codigo={res.codigo} venceEn={res.venceEn} /><Button onClick={() => setAbierto(false)}>Listo</Button></DialogFooter>
          </div>
        ) : (
          <>
            <div className="grid gap-4">
              <div className="grid gap-2"><Label htmlFor="ent-nombre">Destinatario</Label><Input id="ent-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
              <div className="grid gap-2"><Label htmlFor="ent-correo">Correo (vacío para entregar en persona)</Label><Input id="ent-correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} /></div>
              <div className="grid gap-2"><Label htmlFor="ent-dias">Vence en (días)</Label><Input id="ent-dias" type="number" min={1} max={90} value={dias} onChange={(e) => setDias(e.target.value)} /></div>
            </div>
            <DialogFooter><Button disabled={pendiente || !nombre.trim()} onClick={enviar}>Generar y enviar</Button></DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function PanelEntrega({ enlaces, origen, abrirInicial = false }: { enlaces: FilaEnlace[]; origen?: Origen; abrirInicial?: boolean }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const revocar = (id: string) =>
    iniciar(async () => {
      const r = await revocarEnlace(id);
      if (r.error) toast.error(r.error);
      else { toast.success("Enlace revocado"); router.refresh(); }
    });

  return (
    <div className="space-y-4">
      {origen && <Entregar origen={origen} abrirInicial={abrirInicial} />}
      {enlaces.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no se han entregado resultados por enlace.</p>
      ) : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Destinatario</TableHead><TableHead>Estado</TableHead><TableHead className="hidden md:table-cell">Vence</TableHead><TableHead className="hidden md:table-cell">Accesos</TableHead><TableHead className="hidden md:table-cell">Último acceso</TableHead><TableHead className="text-right">Acciones</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {enlaces.map((e) => (
              <TableRow key={e.id}>
                <TableCell><div className="font-medium">{e.nombre || "—"} <span className="text-xs font-normal text-muted-foreground">({e.tipo === "DOCTOR" ? "doctor" : "paciente"})</span></div><div className="text-xs text-muted-foreground">{e.correo}</div></TableCell>
                <TableCell><Badge variant={e.estado === "ACTIVO" ? "default" : "secondary"}>{ETIQUETA[e.estado]}</Badge></TableCell>
                <TableCell className="hidden md:table-cell">{e.vence}</TableCell>
                <TableCell className="hidden md:table-cell">{e.accesos}</TableCell>
                <TableCell className="hidden md:table-cell">{e.ultimoAcceso ?? "—"}</TableCell>
                <TableCell className="text-right">
                  {(e.estado === "ACTIVO" || e.estado === "BLOQUEADO") && <Button size="sm" variant="outline" disabled={pendiente} onClick={() => revocar(e.id)}>Revocar</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
