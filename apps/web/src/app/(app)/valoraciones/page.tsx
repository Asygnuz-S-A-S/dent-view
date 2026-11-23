import { prisma, type Prisma } from "@dent-view/db";
import { ClipboardList, Hourglass, Plus, Timer } from "lucide-react";
import Link from "next/link";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { EstadoVacio } from "@/components/comunes/estado-vacio";
import { FiltrosUrl } from "@/components/comunes/filtros-url";
import { Kpi } from "@/components/comunes/kpi";
import { BadgeValoracion } from "@/components/valoraciones/estado-valoracion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { bogotaAUtc, esFecha } from "@/lib/agenda";
import { fechaCorta } from "@/lib/fechas";
import { exigirContexto } from "@/lib/sesion";
import { ESTADOS, ETIQUETA_ESTADO, ROLES_VER_VALORACIONES, duracionLegible, estadoEfectivo, filtroEstado, filtroValoraciones, promedioRespuestaMs, puedeCrearValoracion, type EstadoVal } from "@/lib/valoraciones";
import { odontologosDelCentro } from "@/lib/valoraciones-servidor";

export const dynamic = "force-dynamic";

export default async function Valoraciones({ searchParams }: { searchParams: Promise<{ estado?: string; doctor?: string; ciudad?: string; desde?: string; hasta?: string }> }) {
  const ctx = await exigirContexto(ROLES_VER_VALORACIONES);
  const org = ctx.organizationId;
  const q = await searchParams;
  const base = filtroValoraciones(org, ctx.usuario.id, ctx.rol);
  const ahora = new Date();
  const estado = ESTADOS.find((e) => e === q.estado);
  const desde = esFecha(q.desde) ? q.desde : undefined, hasta = esFecha(q.hasta) ? q.hasta : undefined;
  const [odontologos, ciudades] = await Promise.all([
    ctx.rol === "especialista" ? [] : odontologosDelCentro(org),
    prisma.valoracion.findMany({ where: { ...base, ciudad: { not: null } }, distinct: ["ciudad"], select: { ciudad: true }, orderBy: { ciudad: "asc" }, take: 100 }),
  ]);
  const doctor = odontologos.find((o) => o.userId === q.doctor)?.userId;
  const ciudad = ciudades.find((c) => c.ciudad === q.ciudad)?.ciudad ?? undefined;

  const where: Prisma.ValoracionWhereInput = {
    ...base, ...(estado ? filtroEstado(estado, ahora) : {}), ...(doctor ? { doctorId: doctor } : {}), ...(ciudad ? { ciudad } : {}),
    ...(desde || hasta ? { creadoEn: { ...(desde ? { gte: bogotaAUtc(desde, 0) } : {}), ...(hasta ? { lt: bogotaAUtc(hasta, 24 * 60) } : {}) } } : {}),
  };
  const [filas, porRevisar, esperando, completadas] = await Promise.all([
    prisma.valoracion.findMany({ where, include: { doctor: { select: { name: true } }, _count: { select: { medios: true } } }, orderBy: { creadoEn: "desc" }, take: 200 }),
    prisma.valoracion.count({ where: { ...base, estado: { in: ["RECIBIDA", "EN_REVISION"] } } }),
    prisma.valoracion.count({ where: { ...base, estado: { in: ["PENDIENTE_PACIENTE", "REQUIERE_MAS_INFO"] }, expiraEn: { gt: ahora } } }),
    prisma.valoracion.findMany({ where: { ...base, estado: "COMPLETADA", completadaEn: { gte: new Date(ahora.getTime() - 90 * 86_400_000) } }, select: { id: true, completadaEn: true }, take: 200 }),
  ]);
  // Respuesta = desde que el paciente envía (evento valoracion.recibida) hasta que se completa; con reenvíos cuenta la primera recepción.
  const eventos = completadas.length
    ? await prisma.evento.findMany({ where: { organizationId: org, tipo: "valoracion.recibida", creadoEn: { gte: new Date(ahora.getTime() - 120 * 86_400_000) } }, select: { creadoEn: true, detalle: true }, orderBy: { creadoEn: "asc" }, take: 2000 })
    : [];
  const recibida = new Map<string, Date>();
  for (const e of eventos) { const id = (e.detalle as { valoracionId?: string } | null)?.valoracionId; if (id && !recibida.has(id)) recibida.set(id, e.creadoEn); }
  const medio = promedioRespuestaMs(completadas.flatMap((c) => (recibida.has(c.id) && c.completadaEn ? [{ desde: recibida.get(c.id)!, hasta: c.completadaEn }] : [])));
  const hayFiltros = !!(estado || doctor || ciudad || desde || hasta);

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Valoraciones virtuales"
        descripcion="Fotos y videos que envían los pacientes a distancia y la valoración que entrega el odontólogo."
        acciones={puedeCrearValoracion(ctx.rol) && <Button asChild><Link href="/valoraciones/nueva"><Plus /> Nueva valoración</Link></Button>}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi titulo="Por revisar" valor={porRevisar} nota="Recibidas y en revisión" icono={ClipboardList} href="/valoraciones?estado=RECIBIDA" />
        <Kpi titulo="Esperando al paciente" valor={esperando} nota="Con enlace vigente" icono={Hourglass} href="/valoraciones?estado=PENDIENTE_PACIENTE" />
        <Kpi titulo="Tiempo medio de respuesta" valor={duracionLegible(medio)} nota="Desde que llega hasta la valoración (90 días)" icono={Timer} />
      </div>
      <FiltrosUrl filtros={[
        { tipo: "select", clave: "estado", etiqueta: "Estado", todos: "Todos los estados", opciones: ESTADOS.map((e) => ({ valor: e, texto: ETIQUETA_ESTADO[e] })), ancho: "w-56" },
        ...(ctx.rol === "especialista" ? [] : [{ tipo: "select" as const, clave: "doctor", etiqueta: "Odontólogo", todos: "Todos los odontólogos", ancho: "w-56", opciones: odontologos.map((o) => ({ valor: o.userId, texto: o.user.name })) }]),
        { tipo: "select", clave: "ciudad", etiqueta: "Ciudad", todos: "Todas las ciudades", opciones: ciudades.flatMap((c) => (c.ciudad ? [{ valor: c.ciudad, texto: c.ciudad }] : [])) },
        { tipo: "fecha", clave: "desde", etiqueta: "Desde" },
        { tipo: "fecha", clave: "hasta", etiqueta: "Hasta" },
      ]} />
      <Card className="py-0">
        <CardContent className="px-0">
          {filas.length === 0 ? (
            <EstadoVacio icono={ClipboardList} titulo={hayFiltros ? "Ninguna valoración coincide con los filtros." : "Aún no hay valoraciones virtuales."}
              accion={puedeCrearValoracion(ctx.rol) && !hayFiltros ? <Button asChild size="sm"><Link href="/valoraciones/nueva"><Plus /> Crear la primera</Link></Button> : undefined} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 md:pl-6">Paciente</TableHead>
                  <TableHead className="hidden md:table-cell">Ciudad</TableHead>
                  <TableHead className="hidden md:table-cell">Odontólogo</TableHead>
                  <TableHead className="hidden md:table-cell">Archivos</TableHead>
                  <TableHead className="hidden md:table-cell">Creada</TableHead>
                  <TableHead className="pr-4 md:pr-6">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="pl-4 font-medium md:pl-6">
                      <Link href={`/valoraciones/${v.id}`} className="underline-offset-4 hover:underline">{v.nombre}</Link>
                      <span className="block text-xs font-normal text-muted-foreground md:hidden">{[v.ciudad, fechaCorta(v.creadoEn)].filter(Boolean).join(" · ")}</span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{v.ciudad ?? "—"}</TableCell>
                    <TableCell className="hidden md:table-cell">{v.doctor?.name ?? "Sin asignar"}</TableCell>
                    <TableCell className="hidden md:table-cell">{v._count.medios}</TableCell>
                    <TableCell className="hidden md:table-cell">{fechaCorta(v.creadoEn)}</TableCell>
                    <TableCell className="pr-4 md:pr-6"><BadgeValoracion estado={estadoEfectivo({ estado: v.estado as EstadoVal, expiraEn: v.expiraEn }, ahora)} /></TableCell>
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
