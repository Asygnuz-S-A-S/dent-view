// Adaptado de OpenDentist (MIT, © 2026 Clawnify) — https://github.com/clawnify/OpenDentist
import { prisma } from "@dent-view/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AnularPagoBoton, AplicarAnticipoBoton } from "@/components/facturacion/acciones-pago";
import { AccionesFactura } from "@/components/facturacion/acciones-factura";
import { LinksPago } from "@/components/facturacion/links-pago";
import { BadgeCuenta, estadoCuenta } from "@/components/comunes/estado-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { aCargoDe, nombresDoctores } from "@/lib/facturacion-datos";
import { ETIQUETA_MEDIO, numeroFactura, saldo, totalPagado } from "@/lib/facturacion";
import { estadoEfectivoLink, linkActivo } from "@/lib/pagos/decision";
import { ADAPTADORES } from "@/lib/pagos/registro";
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
    include: { paciente: { include: { persona: true } }, orden: true, items: true, pagos: { orderBy: { fecha: "asc" } }, notasCredito: { orderBy: { consecutivo: "asc" } } },
  });
  if (!f) notFound();
  const doctores = await nombresDoctores(ctx.organizationId, [f.responsableId]);
  const pacienteNombre = f.paciente?.nombre.toLowerCase() ?? "—";
  const pendiente = saldo(f.total, f.pagos);
  const [pasarelas, links, anticipos] = await Promise.all([
    prisma.pasarelaPago.findMany({ where: { organizationId: ctx.organizationId, activa: true }, select: { id: true, proveedor: true, modo: true } }),
    prisma.linkPago.findMany({ where: { facturaId: f.id, organizationId: ctx.organizationId }, include: { pasarela: { select: { proveedor: true } } }, orderBy: { creadoEn: "desc" } }),
    f.pacienteId && f.estado === "ABIERTA" ? prisma.anticipo.findMany({ where: { organizationId: ctx.organizationId, pacienteId: f.pacienteId, estado: "DISPONIBLE" }, orderBy: { creadoEn: "asc" } }) : [],
  ]);
  // Lo ya comprometido en links activos no se puede volver a cobrar: evita pagar dos veces la misma deuda.
  const disponible = pendiente - links.filter((l) => linkActivo(l)).reduce((t, l) => t + l.monto, 0);

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
        <AccionesFactura id={f.id} abierta={f.estado === "ABIERTA"} saldo={pendiente} tienePagos={f.pagos.some((p) => !p.anuladoEn)} pagada={f.estado === "PAGADA"} pagado={totalPagado(f.pagos)} admin={ctx.rol === "admin_tenant"} />
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
              {f.notasCredito.length > 0 && <TableRow><TableCell colSpan={3} className="pl-6">Notas crédito (ya descontadas del total)</TableCell><TableCell className="pr-6 text-right">{cop(f.notasCredito.reduce((t, n) => t + n.valor, 0))}</TableCell></TableRow>}
              <TableRow><TableCell colSpan={3} className="pl-6">Saldo</TableCell><TableCell className="pr-6 text-right">{f.estado === "ANULADA" ? "—" : pendiente < 0 ? `${cop(-pendiente)} a favor` : cop(pendiente)}</TableCell></TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      {anticipos.length > 0 && (
        <Card className="py-0">
          <CardHeader className="pt-6"><CardTitle>Anticipos disponibles</CardTitle></CardHeader>
          <CardContent className="px-6 pb-6">
            <ul className="space-y-2 text-sm">
              {anticipos.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-4">
                  <span>{fecha(a.creadoEn)} · {ETIQUETA_MEDIO[a.medio]} · disponible {cop(a.valor - a.valorAplicado)}</span>
                  {pendiente > 0 && <AplicarAnticipoBoton facturaId={f.id} anticipoId={a.id} />}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <LinksPago
        facturaId={f.id}
        puedeGenerar={f.estado === "ABIERTA" && disponible > 0 && pasarelas.some((p) => p.modo === "SANDBOX" || !ADAPTADORES[p.proveedor].bloqueadoProduccion)}
        disponible={disponible}
        pasarelas={pasarelas.filter((p) => p.modo === "SANDBOX" || !ADAPTADORES[p.proveedor].bloqueadoProduccion).map((p) => ({ id: p.id, nombre: `${ADAPTADORES[p.proveedor].nombre} (${p.modo === "SANDBOX" ? "Sandbox" : "Producción"})` }))}
        links={links.map((l) => ({ id: l.id, estado: estadoEfectivoLink(l), monto: l.monto, urlPago: l.urlPago, expira: l.expiraEn ? fecha(l.expiraEn) : null, creado: fecha(l.creadoEn), proveedor: ADAPTADORES[l.pasarela.proveedor].nombre }))}
      />

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
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="pr-6 print:hidden"><span className="sr-only">Acciones</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {f.pagos.map((p) => (
                  <TableRow key={p.id} className={p.anuladoEn ? "text-muted-foreground" : undefined}>
                    <TableCell className="pl-6">{fecha(p.fecha)}</TableCell>
                    <TableCell>{ETIQUETA_MEDIO[p.medio]}</TableCell>
                    <TableCell className="text-muted-foreground">{p.anuladoEn ? `Anulado el ${fecha(p.anuladoEn)}: ${p.motivoAnulacion}` : (p.nota ?? "—")}</TableCell>
                    <TableCell className={`text-right ${p.anuladoEn ? "line-through" : ""}`}>{cop(p.valor)}</TableCell>
                    <TableCell className="pr-6 text-right">{ctx.rol === "admin_tenant" && !p.anuladoEn && f.estado !== "ANULADA" && <AnularPagoBoton pagoId={p.id} />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {f.notasCredito.length > 0 && (
        <Card className="py-0">
          <CardHeader className="pt-6"><CardTitle>Notas crédito</CardTitle></CardHeader>
          <CardContent className="px-6 pb-6">
            <ul className="space-y-1 text-sm">
              {f.notasCredito.map((n) => <li key={n.id} className="flex justify-between gap-4"><span>NC-{String(n.consecutivo).padStart(4, "0")} · {fecha(n.creadoEn)} · {n.motivo}</span><span>{cop(n.valor)}</span></li>)}
            </ul>
          </CardContent>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">Cuenta de cobro interna del centro; no es factura electrónica DIAN.</p>
    </div>
  );
}
