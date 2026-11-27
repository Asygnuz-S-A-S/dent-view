import { prisma, type Prisma } from "@dent-view/db";
import { AlarmClock, ClipboardList, Hourglass, Plus, Timer } from "lucide-react";
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
import {
  ESTADOS, ETIQUETA_ESTADO, ETIQUETA_ETAPA, ETIQUETA_PESTANA, PESTANAS, ROLES_VER_VALORACIONES, duracionLegible, enPestana, estadoEfectivo, etapaValoracion, faltantes, filtroEstado,
  filtroValoraciones, metricasValoraciones, puedeCrearValoracion, siguienteAccion, type EstadoVal, type Pestana,
} from "@/lib/valoraciones";
import { contextoValoraciones, odontologosDelCentro } from "@/lib/valoraciones-servidor";

export const dynamic = "force-dynamic";
type Q = { estado?: string; doctor?: string; ciudad?: string; desde?: string; hasta?: string; pestana?: string };

export default async function Valoraciones({ searchParams }: { searchParams: Promise<Q> }) {
  const ctx = await exigirContexto(ROLES_VER_VALORACIONES);
  const org = ctx.organizationId;
  const q = await searchParams;
  const base = filtroValoraciones(org, ctx.usuario.id, ctx.rol);
  const ahora = new Date();
  const puedeValorar = (await contextoValoraciones())?.puedeValorar ?? false;
  const estado = ESTADOS.find((e) => e === q.estado);
  const desde = esFecha(q.desde) ? q.desde : undefined, hasta = esFecha(q.hasta) ? q.hasta : undefined;
  // Con un estado elegido en el filtro se muestran todas las etapas; sin él, la pestaña que pide la URL o «Por atender».
  const pestana: Pestana = PESTANAS.find((p) => p === q.pestana) ?? (estado ? "todas" : "atender");
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
  // Indicadores: solo las marcas de cada fila (sin recorrer eventos); las completadas se acotan a 90 días.
  const [filas, paraMetricas] = await Promise.all([
    prisma.valoracion.findMany({
      where,
      select: {
        id: true, nombre: true, ciudad: true, creadoEn: true, estado: true, expiraEn: true, ultimoAccesoEn: true, resultadoEnviadoEn: true, consentimientoEn: true,
        doctor: { select: { name: true } }, _count: { select: { medios: { where: { tipo: "FOTO" } } } },
        // Solo para saber si ya hay valoración escrita; el texto no sale del servidor.
        diagnosticoPreliminar: true, recomendaciones: true,
      },
      orderBy: { creadoEn: "desc" }, take: 500,
    }),
    prisma.valoracion.findMany({
      where: { ...base, OR: [{ estado: { in: ["PENDIENTE_PACIENTE", "RECIBIDA", "EN_REVISION", "REQUIERE_MAS_INFO"] } }, { estado: "COMPLETADA", completadaEn: { gte: new Date(ahora.getTime() - 90 * 86_400_000) } }] },
      select: { estado: true, expiraEn: true, ultimoAccesoEn: true, resultadoEnviadoEn: true, recibidaEn: true, completadaEn: true }, take: 2000,
    }),
  ]);
  const m = metricasValoraciones(paraMetricas.map((f) => ({ ...f, estado: f.estado as EstadoVal })), ahora);
  const conEtapa = filas.map((v) => {
    const etapa = etapaValoracion({ ...v, estado: v.estado as EstadoVal }, ahora);
    return { v, etapa, falta: faltantes({ etapa, consentimientoEn: v.consentimientoEn, fotos: v._count.medios, valoracionEscrita: !!(v.diagnosticoPreliminar && v.recomendaciones) }), accion: siguienteAccion(etapa, puedeValorar) };
  });
  const visibles = conEtapa.filter((f) => enPestana(pestana, f.etapa, puedeValorar));
  const hayFiltros = !!(estado || doctor || ciudad || desde || hasta);
  const hrefPestana = (p: Pestana) => {
    const sp = new URLSearchParams(Object.entries(q).filter(([k, val]) => k !== "pestana" && val) as [string, string][]);
    sp.set("pestana", p);
    return `/valoraciones?${sp}`;
  };
  const puedeCrear = puedeCrearValoracion(ctx.rol);

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Valoraciones virtuales"
        descripcion="Fotos y videos que envían los pacientes a distancia y la valoración que entrega el odontólogo."
        acciones={puedeCrear && <Button asChild><Link href="/valoraciones/nueva"><Plus /> Nueva valoración</Link></Button>}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi titulo="Por revisar" valor={m.porRevisar} nota="Recibidas y en revisión" icono={ClipboardList} href="/valoraciones?estado=RECIBIDA" />
        <Kpi titulo="Esperando al paciente" valor={m.esperando} nota="Con enlace vigente" icono={Hourglass} href="/valoraciones?pestana=esperando" />
        <Kpi titulo="Por vencer" valor={m.porVencer} nota="Vencen en menos de 48 horas" icono={AlarmClock} tono={m.porVencer ? "warning" : "primary"} href="/valoraciones?pestana=esperando" />
        <Kpi titulo="Tiempo medio de respuesta" valor={duracionLegible(m.tiempoMedioMs)} nota="Desde que llega hasta la valoración (90 días)" icono={Timer} />
      </div>
      <nav aria-label="Pestañas de la lista">
        <ul className="flex gap-1 overflow-x-auto border-b">
          {PESTANAS.map((p) => {
            const n = conEtapa.filter((f) => enPestana(p, f.etapa, puedeValorar)).length, activa = p === pestana;
            return (
              <li key={p} className="shrink-0">
                <Link href={hrefPestana(p)} aria-current={activa ? "page" : undefined}
                  className={`-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${activa ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                  {ETIQUETA_PESTANA[p]}<span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-foreground">{n}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <FiltrosUrl filtros={[
        { tipo: "select", clave: "estado", etiqueta: "Estado", todos: "Todos los estados", opciones: ESTADOS.map((e) => ({ valor: e, texto: ETIQUETA_ESTADO[e] })), ancho: "w-56" },
        ...(ctx.rol === "especialista" ? [] : [{ tipo: "select" as const, clave: "doctor", etiqueta: "Odontólogo", todos: "Todos los odontólogos", ancho: "w-56", opciones: odontologos.map((o) => ({ valor: o.userId, texto: o.user.name })) }]),
        { tipo: "select", clave: "ciudad", etiqueta: "Ciudad", todos: "Todas las ciudades", opciones: ciudades.flatMap((c) => (c.ciudad ? [{ valor: c.ciudad, texto: c.ciudad }] : [])) },
        { tipo: "fecha", clave: "desde", etiqueta: "Desde" },
        { tipo: "fecha", clave: "hasta", etiqueta: "Hasta" },
      ]} />
      {visibles.length === 0 ? (
        <Card className="py-0"><CardContent className="px-0">
          <EstadoVacio icono={ClipboardList} titulo={hayFiltros || pestana !== "todas" ? "No hay valoraciones en esta vista." : "Aún no hay valoraciones virtuales."}
            accion={puedeCrear && !hayFiltros && pestana === "todas" ? <Button asChild size="sm"><Link href="/valoraciones/nueva"><Plus /> Crear la primera</Link></Button> : undefined} />
        </CardContent></Card>
      ) : (<>
        {/* Móvil (390 px): tarjetas en lugar de tabla */}
        <ul className="space-y-3 md:hidden" aria-label="Valoraciones">
          {visibles.map(({ v, etapa, falta, accion }) => (
            <li key={v.id} className="space-y-2 rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/valoraciones/${v.id}`} className="font-medium underline-offset-4 hover:underline">{v.nombre}</Link>
                <BadgeValoracion estado={estadoEfectivo({ estado: v.estado as EstadoVal, expiraEn: v.expiraEn }, ahora)} />
              </div>
              <p className="text-xs text-muted-foreground">{[v.ciudad, fechaCorta(v.creadoEn), v.doctor?.name].filter(Boolean).join(" · ")}</p>
              <dl className="grid grid-cols-[5rem_1fr] gap-x-2 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Etapa</dt><dd>{ETIQUETA_ETAPA[etapa]}</dd>
                <dt className="text-muted-foreground">Falta</dt><dd>{falta.length ? falta.join(" · ") : "—"}</dd>
                <dt className="text-muted-foreground">Acción</dt><dd className="font-medium">{accion.titulo}</dd>
              </dl>
            </li>
          ))}
        </ul>
        <Card className="hidden py-0 md:block">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Paciente</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Etapa</TableHead>
                  <TableHead>Falta</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Odontólogo</TableHead>
                  <TableHead className="pr-6">Creada</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map(({ v, etapa, falta, accion }) => (
                  <TableRow key={v.id}>
                    <TableCell className="pl-6 font-medium">
                      <Link href={`/valoraciones/${v.id}`} className="underline-offset-4 hover:underline">{v.nombre}</Link>
                      {v.ciudad && <span className="block text-xs font-normal text-muted-foreground">{v.ciudad}</span>}
                    </TableCell>
                    <TableCell><BadgeValoracion estado={estadoEfectivo({ estado: v.estado as EstadoVal, expiraEn: v.expiraEn }, ahora)} /></TableCell>
                    <TableCell>{ETIQUETA_ETAPA[etapa]}</TableCell>
                    <TableCell className="text-muted-foreground">{falta.length ? falta.join(" · ") : "—"}</TableCell>
                    <TableCell className="font-medium">{accion.titulo}</TableCell>
                    <TableCell>{v.doctor?.name ?? "Sin asignar"}</TableCell>
                    <TableCell className="pr-6">{fechaCorta(v.creadoEn)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </>)}
    </div>
  );
}
