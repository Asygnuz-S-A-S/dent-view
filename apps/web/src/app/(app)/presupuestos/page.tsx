import { prisma, type Prisma } from "@dent-view/db";
import { Calculator, Plus } from "lucide-react";
import Link from "next/link";
import { BarrasLista } from "@/components/comunes/barras-lista";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { EstadoVacio } from "@/components/comunes/estado-vacio";
import { FiltrosUrl } from "@/components/comunes/filtros-url";
import { Kpi } from "@/components/comunes/kpi";
import { TarjetaGrafica } from "@/components/comunes/tarjeta-grafica";
import { BadgePresupuesto } from "@/components/presupuestos/badge-presupuesto";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { bogotaAUtc, esFecha } from "@/lib/agenda";
import { cargarResponsables } from "@/lib/crm-datos";
import { fechaCorta } from "@/lib/fechas";
import { numeroDeBusqueda } from "@/lib/ordenes";
import { cop, hoyBogota } from "@/lib/precios";
import {
  DIAS_POR_VENCER, ESTADOS_VISIBLES, ETIQUETA_ESTADO, aFechaDb, esEstadoVisible, estadoVisible, filtroEstado, fechaVigencia, numeroPresupuesto, resumenPresupuestos, totalGuardado, type EstadoPres,
} from "@/lib/presupuestos";
import { ambitoPresupuestos, contextoPresupuestos } from "@/lib/presupuestos-servidor";

export const dynamic = "force-dynamic";

export default async function Presupuestos({ searchParams }: { searchParams: Promise<{ estado?: string; responsable?: string; desde?: string; hasta?: string; q?: string; vence?: string }> }) {
  const ctx = await contextoPresupuestos();
  const org = ctx.organizationId;
  const q = await searchParams;
  const ahora = new Date();
  const hoy = aFechaDb(hoyBogota(ahora));
  const base = ambitoPresupuestos(ctx);
  const responsables = ctx.rol === "especialista" ? [] : await cargarResponsables(org);
  const estado = esEstadoVisible(q.estado) ? q.estado : undefined;
  const responsable = responsables.find((r) => r.id === q.responsable)?.id;
  const desde = esFecha(q.desde) ? q.desde : undefined, hasta = esFecha(q.hasta) ? q.hasta : undefined;
  const busqueda = (q.q ?? "").trim().slice(0, 80);
  const numero = /^(p-?)?\d{1,9}$/i.test(busqueda) ? numeroDeBusqueda(busqueda.replace(/^p-?/i, "")) : null;
  const porVencer = q.vence === "1";

  const where: Prisma.PresupuestoWhereInput = {
    AND: [
      base,
      estado ? filtroEstado(estado, hoy) : {},
      porVencer ? { estado: { in: ["ENVIADO", "VISTO"] }, validoHasta: { gte: hoy, lte: aFechaDb(fechaVigencia(DIAS_POR_VENCER, ahora)) } } : {},
      responsable ? { profesionalId: responsable } : {},
      desde || hasta ? { creadoEn: { ...(desde ? { gte: bogotaAUtc(desde, 0) } : {}), ...(hasta ? { lt: bogotaAUtc(hasta, 24 * 60) } : {}) } } : {},
      busqueda ? { OR: [{ paciente: { nombre: { contains: busqueda, mode: "insensitive" } } }, ...(numero ? [{ numero }] : [])] } : {},
    ],
  };
  const hace90 = new Date(ahora.getTime() - 90 * 86_400_000);
  const [filas, periodo] = await Promise.all([
    prisma.presupuesto.findMany({ where, include: { paciente: { select: { nombre: true } }, items: { select: { cantidad: true, valorUnitario: true, descuento: true } } }, orderBy: { creadoEn: "desc" }, take: 200 }),
    prisma.presupuesto.findMany({ where: { ...base, creadoEn: { gte: hace90 } }, select: { estado: true, validoHasta: true, enviadoEn: true, vistoEn: true, aceptadoEn: true, items: { select: { cantidad: true, valorUnitario: true, descuento: true } } }, take: 2000 }),
  ]);
  const r = resumenPresupuestos(periodo.map((p) => ({ estado: p.estado as EstadoPres, validoHasta: p.validoHasta, enviadoEn: p.enviadoEn, vistoEn: p.vistoEn, aceptadoEn: p.aceptadoEn, total: totalGuardado(p.items) })), ahora);
  const nombres = new Map((await prisma.user.findMany({ where: { id: { in: [...new Set(filas.flatMap((f) => (f.profesionalId ? [f.profesionalId] : [])))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const hayFiltros = !!(estado || responsable || desde || hasta || busqueda || porVencer);
  const conclusion = r.enviadas === 0
    ? "Aún no has enviado cotizaciones en los últimos 90 días"
    : `De ${r.enviadas} cotizaciones enviadas, ${r.vistas} se vieron y ${r.aceptadas} se aceptaron`;

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Presupuestos"
        descripcion="Cotizaciones virtuales: qué se envió, qué vio el paciente y qué se aceptó."
        acciones={<Button asChild><Link href="/presupuestos/nuevo"><Plus /> Nueva cotización</Link></Button>}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi titulo="Enviadas (90 días)" valor={r.enviadas} nota={`${r.vistas} vistas por el paciente`} />
        <Kpi titulo="Aceptadas" valor={r.aceptadas} nota={r.tasaAceptacion === null ? "Sin envíos aún" : `Tasa de aceptación ${r.tasaAceptacion} %`} href="/presupuestos?estado=ACEPTADO" />
        <Kpi titulo="Valor en juego" valor={cop(r.valorEnJuego)} nota="Enviadas y vistas vigentes" />
        <Kpi titulo="Por vencer" valor={r.porVencer} nota={`Vencen en ${DIAS_POR_VENCER} días o menos`} tono={r.porVencer > 0 ? "warning" : "primary"} href="/presupuestos?vence=1" />
      </div>
      <TarjetaGrafica titulo={conclusion} vacio={r.enviadas === 0 ? "Cuando envíes una cotización verás aquí su recorrido: enviada, vista, aceptada y convertida en orden." : undefined}
        tabla={{ columnas: ["Etapa", "Cotizaciones"], filas: [["Enviadas", r.enviadas], ["Vistas", r.vistas], ["Aceptadas", r.aceptadas], ["Convertidas en orden", r.convertidas]] }}
        comoSeCalcula="cotizaciones creadas en los últimos 90 días; la tasa es aceptadas entre enviadas. Valor en juego suma las enviadas o vistas que aún no vencen.">
        <BarrasLista filas={[
          { nombre: "Enviadas", n: r.enviadas, valor: String(r.enviadas) },
          { nombre: "Vistas", n: r.vistas, valor: String(r.vistas) },
          { nombre: "Aceptadas", n: r.aceptadas, valor: String(r.aceptadas) },
          { nombre: "Convertidas en orden", n: r.convertidas, valor: String(r.convertidas) },
        ]} />
      </TarjetaGrafica>

      <div className="flex flex-wrap items-end gap-3">
        <form className="flex items-center gap-2" role="search">
          {Object.entries({ estado, responsable, desde, hasta, vence: porVencer ? "1" : undefined }).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
          <Input name="q" defaultValue={busqueda} placeholder="Paciente o número (P-0012)" aria-label="Buscar por paciente o número" className="w-64" maxLength={80} />
          <Button type="submit" variant="outline">Buscar</Button>
        </form>
        <FiltrosUrl filtros={[
          { tipo: "select", clave: "estado", etiqueta: "Estado", todos: "Todos los estados", opciones: ESTADOS_VISIBLES.map((e) => ({ valor: e, texto: ETIQUETA_ESTADO[e] })), ancho: "w-52" },
          ...(responsables.length ? [{ tipo: "select" as const, clave: "responsable", etiqueta: "Responsable", todos: "Todos los responsables", ancho: "w-52", opciones: responsables.map((x) => ({ valor: x.id, texto: x.nombre })) }] : []),
          { tipo: "select", clave: "vence", etiqueta: "Vencimiento", todos: "Cualquier vencimiento", opciones: [{ valor: "1", texto: `Vencen en ${DIAS_POR_VENCER} días o menos` }], ancho: "w-60" },
          { tipo: "fecha", clave: "desde", etiqueta: "Desde" },
          { tipo: "fecha", clave: "hasta", etiqueta: "Hasta" },
        ]} />
      </div>

      <Card className="py-0">
        <CardContent className="px-0">
          {filas.length === 0 ? (
            <EstadoVacio icono={Calculator} titulo={hayFiltros ? "Ninguna cotización coincide con los filtros." : "Aún no hay cotizaciones."}
              accion={!hayFiltros ? <Button asChild size="sm"><Link href="/presupuestos/nuevo"><Plus /> Crear la primera</Link></Button> : undefined} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 md:pl-6">Número</TableHead>
                  <TableHead>Paciente</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="hidden md:table-cell">Responsable</TableHead>
                  <TableHead className="hidden md:table-cell">Vence</TableHead>
                  <TableHead className="hidden md:table-cell">Última actividad</TableHead>
                  <TableHead className="pr-4 md:pr-6">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="pl-4 font-medium md:pl-6"><Link href={`/presupuestos/${p.id}`} className="underline-offset-4 hover:underline">{numeroPresupuesto(p.numero)}</Link></TableCell>
                    <TableCell className="max-w-48 truncate capitalize">{p.paciente.nombre.toLowerCase()}</TableCell>
                    <TableCell className="text-right tabular-nums">{cop(totalGuardado(p.items))}</TableCell>
                    <TableCell className="hidden md:table-cell">{(p.profesionalId && nombres.get(p.profesionalId)) || "—"}</TableCell>
                    <TableCell className="hidden md:table-cell">{p.validoHasta ? fechaCorta(p.validoHasta, true) : "—"}</TableCell>
                    <TableCell className="hidden md:table-cell">{fechaCorta(p.actualizadoEn)}</TableCell>
                    <TableCell className="pr-4 md:pr-6"><BadgePresupuesto estado={estadoVisible({ estado: p.estado as EstadoPres, validoHasta: p.validoHasta }, ahora)} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
