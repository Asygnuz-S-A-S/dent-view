// Adaptado de OpenDentist (MIT, © 2026 Clawnify) — https://github.com/clawnify/OpenDentist
import { prisma } from "@dent-view/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccionesFactura } from "@/components/facturacion/acciones-factura";
import { BadgeCuenta, estadoCuenta } from "@/components/comunes/estado-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { aCargoDe, nombresDoctores } from "@/lib/facturacion-datos";
import { ETIQUETA_MEDIO, numeroFactura, saldo, totalPagado } from "@/lib/facturacion";
import { numeroOrden } from "@/lib/ordenes";
import { cop } from "@/lib/precios";
import { GESTION } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";
import { fechaCorta } from "@/lib/fechas";

export const dynamic = "force-dynamic";

const fecha = fechaCorta;

export default async function DetalleFactura({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirContexto(GESTION);
  const { id } = await params;
  const f = await prisma.factura.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: { paciente: { include: { persona: true } }, orden: true, items: true, pagos: { orderBy: { fecha: "asc" } } },
  });
  if (!f) notFound();
  const doctores = await nombresDoctores(ctx.organizationId, [f.responsableId]);
  const pacienteNombre = f.paciente?.nombre.toLowerCase() ?? "—";
  const pendiente = saldo(f.total, f.pagos);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Cuenta de cobro {numeroFactura(f.numero)}</h1>
            <BadgeCuenta estado={estadoCuenta(f)} />
          </div>
          <p className="text-sm text-muted-foreground">
            A cargo de: <span className="font-medium capitalize text-foreground">{aCargoDe(f, doctores, pacienteNombre)}</span> · {fecha(f.fecha)}
            {f.vence && ` · vence ${fecha(f.vence)}`}
          </p>
          {f.paciente && (
            <p className="text-sm text-muted-foreground">
              Paciente:{" "}
              <Link href={`/pacientes/${f.pacienteId}`} className="capitalize text-foreground underline-offset-4 hover:underline print:no-underline">{pacienteNombre}</Link>
              {" · "}{f.paciente.persona.tipoDocumento} {f.paciente.persona.numeroDocumento}
              {f.orden && <> · Orden <Link href={`/ordenes/${f.orden.id}`} className="underline-offset-4 hover:underline print:no-underline">{numeroOrden(f.orden.numero)}</Link></>}
            </p>
          )}
          {f.notas && <p className="text-sm">{f.notas}</p>}
        </div>
        <AccionesFactura id={f.id} abierta={f.estado === "ABIERTA"} saldo={pendiente} tienePagos={f.pagos.length > 0} />
      </div>

      <Card className="py-0">
        <CardHeader className="pt-6"><CardTitle>Ítems</CardTitle></CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Descripción</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="pr-6 text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {f.items.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="pl-6">{i.descripcion}</TableCell>
                  <TableCell className="text-right">{i.cantidad}</TableCell>
                  <TableCell className="text-right">{cop(i.valorUnitario)}</TableCell>
                  <TableCell className="pr-6 text-right">{cop(i.cantidad * i.valorUnitario)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow><TableCell colSpan={3} className="pl-6">Total</TableCell><TableCell className="pr-6 text-right">{cop(f.total)}</TableCell></TableRow>
              <TableRow><TableCell colSpan={3} className="pl-6">Abonado</TableCell><TableCell className="pr-6 text-right">{cop(totalPagado(f.pagos))}</TableCell></TableRow>
              <TableRow><TableCell colSpan={3} className="pl-6">Saldo</TableCell><TableCell className="pr-6 text-right">{f.estado === "ANULADA" ? "—" : cop(pendiente)}</TableCell></TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      <Card className="py-0">
        <CardHeader className="pt-6"><CardTitle>Pagos</CardTitle></CardHeader>
        <CardContent className="px-0">
          {f.pagos.length === 0 ? (
            <p className="p-6 pt-0 text-sm text-muted-foreground">Aún no hay abonos.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Fecha</TableHead>
                  <TableHead>Medio</TableHead>
                  <TableHead>Nota</TableHead>
                  <TableHead className="pr-6 text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {f.pagos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="pl-6">{fecha(p.fecha)}</TableCell>
                    <TableCell>{ETIQUETA_MEDIO[p.medio]}</TableCell>
                    <TableCell className="text-muted-foreground">{p.nota ?? "—"}</TableCell>
                    <TableCell className="pr-6 text-right">{cop(p.valor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Cuenta de cobro interna del centro; no es factura electrónica DIAN.</p>
    </div>
  );
}
