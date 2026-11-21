import { prisma } from "@dent-view/db";
import { CalendarClock, CalendarDays, ChevronRight, ClipboardList, FileText, Inbox, Plus, ScanLine, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { EstadoVacio } from "@/components/comunes/estado-vacio";
import { GraficoEstudios } from "@/components/inicio/grafico-estudios";
import { PacienteDialog } from "@/components/pacientes/paciente-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { filtroEstudios } from "@/lib/acceso";
import { diaBogota, inicioDiaBogota, serieDiaria } from "@/lib/inicio";
import { exigirContexto } from "@/lib/sesion";
import { ETIQUETA_ESTADO_CITA, horaTexto, utcABogota, type EstadoCita } from "@/lib/agenda";
import { fechaCorta, fechaLarga } from "@/lib/fechas";
import { numeroOrden } from "@/lib/ordenes";
import { GESTION } from "@/lib/roles";

export const dynamic = "force-dynamic";

const DIA = 86_400_000;
const ESTADOS_ORDEN = {
  SOLICITADA: "Solicitada", AGENDADA: "Agendada", TOMADA: "Tomada",
  INFORMADA: "Informada", ENTREGADA: "Entregada", CANCELADA: "Cancelada",
} as const;
const ESTADOS_ESTUDIO = { POR_ASIGNAR: "Por asignar", ASIGNADO: "Asignado", PUBLICADO: "Publicado" } as const;

/** Indicador que lleva a donde se resuelve: la recepción ve el número y entra con un toque. */
function Kpi({ titulo, valor, nota, href, icono: Icono }: { titulo: string; valor: number; nota: string; href: string; icono: LucideIcon }) {
  return (
    <Link
      href={href}
      className="group rounded-xl border bg-card p-4 text-card-foreground transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{titulo}</span>
        <Icono className="size-4" aria-hidden />
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{valor}</p>
      <p className="mt-1 flex items-center gap-0.5 text-xs text-muted-foreground">
        {nota}
        <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </p>
    </Link>
  );
}

function Lista({ titulo, descripcion, filas, vacio }: {
  titulo: string; descripcion?: string; filas: { nombre: string; valor: string }[]; vacio: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        {descripcion && <CardDescription>{descripcion}</CardDescription>}
      </CardHeader>
      <CardContent>
        {filas.length === 0 ? (
          <p className="text-sm text-muted-foreground">{vacio}</p>
        ) : (
          <Table>
            <TableBody>
              {filas.map((f) => (
                <TableRow key={f.nombre}>
                  <TableCell className="pl-0 font-medium">{f.nombre}</TableCell>
                  <TableCell className="pr-0 text-right text-muted-foreground tabular-nums">{f.valor}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default async function Inicio() {
  const ctx = await exigirContexto();
  const ahora = new Date();
  const hoy = inicioDiaBogota(diaBogota(ahora));
  const mes = inicioDiaBogota(`${diaBogota(ahora).slice(0, 7)}-01`);

  if (ctx.rol === "doctor_remitente") {
    const [ordenes, estudios] = await Promise.all([
      prisma.orden.groupBy({
        by: ["estado"],
        where: { organizationId: ctx.organizationId, doctorRemitenteId: ctx.usuario.id },
        _count: true,
      }),
      prisma.estudio.groupBy({
        by: ["estado"],
        where: filtroEstudios(ctx.organizationId, ctx.usuario.id, ctx.rol),
        _count: true,
      }),
    ]);
    const filasOrdenes = ordenes.map((o) => ({ nombre: ESTADOS_ORDEN[o.estado], valor: String(o._count) }));
    const filasEstudios = estudios.map((e) => ({ nombre: ESTADOS_ESTUDIO[e.estado], valor: String(e._count) }));
    return (
      <div className="space-y-6">
        <EncabezadoPagina
          titulo={saludo(ctx.usuario.name, ahora)}
          descripcion={`${fechaLarga(ahora)}. El avance de tus órdenes y estudios.`}
          acciones={<>
            <Button asChild variant="outline"><Link href="/estudios"><ScanLine /> Mis estudios</Link></Button>
            <Button asChild><Link href="/ordenes/nueva"><Plus /> Nueva orden</Link></Button>
          </>}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Lista titulo="Mis órdenes por estado" filas={filasOrdenes} vacio="Aún no has creado órdenes." />
          <Lista titulo="Mis estudios por estado" filas={filasEstudios} vacio="Aún no tienes estudios." />
        </div>
      </div>
    );
  }

  const org = ctx.organizationId;
  const manana = new Date(hoy.getTime() + DIA);
  const [estudiosHoy, estudiosMes, porAsignar, ordenes, citasHoy, recientes, topMes, ultimos, doctores, porAgendar, borradores] = await Promise.all([
    prisma.estudio.count({ where: { organizationId: org, creadoEn: { gte: hoy } } }),
    prisma.estudio.count({ where: { organizationId: org, creadoEn: { gte: mes } } }),
    prisma.estudio.count({ where: { organizationId: org, estado: "POR_ASIGNAR" } }),
    prisma.orden.groupBy({ by: ["estado"], where: { organizationId: org }, _count: true }),
    prisma.cita.findMany({
      where: { organizationId: org, inicio: { gte: hoy, lt: manana }, estado: { not: "CANCELADA" } },
      select: { id: true, inicio: true, estado: true, sala: { select: { nombre: true } }, paciente: { select: { id: true, nombre: true } } },
      orderBy: { inicio: "asc" },
    }),
    prisma.estudio.findMany({
      where: { organizationId: org, creadoEn: { gte: new Date(ahora.getTime() - 31 * DIA) } },
      select: { creadoEn: true },
    }),
    prisma.estudio.groupBy({
      by: ["doctorRemitenteId"],
      where: { organizationId: org, creadoEn: { gte: mes }, doctorRemitenteId: { not: null } },
      _count: true,
      orderBy: { _count: { doctorRemitenteId: "desc" } },
      take: 5,
    }),
    prisma.estudio.groupBy({
      by: ["doctorRemitenteId"],
      where: { organizationId: org, doctorRemitenteId: { not: null } },
      _max: { creadoEn: true },
    }),
    prisma.member.findMany({ where: { organizationId: org, role: "doctor_remitente" }, include: { user: true } }),
    prisma.orden.findMany({
      where: { organizationId: org, estado: "SOLICITADA" },
      select: { id: true, numero: true, creadoEn: true, paciente: { select: { nombre: true } } },
      orderBy: { creadoEn: "asc" },
      take: 6,
    }),
    prisma.informe.count({ where: { organizationId: org, estado: "BORRADOR", vigente: true } }),
  ]);
  const solicitadas = ordenes.find((o) => o.estado === "SOLICITADA")?._count ?? 0;
  const pendientesCitas = citasHoy.filter((c) => !["ATENDIDA", "NO_ASISTIO"].includes(c.estado)).length;
  const gestion = (GESTION as readonly string[]).includes(ctx.rol);

  const nombres = new Map(doctores.map((d) => [d.userId, d.user.name]));
  const filasTop = topMes.flatMap((t) =>
    t.doctorRemitenteId ? [{ nombre: nombres.get(t.doctorRemitenteId) ?? "Doctor", valor: `${t._count} estudios` }] : [],
  );
  const ultimo = new Map(ultimos.map((u) => [u.doctorRemitenteId, u._max.creadoEn]));
  const limite = ahora.getTime() - 60 * DIA;
  const inactivos = doctores.flatMap((d) => {
    const ult = ultimo.get(d.userId) ?? null;
    // Sin estudios: cuenta desde que se unió al centro.
    const desde = ult ?? d.createdAt;
    return desde.getTime() < limite
      ? [{ nombre: d.user.name, valor: ult ? `último: ${fechaCorta(ult)}` : "sin estudios" }]
      : [];
  });

  return (
    <div className="space-y-8">
      <EncabezadoPagina
        titulo={saludo(ctx.usuario.name, ahora)}
        descripcion={`${fechaLarga(ahora)}. Lo que tu centro tiene para hoy.`}
        acciones={gestion && <>
          <PacienteDialog />
          <Button asChild><Link href="/ordenes/nueva"><Plus /> Nueva orden</Link></Button>
        </>}
      />

      <section aria-label="Pendientes de hoy" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi titulo="Citas de hoy" valor={citasHoy.length} nota={citasHoy.length ? `${pendientesCitas} por atender` : "Ver agenda"} href="/agenda" icono={CalendarDays} />
        <Kpi titulo="Órdenes por agendar" valor={solicitadas} nota={solicitadas ? "Solicitadas sin cita" : "Todo agendado"} href="/ordenes?estado=SOLICITADA" icono={CalendarClock} />
        <Kpi titulo="Estudios por asignar" valor={porAsignar} nota={porAsignar ? "Sin paciente o doctor" : "Todo al día"} href="/estudios?tab=por-asignar" icono={Inbox} />
        <Kpi titulo="Informes en borrador" valor={borradores} nota={borradores ? "Por firmar" : "Nada pendiente"} href="/informes" icono={FileText} />
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div className="space-y-1.5">
              <CardTitle>Agenda de hoy</CardTitle>
              <CardDescription>{citasHoy.length ? `${citasHoy.length} ${citasHoy.length === 1 ? "cita" : "citas"} en todas las salas` : "Sin citas programadas"}</CardDescription>
            </div>
            <Button asChild size="sm" variant="ghost"><Link href="/agenda">Abrir agenda <ChevronRight /></Link></Button>
          </CardHeader>
          <CardContent>
            {citasHoy.length === 0 ? (
              <EstadoVacio icono={CalendarDays} titulo="No hay citas para hoy" descripcion="Agenda las órdenes solicitadas desde la agenda o desde cada orden." className="py-6" />
            ) : (
              <ol className="divide-y">
                {citasHoy.slice(0, 8).map((c) => (
                  <li key={c.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="w-12 shrink-0 font-medium tabular-nums">{horaTexto(utcABogota(c.inicio).minutos)}</span>
                    <span className="min-w-0 flex-1">
                      {c.paciente ? (
                        <Link href={`/pacientes/${c.paciente.id}`} className="block truncate font-medium capitalize underline-offset-4 hover:underline">{c.paciente.nombre.toLowerCase()}</Link>
                      ) : <span className="block truncate text-muted-foreground">Sin paciente</span>}
                      <span className="block truncate text-xs text-muted-foreground">{c.sala.nombre}</span>
                    </span>
                    <Badge variant={c.estado === "ATENDIDA" ? "secondary" : "outline"}>{ETIQUETA_ESTADO_CITA[c.estado as EstadoCita]}</Badge>
                  </li>
                ))}
              </ol>
            )}
            {citasHoy.length > 8 && <p className="pt-2 text-xs text-muted-foreground">Y {citasHoy.length - 8} más en la agenda.</p>}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div className="space-y-1.5">
              <CardTitle>Órdenes por agendar</CardTitle>
              <CardDescription>Las más antiguas primero</CardDescription>
            </div>
            <Button asChild size="sm" variant="ghost"><Link href="/ordenes?estado=SOLICITADA">Ver todas <ChevronRight /></Link></Button>
          </CardHeader>
          <CardContent>
            {porAgendar.length === 0 ? (
              <EstadoVacio icono={ClipboardList} titulo="Nada por agendar" descripcion="Las órdenes nuevas aparecen aquí hasta que tengan cita." className="py-6" />
            ) : (
              <ul className="divide-y">
                {porAgendar.map((o) => (
                  <li key={o.id}>
                    <Link href={`/ordenes/${o.id}`} className="flex items-center gap-3 rounded-md py-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                      <span className="w-12 shrink-0 font-medium tabular-nums">{numeroOrden(o.numero)}</span>
                      <span className="min-w-0 flex-1 truncate capitalize">{o.paciente.nombre.toLowerCase()}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{fechaCorta(o.creadoEn)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="titulo-actividad" className="space-y-4">
        <h2 id="titulo-actividad" className="text-base font-semibold">Actividad del centro</h2>
        <Card>
          <CardHeader>
            <CardTitle>Estudios por día</CardTitle>
            <CardDescription>Últimos 30 días · {estudiosHoy} hoy · {estudiosMes} este mes</CardDescription>
          </CardHeader>
          <CardContent>
            {recientes.length === 0 ? (
              <EstadoVacio icono={ScanLine} titulo="Aún no hay estudios en este período" descripcion="Los estudios llegan solos desde los equipos del centro." className="py-6" />
            ) : (
              <GraficoEstudios datos={serieDiaria(recientes.map((r) => r.creadoEn), 30, ahora)} />
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          <Lista
            titulo="Órdenes por estado"
            filas={ordenes.map((o) => ({ nombre: ESTADOS_ORDEN[o.estado], valor: String(o._count) }))}
            vacio="Aún no hay órdenes."
          />
          <Lista titulo="Top doctores del mes" descripcion="Por estudios remitidos" filas={filasTop} vacio="Sin estudios remitidos este mes." />
          <Lista titulo="Doctores inactivos" descripcion="Más de 60 días sin remitir" filas={inactivos} vacio="Ningún doctor inactivo." />
        </div>
      </section>
    </div>
  );
}

/** "Buenos días, Ana": saludo según la hora de Bogotá y solo el primer nombre. */
function saludo(nombre: string, ahora: Date) {
  const hora = Math.floor(utcABogota(ahora).minutos / 60);
  const momento = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";
  // Si el nombre empieza con un título ("Dr. Pepito") se conserva con la persona: "Dr. Pepito", no "Dr.".
  const partes = nombre.trim().split(/\s+/);
  const titulo = /^(dr|dra|ing|lic|mg|esp)\.?$/i.test(partes[0] ?? "") && partes[1];
  return `${momento}, ${titulo ? `${partes[0]} ${partes[1]}` : partes[0]}`;
}
