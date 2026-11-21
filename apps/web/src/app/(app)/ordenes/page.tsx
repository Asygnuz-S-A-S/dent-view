import { prisma, type Prisma } from "@dent-view/db";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ESTADOS_ORDEN, ETIQUETA_ESTADO_ORDEN, numeroDeBusqueda, numeroOrden, VARIANTE_ESTADO_ORDEN } from "@/lib/ordenes";
import { cop, totalOrden } from "@/lib/precios";
import { GESTION } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";
import { fechaCorta } from "@/lib/fechas";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";

export const dynamic = "force-dynamic";

const fecha = fechaCorta;

export default async function Ordenes({ searchParams }: { searchParams: Promise<{ estado?: string; q?: string }> }) {
  const ctx = await exigirContexto();
  const { estado, q } = await searchParams;
  const estadoValido = ESTADOS_ORDEN.find((e) => e === estado);
  const busqueda = q?.trim();

  const where: Prisma.OrdenWhereInput = { organizationId: ctx.organizationId };
  if (ctx.rol === "doctor_remitente") where.doctorRemitenteId = ctx.usuario.id;
  if (estadoValido) where.estado = estadoValido;
  if (busqueda) {
    const numero = numeroDeBusqueda(busqueda);
    where.OR = [
      { paciente: { nombre: { contains: busqueda, mode: "insensitive" } } },
      { paciente: { persona: { numeroDocumento: { contains: busqueda } } } },
      ...(numero !== null ? [{ numero }] : []),
    ];
  }
  const ordenes = await prisma.orden.findMany({
    where,
    include: { paciente: { include: { persona: true } }, doctorRemitente: true, items: true },
    orderBy: { numero: "desc" },
    take: 200,
  });
  const puedeCrear = ctx.rol === "doctor_remitente" || (GESTION as readonly string[]).includes(ctx.rol);
  const enlace = (e?: string) => `/ordenes?${new URLSearchParams({ ...(e ? { estado: e } : {}), ...(busqueda ? { q: busqueda } : {}) })}`;

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
          {estadoValido && <input type="hidden" name="estado" value={estadoValido} />}
          <Input name="q" defaultValue={busqueda} placeholder="Paciente, documento o #" aria-label="Buscar orden" className="w-full sm:w-64" />
          <Button type="submit" size="icon" variant="outline" aria-label="Buscar"><Search /></Button>
        </form>
      </div>

      <Card className="py-0">
        <CardContent className="px-0">
          {ordenes.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-8 text-center text-sm text-muted-foreground">
              <p>{busqueda || estadoValido ? "Ninguna orden coincide con los filtros." : "Aún no hay órdenes."}</p>
              {puedeCrear && !busqueda && !estadoValido && <Button asChild size="sm"><Link href="/ordenes/nueva"><Plus /> Crear la primera orden</Link></Button>}
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
                      <span className="block truncate">{o.paciente.nombre.toLowerCase()}</span>
                      <span className="block text-xs text-muted-foreground xl:hidden">{fecha(o.creadoEn)} · {cop(totalOrden(o.items))}</span>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">{o.doctorRemitente?.name ?? "—"}</TableCell>
                    <TableCell className="hidden max-w-[16rem] truncate text-muted-foreground xl:table-cell">
                      {o.items.map((i) => i.nombre).join(", ")}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">{o.entrega === "IMPRESA" ? "Impresa" : "Digital"}</TableCell>
                    <TableCell className="hidden text-right xl:table-cell">{cop(totalOrden(o.items))}</TableCell>
                    <TableCell className="pr-4 md:pr-6"><Badge variant={VARIANTE_ESTADO_ORDEN[o.estado]}>{ETIQUETA_ESTADO_ORDEN[o.estado]}</Badge></TableCell>
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
