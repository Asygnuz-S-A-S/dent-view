import { prisma } from "@dent-view/db";
import { Link2, Send } from "lucide-react";
import Link from "next/link";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { EstadoVacio } from "@/components/comunes/estado-vacio";
import { FiltrosUrl } from "@/components/comunes/filtros-url";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fechaHora } from "@/lib/fechas";
import { ESTADOS, ETIQUETA_ESTADO, SELECT_DESTINO, SELECT_ORIGEN } from "@/lib/remisiones";
import { VARIANTE_REMISION } from "@/components/remisiones/estado-remision";
import { CLINICOS } from "@/lib/roles";
import { exigirContexto, exigirModulo } from "@/lib/sesion";

export const dynamic = "force-dynamic";

export default async function Remisiones({ searchParams }: { searchParams: Promise<{ vista?: string; estado?: string }> }) {
  const ctx = await exigirContexto(CLINICOS);
  await exigirModulo(ctx, "remisiones");
  const org = ctx.organizationId;
  const { vista, estado } = await searchParams;
  const recibidas = vista === "recibidas";
  const estadoValido = ESTADOS.find((e) => e === estado);
  const propio = recibidas ? { destinoId: org } : { origenId: org };

  const [conteo, enviadas, recibidasLista, pendientesVinculo] = await Promise.all([
    prisma.remision.groupBy({ by: ["estado"], where: propio, _count: true }),
    recibidas ? [] : prisma.remision.findMany({ where: { origenId: org, ...(estadoValido ? { estado: estadoValido } : {}) }, select: SELECT_ORIGEN, orderBy: { creadoEn: "desc" }, take: 100 }),
    recibidas ? prisma.remision.findMany({ where: { destinoId: org, ...(estadoValido ? { estado: estadoValido } : {}) }, select: SELECT_DESTINO, orderBy: { creadoEn: "desc" }, take: 100 }) : [],
    ctx.rol === "admin_tenant" ? prisma.vinculoCentro.count({ where: { receptorId: org, estado: "PENDIENTE" } }) : 0,
  ]);
  const filas = recibidas
    ? recibidasLista.map((r) => ({ id: r.id, centro: r.origen.name, nombre: r.nombre, doc: `${r.tipoDocumento} ${r.numeroDocumento}`, estado: r.estado, creadoEn: r.creadoEn }))
    : enviadas.map((r) => ({ id: r.id, centro: r.destino.name, nombre: r.nombre, doc: `${r.tipoDocumento} ${r.numeroDocumento}`, estado: r.estado, creadoEn: r.creadoEn }));
  const cuenta = (e: string) => conteo.find((c) => c.estado === e)?._count ?? 0;

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Remisiones"
        descripcion="Remite pacientes a otros centros vinculados y recibe sus remisiones. Solo se comparte la copia mínima que el paciente autoriza."
        acciones={ctx.rol === "admin_tenant" && (
          <Button asChild variant="outline">
            <Link href="/remisiones/vinculos"><Link2 /> Vínculos{pendientesVinculo > 0 && <Badge variant="warning">{pendientesVinculo}</Badge>}</Link>
          </Button>
        )}
      />
      <nav aria-label="Vista de remisiones" className="flex flex-wrap gap-2">
        <Button asChild variant={recibidas ? "outline" : "default"} size="sm"><Link href="/remisiones" aria-current={recibidas ? undefined : "page"}>Enviadas</Link></Button>
        <Button asChild variant={recibidas ? "default" : "outline"} size="sm"><Link href="/remisiones?vista=recibidas" aria-current={recibidas ? "page" : undefined}>Recibidas</Link></Button>
      </nav>
      <ul className="flex flex-wrap gap-2" aria-label="Contadores por estado">
        {ESTADOS.map((e) => <li key={e}><Badge variant={VARIANTE_REMISION[e]}>{ETIQUETA_ESTADO[e]}: {cuenta(e)}</Badge></li>)}
      </ul>
      <FiltrosUrl filtros={[{ tipo: "select", clave: "estado", etiqueta: "Estado", todos: "Todos los estados", opciones: ESTADOS.map((e) => ({ valor: e, texto: ETIQUETA_ESTADO[e] })) }]} />
      <Card className="py-0">
        <CardContent className="px-0">
          {filas.length === 0 ? (
            <EstadoVacio icono={Send} titulo={recibidas ? "Sin remisiones recibidas" : "Sin remisiones enviadas"} descripcion={recibidas ? "Cuando otro centro te remita un paciente, aparecerá aquí." : "Remite a un paciente desde su ficha, con el botón \"Remitir a otro centro\"."} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 md:pl-6">Paciente</TableHead>
                  <TableHead>{recibidas ? "Centro que remite" : "Centro destino"}</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="pr-4 md:pr-6">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="pl-4 md:pl-6"><Link href={`/remisiones/${f.id}`} className="font-medium underline-offset-4 hover:underline">{f.nombre}</Link><div className="text-xs text-muted-foreground tabular-nums">{f.doc}</div></TableCell>
                    <TableCell>{f.centro}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{fechaHora(f.creadoEn)}</TableCell>
                    <TableCell className="pr-4 md:pr-6"><Badge variant={VARIANTE_REMISION[f.estado]}>{ETIQUETA_ESTADO[f.estado]}</Badge></TableCell>
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
