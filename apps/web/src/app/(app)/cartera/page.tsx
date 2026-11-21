import { prisma } from "@dent-view/db";
import { AlertTriangle, Clock, HandCoins, Wallet } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { agruparCartera, TRAMOS } from "@/lib/cartera";
import { nombresDoctores } from "@/lib/facturacion-datos";
import { ETIQUETA_MEDIO, numeroFactura, saldo, totalPagado } from "@/lib/facturacion";
import { cop } from "@/lib/precios";
import { GESTION } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";
import { fechaCorta } from "@/lib/fechas";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { EstadoVacio } from "@/components/comunes/estado-vacio";
import { BadgeCuenta, estadoCuenta, type EstadoCuenta } from "@/components/comunes/estado-badge";
import { FiltrosUrl } from "@/components/comunes/filtros-url";
import { Kpi } from "@/components/comunes/kpi";
import { GraficoCartera } from "@/components/facturacion/grafico-cartera";

export const dynamic = "force-dynamic";

const fecha = fechaCorta;
const TIPO = { PACIENTE: "Paciente", DOCTOR: "Doctor", CONVENIO: "Convenio" } as const;

const ESTADOS_FILTRO: EstadoCuenta[] = ["VENCIDA", "PARCIAL", "ABIERTA"];

export default async function Cartera({ searchParams }: { searchParams: Promise<{ doctor?: string; estado?: string; convenio?: string }> }) {
  const ctx = await exigirContexto(GESTION);
  const sp = await searchParams;
  const todas = await prisma.factura.findMany({
    where: { organizationId: ctx.organizationId, estado: "ABIERTA" },
    include: { paciente: { include: { persona: true } }, pagos: { orderBy: { fecha: "asc" } } },
  });
  const ahora = new Date();
  const doctores = await nombresDoctores(ctx.organizationId, todas.map((f) => f.responsableId));
  // Opciones de los filtros: salen de lo que realmente hay en cartera (siempre del centro activo).
  const opcDoctores = [...new Set(todas.flatMap((f) => (f.responsable === "DOCTOR" && f.responsableId ? [f.responsableId] : [])))]
    .map((id) => ({ valor: id, texto: doctores.get(id) ?? "Doctor" }));
  const opcConvenios = [...new Set(todas.flatMap((f) => (f.responsable === "CONVENIO" && f.convenio ? [f.convenio] : [])))].map((c) => ({ valor: c, texto: c }));
  const doctor = opcDoctores.find((o) => o.valor === sp.doctor)?.valor;
  const convenio = opcConvenios.find((o) => o.valor === sp.convenio)?.valor;
  const estado = ESTADOS_FILTRO.find((e) => e === sp.estado);
  const abiertas = todas.filter((f) =>
    (!doctor || f.responsableId === doctor) && (!convenio || f.convenio === convenio) && (!estado || estadoCuenta(f, ahora) === estado));
  const porId = new Map(abiertas.map((f) => [f.id, f]));
  const filas = abiertas.map((f) => ({ ...f, saldo: saldo(f.total, f.pagos) })).filter((f) => f.saldo > 0);
  const grupos = agruparCartera(filas, ahora);
  const totales = TRAMOS.map((_, i) => grupos.reduce((t, g) => t + g.porTramo[i], 0));
  const nombre = (g: (typeof grupos)[number]) => {
    const f = porId.get(g.filas[0].id)!;
    return f.responsable === "DOCTOR" ? (doctores.get(f.responsableId ?? "") ?? "Doctor") : f.responsable === "CONVENIO" ? (f.convenio ?? "Convenio") : (f.paciente?.nombre.toLowerCase() ?? "—");
  };

  const totalCartera = totales.reduce((a, b) => a + b, 0);
  const sumaSaldo = (pred: (f: (typeof filas)[number]) => boolean) => filas.filter(pred).reduce((t, f) => t + f.saldo, 0);
  const vencida = sumaSaldo((f) => estadoCuenta(f, ahora) === "VENCIDA");
  const aCargoDoctores = sumaSaldo((f) => f.responsable === "DOCTOR");
  const hayFiltros = !!(doctor || convenio || estado);

  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo="Cartera" descripcion="Saldos abiertos por responsable y antigüedad en días, desde el vencimiento (o la fecha si no vence)." />

      <FiltrosUrl filtros={[
        { tipo: "select", clave: "estado", etiqueta: "Estado", todos: "Todos los estados", opciones: ESTADOS_FILTRO.map((e) => ({ valor: e, texto: { VENCIDA: "Vencida", PARCIAL: "Parcial", ABIERTA: "Abierta" }[e as "VENCIDA"] })) },
        { tipo: "select", clave: "doctor", etiqueta: "Doctor responsable", todos: "Todos los doctores", ancho: "w-52", opciones: opcDoctores },
        { tipo: "select", clave: "convenio", etiqueta: "Convenio", todos: "Todos los convenios", ancho: "w-52", opciones: opcConvenios },
      ]} />

      <section aria-label="Resumen de cartera" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi titulo="Cartera total" valor={cop(totalCartera)} nota={`${filas.length} ${filas.length === 1 ? "cuenta" : "cuentas"} con saldo`} icono={Wallet} tono="primary" />
        <Kpi titulo="Vencida" valor={cop(vencida)} nota="Pasó su fecha de vencimiento" icono={AlertTriangle} tono="danger" />
        <Kpi titulo="Vigente" valor={cop(totalCartera - vencida)} nota="Aún dentro de plazo" icono={Clock} tono="info" />
        <Kpi titulo="A cargo de doctores" valor={cop(aCargoDoctores)} nota="Responsable: doctor remitente" icono={HandCoins} tono="violet" />
      </section>

      {grupos.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Saldo por antigüedad</CardTitle></CardHeader>
          <CardContent><GraficoCartera datos={TRAMOS.map((t, i) => ({ tramo: t, total: totales[i] }))} /></CardContent>
        </Card>
      )}

      <Card className="py-0">
        <CardContent className="px-0">
          {grupos.length === 0 ? (
            <EstadoVacio titulo={hayFiltros ? "Ninguna cuenta coincide con los filtros" : "No hay saldos pendientes"} descripcion={hayFiltros ? "Quita o cambia un filtro para ver más cuentas." : "Cuando una cuenta de cobro quede con saldo, aparecerá aquí."} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 md:pl-6">Responsable</TableHead>
                  {TRAMOS.map((t) => <TableHead key={t} className="hidden text-right lg:table-cell">{t} días</TableHead>)}
                  <TableHead className="pr-4 md:pr-6 text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grupos.map((g) => (
                  <TableRow key={g.clave}>
                    <TableCell className="pl-4 md:pl-6 capitalize">
                      <span className="font-medium">{nombre(g)}</span> <span className="text-xs text-muted-foreground">{TIPO[porId.get(g.filas[0].id)!.responsable]}</span>
                    </TableCell>
                    {g.porTramo.map((v, i) => <TableCell key={i} className="hidden text-right lg:table-cell">{v ? cop(v) : "—"}</TableCell>)}
                    <TableCell className="pr-4 md:pr-6 text-right font-medium">{cop(g.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="pl-4 md:pl-6">Total cartera</TableCell>
                  {totales.map((v, i) => <TableCell key={i} className="hidden text-right lg:table-cell">{cop(v)}</TableCell>)}
                  <TableCell className="pr-4 md:pr-6 text-right">{cop(totalCartera)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>

      {grupos.length > 0 && <h2 className="text-lg font-semibold tracking-tight">Estado de cuenta por responsable</h2>}
      {grupos.map((g) => (
        <Card key={g.clave} className="py-0">
          <CardHeader className="pt-6"><CardTitle className="capitalize">{nombre(g)} · {cop(g.total)}</CardTitle></CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 md:pl-6">Cuenta</TableHead>
                  <TableHead className="hidden lg:table-cell">Fecha</TableHead>
                  <TableHead className="hidden lg:table-cell">Vence</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Días</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Total</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Abonado</TableHead>
                  <TableHead className="pr-4 md:pr-6 text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {g.filas.map((f) => {
                  const o = porId.get(f.id)!;
                  return (
                    <TableRow key={f.id}>
                      <TableCell className="pl-4 md:pl-6"><Link href={`/facturacion/${f.id}`} className="font-medium underline-offset-4 hover:underline">{numeroFactura(o.numero)}</Link></TableCell>
                      <TableCell className="hidden lg:table-cell">{fecha(f.fecha)}</TableCell>
                      <TableCell className="hidden lg:table-cell">{f.vence ? fecha(f.vence) : "—"}</TableCell>
                      <TableCell><BadgeCuenta estado={estadoCuenta(o, ahora)} /></TableCell>
                      <TableCell className="text-right">{f.dias}</TableCell>
                      <TableCell className="hidden text-right lg:table-cell">{cop(o.total)}</TableCell>
                      <TableCell className="hidden text-right lg:table-cell">{cop(totalPagado(o.pagos))}</TableCell>
                      <TableCell className="pr-4 md:pr-6 text-right">{cop(f.saldo)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {g.filas.some((f) => porId.get(f.id)!.pagos.length > 0) && (
              <details className="border-t px-4 py-3 md:px-6 text-sm">
                <summary className="cursor-pointer text-muted-foreground">Pagos recibidos</summary>
                <ul className="mt-2 space-y-1">
                  {g.filas.flatMap((f) => porId.get(f.id)!.pagos.map((p) => (
                    <li key={p.id} className="flex justify-between gap-4">
                      <span>{fecha(p.fecha)} · {numeroFactura(porId.get(f.id)!.numero)} · {ETIQUETA_MEDIO[p.medio]}</span><span>{cop(p.valor)}</span>
                    </li>
                  )))}
                </ul>
              </details>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
