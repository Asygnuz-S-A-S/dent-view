// Adaptado de OpenDentist (MIT, © 2026 Clawnify) — https://github.com/clawnify/OpenDentist
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { estaVencido, ETIQUETA_LAB, type EstadoLab } from "@/lib/laboratorio";
import { cop } from "@/lib/precios";
import { CasoDialog, type OrdenOpcion } from "./caso-dialog";
import { EstadoCaso } from "./estado-caso";
import type { PacienteOpcion } from "@/components/ordenes/paciente-combobox";
import { fechaCorta, fechaIso } from "@/lib/fechas";
import { EstadoVacio } from "@/components/comunes/estado-vacio";

export type CasoFila = {
  id: string; pacienteId: string; paciente: string; ordenId: string | null; laboratorio: string; tipo: string; dientes: string | null;
  valor: number; estado: EstadoLab; enviado: Date | null; entregaEsperada: Date | null; recibido: Date | null; notas: string | null;
};
const fecha = (d: Date | null) => fechaCorta(d);
const iso = (d: Date | null) => (d ? fechaIso(d) : "");

export function TablaCasos({ casos, gestionar, pacientes, ordenes, mostrarPaciente = true }: {
  casos: CasoFila[]; gestionar: boolean; pacientes: PacienteOpcion[]; ordenes: OrdenOpcion[]; mostrarPaciente?: boolean;
}) {
  return (
    <Card className="py-0"><CardContent className="px-0">
      {casos.length === 0 ? (
        <EstadoVacio titulo="No hay casos de laboratorio" descripcion="Registra uno con el botón «Nuevo caso»." />
      ) : (
        <Table>
          <TableHeader><TableRow>
            {mostrarPaciente && <TableHead className="pl-4 md:pl-6">Paciente</TableHead>}
            <TableHead className={mostrarPaciente ? "hidden xl:table-cell" : "pl-4 md:pl-6"}>Trabajo</TableHead><TableHead className="hidden xl:table-cell">Enviado</TableHead>
            <TableHead className="hidden xl:table-cell">Entrega</TableHead><TableHead className="hidden xl:table-cell">Recibido</TableHead><TableHead className="hidden text-right xl:table-cell">Valor</TableHead>
            <TableHead>Estado</TableHead>{gestionar && <TableHead className="pr-4 md:pr-6 text-right">Acciones</TableHead>}
          </TableRow></TableHeader>
          <TableBody>
            {casos.map((c) => (
              <TableRow key={c.id}>
                {mostrarPaciente && (
                  <TableCell className="max-w-[12rem] whitespace-normal pl-4 font-medium md:pl-6">
                    <span className="block capitalize">{c.paciente.toLowerCase()}</span>
                    {/* En pantallas angostas el trabajo y la entrega se pliegan bajo el nombre. */}
                    <span className="block text-xs font-normal text-muted-foreground xl:hidden">{c.tipo} · {c.laboratorio}</span>
                    <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground xl:hidden">Entrega {fecha(c.entregaEsperada)}{estaVencido(c) && <Badge variant="destructive">Vencido</Badge>}</span>
                  </TableCell>
                )}
                <TableCell className={mostrarPaciente ? "hidden xl:table-cell" : "pl-4 md:pl-6"}>
                  <div className="font-medium">{c.tipo}</div>
                  <div className="text-xs text-muted-foreground">{c.laboratorio}{c.dientes && ` · dientes ${c.dientes}`}{!mostrarPaciente && <span className="xl:hidden"> · Entrega {fecha(c.entregaEsperada)}</span>}</div>
                </TableCell>
                <TableCell className="hidden xl:table-cell">{fecha(c.enviado)}</TableCell>
                <TableCell className="hidden xl:table-cell">
                  <div className="flex items-center gap-2">{fecha(c.entregaEsperada)}{estaVencido(c) && <Badge variant="destructive">Vencido</Badge>}</div>
                </TableCell>
                <TableCell className="hidden xl:table-cell">{fecha(c.recibido)}</TableCell>
                <TableCell className="hidden text-right xl:table-cell">{cop(c.valor)}</TableCell>
                <TableCell>{gestionar ? <EstadoCaso id={c.id} estado={c.estado} /> : <Badge variant="secondary">{ETIQUETA_LAB[c.estado]}</Badge>}</TableCell>
                {gestionar && (
                  <TableCell className="pr-4 md:pr-6 text-right">
                    <CasoDialog
                      pacientes={pacientes} ordenes={ordenes} pacienteFijo={mostrarPaciente ? undefined : c.pacienteId}
                      caso={{
                        id: c.id, pacienteId: c.pacienteId, ordenId: c.ordenId ?? "", laboratorio: c.laboratorio, tipo: c.tipo,
                        dientes: c.dientes ?? "", valor: String(c.valor), enviado: iso(c.enviado), entregaEsperada: iso(c.entregaEsperada), notas: c.notas ?? "",
                      }}
                    />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CardContent></Card>
  );
}
