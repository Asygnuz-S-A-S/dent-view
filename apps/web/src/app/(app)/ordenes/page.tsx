import { prisma, type Prisma } from "@dent-view/db";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ESTADOS_ORDEN, ETIQUETA_ESTADO_ORDEN, numeroDeBusqueda, numeroOrden } from "@/lib/ordenes";
import { cop, totalOrden } from "@/lib/precios";
import { GESTION } from "@/lib/roles";
import { idsPacientesPorNombre } from "@/lib/busqueda";
import { documentoDeBusqueda } from "@/lib/pacientes";
import { exigirContexto } from "@/lib/sesion";
import { Badge } from "@/components/ui/badge";
import { estadoRipsDeOrdenes } from "@/lib/rips/datos";
import { fechaCorta } from "@/lib/fechas";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { BadgeOrden } from "@/components/comunes/estado-badge";
import { FiltrosUrl } from "@/components/comunes/filtros-url";
import { bogotaAUtc, esFecha } from "@/lib/agenda";
import { calcularPagina } from "@/lib/paginacion";
import { Paginacion } from "@/components/comunes/paginacion";

export const dynamic = "force-dynamic";

const fecha = fechaCorta;

export default async function Ordenes({ searchParams }: { searchParams: Promise<{ estado?: string; q?: string; doctor?: string; desde?: string; hasta?: string; pagina?: string; rips?: string }> }) {
  const ctx = await exigirContexto();
  const { estado, q, doctor, desde: d0, hasta: h0, pagina, rips: rips0 } = await searchParams;
  const estadoValido = ESTADOS_ORDEN.find((e) => e === estado);
  const busqueda = q?.trim();
  const desde = esFecha(d0) ? d0 : undefined;
  const hasta = esFecha(h0) ? h0 : undefined;
  const esDoctor = ctx.rol === "doctor_remitente";
  // Los doctores del centro (los remitentes solo ven lo suyo, no necesitan el filtro).
  const doctores = esDoctor ? [] : await prisma.member.findMany({
    where: { organizationId: ctx.organizationId, role: "doctor_remitente" },
    select: { userId: true, user: { select: { name: true } } },
    orderBy: { user: { name: "asc" } },
  });
  const doctorValido = doctores.find((d) => d.userId === doctor)?.userId;

  const where: Prisma.OrdenWhereInput = { organizationId: ctx.organizationId };
  if (ctx.rol === "doctor_remitente") where.doctorRemitenteId = ctx.usuario.id;
  if (estadoValido) where.estado = estadoValido;
  if (doctorValido) where.doctorRemitenteId = doctorValido;
  if (desde || hasta) where.creadoEn = { ...(desde ? { gte: bogotaAUtc(desde, 0) } : {}), ...(hasta ? { lt: bogotaAUtc(hasta, 24 * 60) } : {}) };
  if (busqueda) {
    const numero = numeroDeBusqueda(busqueda);
    where.OR = [
      { pacienteId: { in: await idsPacientesPorNombre(ctx.organizationId, busqueda) } },
      { paciente: { persona: { numeroDocumento: { contains: documentoDeBusqueda(busqueda) || "#sin-documento#" } } } },
      ...(numero !== null ? [{ numero }] : []),
    ];
  }
  // Columna y filtro RIPS: solo si el centro genera RIPS (el doctor remitente no los ve).
  const conRips = !esDoctor && !!(await prisma.configFacturacion.findUnique({ where: { organizationId: ctx.organizationId }, select: { generaRips: true } }))?.generaRips;
  const ripsFiltro = conRips && (rips0 === "lista" || rips0 === "incompleta") ? rips0 : undefined;
  if (ripsFiltro) {
    // shortcut: el estado RIPS se calcula en memoria; con decenas de miles de órdenes filtradas pasar a una columna persistida.
    const candidatas = await prisma.orden.findMany({ where, select: { id: true } });
    const estados = await estadoRipsDeOrdenes(ctx.organizationId, candidatas.map((c) => c.id));
    where.id = { in: candidatas.filter((c) => estados.get(c.id) === (ripsFiltro === "lista")).map((c) => c.id) };
  }
  const total = await prisma.orden.count({ where });
  const pg = calcularPagina(pagina, total);
  const ordenes = await prisma.orden.findMany({
    where,
    include: { paciente: { include: { persona: true } }, doctorRemitente: true, items: true },
    orderBy: { numero: "desc" },
    skip: pg.skip,
    take: pg.take,
  });
  const estadosRips = conRips ? await estadoRipsDeOrdenes(ctx.organizationId, ordenes.map((o) => o.id)) : new Map<string, boolean>();
  const puedeCrear = ctx.rol === "doctor_remitente" || (GESTION as readonly string[]).includes(ctx.rol);
  const extra = { ...(busqueda ? { q: busqueda } : {}), ...(doctorValido ? { doctor: doctorValido } : {}), ...(desde ? { desde } : {}), ...(hasta ? { hasta } : {}), ...(ripsFiltro ? { rips: ripsFiltro } : {}) };
  const enlace = (e?: string) => `/ordenes?${new URLSearchParams({ ...(e ? { estado: e } : {}), ...extra })}`;
  const hayFiltros = !!(busqueda || estadoValido || doctorValido || desde || hasta || ripsFiltro);
  const enlaceRips = (v?: string) => `/ordenes?${new URLSearchParams({ ...(estadoValido ? { estado: estadoValido } : {}), ...extra, rips: v ?? "" })}`.replace(/&?rips=(&|$)/, "$1");

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Órdenes de remisión"
        descripcion="Solicitudes de estudios y su avance hasta la entrega."
        acciones={puedeCrear && (<Button asChild><Link href="/ordenes/nueva"><Plus /> Nueva orden</Link></Button>)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant={estadoValido ? "outline" : "default"}><Link href={enlace()}>Todas</Link></Button>
        {ESTADOS_ORDEN.map((e) => (
          <Button key={e} asChild size="sm" variant={estadoValido === e ? "default" : "outline"}>
            <Link href={enlace(e)}>{ETIQUETA_ESTADO_ORDEN[e]}</Link>
          </Button>
        ))}
        <form className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto" role="search">
          {Object.entries({ ...(estadoValido ? { estado: estadoValido } : {}), ...extra, q: undefined }).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
          <Input name="q" defaultValue={busqueda} placeholder="Paciente, documento o #" aria-label="Buscar orden" className="w-full sm:w-64" />
          <Button type="submit" size="icon" variant="outline" aria-label="Buscar"><Search /></Button>
        </form>
      </div>

      {conRips && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtro RIPS">
          <span className="text-sm text-muted-foreground">RIPS:</span>
          <Button asChild size="sm" variant={ripsFiltro ? "outline" : "default"}><Link href={enlaceRips()}>Todas</Link></Button>
          <Button asChild size="sm" variant={ripsFiltro === "lista" ? "default" : "outline"}><Link href={enlaceRips("lista")}>Listas</Link></Button>
          <Button asChild size="sm" variant={ripsFiltro === "incompleta" ? "default" : "outline"}><Link href={enlaceRips("incompleta")}>Incompletas</Link></Button>
        </div>
      )}

      <FiltrosUrl filtros={[
        ...(esDoctor ? [] : [{ tipo: "select" as const, clave: "doctor", etiqueta: "Doctor remitente", todos: "Todos los doctores", ancho: "w-56", opciones: doctores.map((d) => ({ valor: d.userId, texto: d.user.name })) }]),
        { tipo: "fecha", clave: "desde", etiqueta: "Desde" },
        { tipo: "fecha", clave: "hasta", etiqueta: "Hasta" },
      ]} />

      <Card className="py-0">
        <CardContent className="px-0">
          {ordenes.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-8 text-center text-sm text-muted-foreground">
              <p>{hayFiltros ? "Ninguna orden coincide con los filtros." : "Aún no hay órdenes."}</p>
              {puedeCrear && !hayFiltros && <Button asChild size="sm"><Link href="/ordenes/nueva"><Plus /> Crear la primera orden</Link></Button>}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 md:pl-6">N.º</TableHead>
                  <TableHead className="hidden xl:table-cell">Fecha</TableHead>
                  <TableHead>Paciente</TableHead>
                  <TableHead className="hidden xl:table-cell">Doctor remitente</TableHead>
                  <TableHead className="hidden xl:table-cell">Servicios</TableHead>
                  <TableHead className="hidden xl:table-cell">Entrega</TableHead>
                  <TableHead className="hidden text-right xl:table-cell">Total</TableHead>
                  {conRips && <TableHead>RIPS</TableHead>}
                  <TableHead className="pr-4 md:pr-6">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordenes.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="pl-4 font-medium md:pl-6">
                      <Link href={`/ordenes/${o.id}`} className="underline-offset-4 hover:underline">{numeroOrden(o.numero)}</Link>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">{fecha(o.creadoEn)}</TableCell>
                    <TableCell className="max-w-[12rem] whitespace-normal capitalize">
                      <span className="block truncate capitalize">{o.paciente.nombre.toLowerCase()}</span>
                      <span className="block text-xs text-muted-foreground xl:hidden">{fecha(o.creadoEn)} · {cop(totalOrden(o.items))}</span>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">{o.doctorRemitente?.name ?? "—"}</TableCell>
                    <TableCell className="hidden max-w-[16rem] truncate text-muted-foreground xl:table-cell">
                      {o.items.map((i) => i.nombre).join(", ")}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">{o.entrega === "IMPRESA" ? "Impresa" : "Digital"}</TableCell>
                    <TableCell className="hidden text-right xl:table-cell">{cop(totalOrden(o.items))}</TableCell>
                    {conRips && <TableCell><Badge variant={estadosRips.get(o.id) ? "success" : "warning"}>{estadosRips.get(o.id) ? "Lista" : "Incompleta"}</Badge></TableCell>}
                    <TableCell className="pr-4 md:pr-6"><BadgeOrden estado={o.estado} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Paginacion ruta="/ordenes" params={{ ...(estadoValido ? { estado: estadoValido } : {}), ...extra }} {...pg} total={total} />
    </div>
  );
}
