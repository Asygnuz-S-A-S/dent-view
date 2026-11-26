import { prisma } from "@dent-view/db";
import { ListChecks } from "lucide-react";
import Link from "next/link";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { EstadoVacio } from "@/components/comunes/estado-vacio";
import { BadgePlan } from "@/components/planes/badge-plan";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fechaCorta } from "@/lib/fechas";
import { resumenPlan, type EstadoItemPlan, type EstadoPlan } from "@/lib/planes";
import { contextoPlanes } from "@/lib/planes-servidor";
import { cop } from "@/lib/precios";
import { numeroPresupuesto } from "@/lib/presupuestos";

export const dynamic = "force-dynamic";

export default async function Planes() {
  const ctx = await contextoPlanes();
  const planes = await prisma.planTratamiento.findMany({
    where: { organizationId: ctx.organizationId },
    include: { paciente: { select: { nombre: true } }, presupuesto: { select: { numero: true } }, items: { select: { precio: true, estado: true } }, anticipos: { where: { estado: { in: ["DISPONIBLE", "APLICADO"] } }, select: { valor: true, valorAplicado: true } } },
    orderBy: { creadoEn: "desc" },
    take: 200,
  });
  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo="Planes de tratamiento" descripcion="Cada plan congela el precio de sus ítems; el saldo baja a medida que las órdenes de cada cita se atienden." />
      <Card className="py-0">
        <CardContent className="px-0">
          {planes.length === 0 ? (
            <EstadoVacio icono={ListChecks} titulo="Aún no hay planes de tratamiento." descripcion="Créalos desde una cotización aceptada o desde la ficha de un paciente." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 md:pl-6">Paciente</TableHead>
                  <TableHead className="hidden md:table-cell">Origen</TableHead>
                  <TableHead className="text-right">Avance</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="hidden md:table-cell">Creado</TableHead>
                  <TableHead className="pr-4 md:pr-6">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {planes.map((p) => {
                  const r = resumenPlan(p.items as { precio: number; estado: EstadoItemPlan }[], p.anticipos);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="max-w-48 truncate pl-4 font-medium capitalize md:pl-6"><Link href={`/planes/${p.id}`} className="underline-offset-4 hover:underline">{p.paciente.nombre.toLowerCase()}</Link></TableCell>
                      <TableCell className="hidden md:table-cell">{p.presupuesto ? `Cotización ${numeroPresupuesto(p.presupuesto.numero)}` : "Manual"}{p.titulo ? ` · ${p.titulo}` : ""}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.avancePct} %</TableCell>
                      <TableCell className="text-right tabular-nums">{cop(r.saldo)}</TableCell>
                      <TableCell className="hidden md:table-cell">{fechaCorta(p.creadoEn)}</TableCell>
                      <TableCell className="pr-4 md:pr-6"><BadgePlan estado={p.estado as EstadoPlan} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
