// Adaptado de OpenDentist (MIT, © 2026 Clawnify) — https://github.com/clawnify/OpenDentist
import { prisma, type Prisma } from "@dent-view/db";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { aCargoDe, nombresDoctores } from "@/lib/facturacion-datos";
import { ESTADOS_FACTURA, ETIQUETA_ESTADO_FACTURA, numeroFactura, saldo, totalPagado } from "@/lib/facturacion";
import { cop } from "@/lib/precios";
import { GESTION } from "@/lib/roles";
import { idsPacientesPorNombre } from "@/lib/busqueda";
import { documentoDeBusqueda } from "@/lib/pacientes";
import { numeroDeBusqueda } from "@/lib/ordenes";
import { exigirContexto } from "@/lib/sesion";
import { fechaCorta } from "@/lib/fechas";
import { calcularPagina } from "@/lib/paginacion";
import { Paginacion } from "@/components/comunes/paginacion";
import { InsigniaFev } from "@/components/facturacion/insignia-fev";
import type { EstadoDoc } from "@/lib/fe/estados";
import { BadgeCuenta, estadoCuenta } from "@/components/comunes/estado-badge";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";

export const dynamic = "force-dynamic";

const fecha = fechaCorta;

export default async function Facturacion({ searchParams }: { searchParams: Promise<{ estado?: string; q?: string; pagina?: string }> }) {
  const ctx = await exigirContexto(GESTION);
  const { estado, q, pagina } = await searchParams;
  const estadoValido = ESTADOS_FACTURA.find((e) => e === estado);
  const busqueda = q?.trim();

  const where: Prisma.FacturaWhereInput = { organizationId: ctx.organizationId };
  if (estadoValido) where.estado = estadoValido;
  if (busqueda) {
    const numero = numeroDeBusqueda(busqueda.replace(/^fc-?/i, ""));
    where.OR = [
      { pacienteId: { in: await idsPacientesPorNombre(ctx.organizationId, busqueda) } },
      { paciente: { persona: { numeroDocumento: { contains: documentoDeBusqueda(busqueda) || "#sin-documento#" } } } },
      { convenio: { contains: busqueda, mode: "insensitive" } },
      ...(numero !== null ? [{ numero }] : []),
    ];
  }
  const total = await prisma.factura.count({ where });
  const pg = calcularPagina(pagina, total);
  const facturas = await prisma.factura.findMany({
    where,
    include: { paciente: { include: { persona: true } }, pagos: { where: { anuladoEn: null }, select: { valor: true } } },
    orderBy: { numero: "desc" },
    skip: pg.skip,
    take: pg.take,
  });
  // Columna FEV solo si el centro emite factura electrónica.
  const emiteFev = !!(await prisma.configFacturacion.findUnique({ where: { organizationId: ctx.organizationId }, select: { emiteFev: true } }))?.emiteFev;
  const estadoFev = new Map(emiteFev ? (await prisma.documentoElectronico.findMany({ where: { organizationId: ctx.organizationId, tipo: "FACTURA", facturaId: { in: facturas.map((f) => f.id) } }, select: { facturaId: true, estado: true } })).map((d) => [d.facturaId, d.estado as EstadoDoc]) : []);
  const doctores = await nombresDoctores(ctx.organizationId, facturas.map((f) => f.responsableId));
  const enlace = (e?: string) => `/facturacion?${new URLSearchParams({ ...(e ? { estado: e } : {}), ...(busqueda ? { q: busqueda } : {}) })}`;

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Facturación"
        descripcion="Cuentas de cobro internas del centro. No son factura electrónica DIAN."
        acciones={<Button asChild><Link href="/facturacion/nueva"><Plus /> Nueva cuenta de cobro</Link></Button>}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant={estadoValido ? "outline" : "default"}><Link href={enlace()}>Todas</Link></Button>
        {ESTADOS_FACTURA.map((e) => (
          <Button key={e} asChild size="sm" variant={estadoValido === e ? "default" : "outline"}>
            <Link href={enlace(e)}>{ETIQUETA_ESTADO_FACTURA[e]}</Link>
          </Button>
        ))}
        <form className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto" role="search">
          {estadoValido && <input type="hidden" name="estado" value={estadoValido} />}
          <Input name="q" defaultValue={busqueda} placeholder="N.º, paciente, documento o convenio" aria-label="Buscar cuenta de cobro" className="w-full sm:w-72" />
          <Button type="submit" size="icon" variant="outline" aria-label="Buscar"><Search /></Button>
        </form>
      </div>

      <Card className="py-0">
        <CardContent className="px-0">
          {facturas.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-8 text-center text-sm text-muted-foreground">
              <p>{busqueda || estadoValido ? "Ninguna cuenta de cobro coincide con los filtros." : "Aún no hay cuentas de cobro."}</p>
              {!busqueda && !estadoValido && <Button asChild size="sm"><Link href="/facturacion/nueva"><Plus /> Crear la primera cuenta de cobro</Link></Button>}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 md:pl-6">N.º</TableHead>
                  <TableHead className="hidden lg:table-cell">Fecha</TableHead>
                  <TableHead>A cargo de</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Total</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Abonado</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className={emiteFev ? undefined : "pr-4 md:pr-6"}>Estado</TableHead>
                  {emiteFev && <TableHead className="hidden pr-4 md:table-cell md:pr-6">FEV</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {facturas.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="pl-4 font-medium md:pl-6">
                      <Link href={`/facturacion/${f.id}`} className="underline-offset-4 hover:underline">{numeroFactura(f.numero)}</Link>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{fecha(f.fecha)}</TableCell>
                    <TableCell className="max-w-[9rem] whitespace-normal capitalize">
                      <span className="block truncate capitalize">{aCargoDe(f, doctores, f.paciente?.nombre.toLowerCase() ?? "—")}</span>
                      <span className="block text-xs text-muted-foreground lg:hidden">{fecha(f.fecha)} · {cop(f.total)}</span>
                    </TableCell>
                    <TableCell className="hidden text-right lg:table-cell">{cop(f.total)}</TableCell>
                    <TableCell className="hidden text-right lg:table-cell">{cop(totalPagado(f.pagos))}</TableCell>
                    <TableCell className="text-right">{f.estado === "ANULADA" ? "—" : cop(saldo(f.total, f.pagos))}</TableCell>
                    <TableCell className={emiteFev ? undefined : "pr-4 md:pr-6"}><BadgeCuenta estado={estadoCuenta(f)} /></TableCell>
                    {emiteFev && <TableCell className="hidden pr-4 md:table-cell md:pr-6">{estadoFev.get(f.id) ? <InsigniaFev estado={estadoFev.get(f.id)!} /> : <span className="text-muted-foreground">—</span>}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Paginacion ruta="/facturacion" params={{ ...(estadoValido ? { estado: estadoValido } : {}), q: busqueda }} {...pg} total={total} />
    </div>
  );
}
