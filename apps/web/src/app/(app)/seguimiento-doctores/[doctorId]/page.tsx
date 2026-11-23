import { prisma } from "@dent-view/db";
import { CalendarClock, DollarSign, Repeat, Send } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { EstadoVacio } from "@/components/comunes/estado-vacio";
import { Kpi } from "@/components/comunes/kpi";
import { CrearSeguimiento, EditarSeguimiento, RegistrarContacto } from "@/components/seguimiento-doctores/acciones";
import { Delta, TarjetaGrafica } from "@/components/comunes/tarjeta-grafica";
import { fraseVariacion } from "@/components/comunes/variacion";
import { GraficaRemisiones } from "@/components/seguimiento-doctores/sparkline";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fechaCorta, fechaHoraCompleta, fechaIso } from "@/lib/fechas";
import { cop } from "@/lib/formato";
import { numeroOrden } from "@/lib/ordenes";
import { GESTION } from "@/lib/roles";
import {
  ETIQUETA_CANAL_DOCTOR, ETIQUETA_ESTADO_SEG_DOCTOR, ETIQUETA_MOTIVO_SEG_DOCTOR, ETIQUETA_SEMAFORO, motivoParaSemaforo, requiereGestion, VARIANTE_SEMAFORO,
  type EstadoSegDoctor, type MotivoSegDoctor,
} from "@/lib/seguimiento-doctores";
import { cargarDoctores, sincronizarRecuperados } from "@/lib/seguimiento-doctores-datos";
import { exigirContexto } from "@/lib/sesion";
import { ETIQUETA_ESTADO_ORDEN, type EstadoOrden } from "@/lib/ordenes";

export const dynamic = "force-dynamic";

export default async function FichaDoctor({ params }: { params: Promise<{ doctorId: string }> }) {
  const ctx = await exigirContexto(GESTION);
  const { doctorId } = await params;
  const org = ctx.organizationId;
  await sincronizarRecuperados(org);
  const d = (await cargarDoctores(org)).find((x) => x.doctorId === doctorId);
  if (!d) notFound();

  // Solo cifras comerciales: número de orden, fecha, estado y total; nunca paciente ni datos clínicos.
  const [ordenes, contactos, historial, responsables] = await Promise.all([
    prisma.orden.findMany({ where: { organizationId: org, doctorRemitenteId: doctorId }, orderBy: { creadoEn: "desc" }, take: 10, select: { id: true, numero: true, creadoEn: true, estado: true, items: { select: { precio: true, descuento: true } } } }),
    prisma.contactoDoctor.findMany({ where: { organizationId: org, doctorId }, orderBy: { fecha: "desc" }, take: 30 }),
    prisma.seguimientoDoctor.findMany({ where: { organizationId: org, doctorId, estado: { in: ["RECUPERADO", "DESCARTADO"] } }, orderBy: { cerradoEn: "desc" }, take: 5 }),
    prisma.member.findMany({ where: { organizationId: org, role: { in: [...GESTION] } }, include: { user: { select: { name: true } } } }),
  ]);
  const listaResp = responsables.map((m) => ({ id: m.userId, nombre: m.user.name }));
  const nombreDe = new Map(listaResp.map((r) => [r.id, r.nombre]));
  const ab = d.abierto;
  const sumaMeses = (xs: { n: number }[]) => xs.reduce((t, x) => t + x.n, 0);
  const reciente = sumaMeses(d.porMes.slice(-3)), previo = sumaMeses(d.porMes.slice(-6, -3));

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo={d.nombre}
        descripcion={<>{d.especialidad ?? "Doctor remitente"} · {d.correo}{d.telefono ? ` · ${d.telefono}` : ""} · <Link className="underline-offset-4 hover:underline" href="/seguimiento-doctores">Volver a la lista</Link></>}
        insignia={<Badge variant={VARIANTE_SEMAFORO[d.semaforo]}>{ETIQUETA_SEMAFORO[d.semaforo]}</Badge>}
        acciones={<>
          <RegistrarContacto doctorId={doctorId} seguimientoId={ab?.id} />
          {!ab && <CrearSeguimiento doctorId={doctorId} nombre={d.nombre} motivo={requiereGestion(d.semaforo) ? motivoParaSemaforo(d.semaforo) : "OTRO"} responsables={listaResp} />}
        </>}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi titulo="Última remisión" valor={d.ultimaRemision ? fechaCorta(d.ultimaRemision) : "—"} nota={d.diasSinEnviar !== null ? `hace ${d.diasSinEnviar} días` : "Aún no remite"} icono={CalendarClock} tono="info" />
        <Kpi titulo="Remisiones 12 meses" valor={d.remisiones12m} nota={`${d.promedioMensual.toFixed(1)} por mes`} icono={Send} tono="primary" />
        <Kpi titulo="Intervalo habitual" valor={d.intervaloHabitual !== null ? `${Math.round(d.intervaloHabitual)} días` : "—"} nota="Mediana entre remisiones" icono={Repeat} tono="violet" />
        <Kpi titulo="Facturado 12 meses" valor={cop(d.ingresos12m)} icono={DollarSign} tono="success" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <TarjetaGrafica
          className="lg:col-span-2"
          titulo={reciente === 0 && previo === 0 ? "No ha remitido estudios en los últimos 6 meses" : `Remitió ${reciente} ${reciente === 1 ? "estudio" : "estudios"} en los últimos 3 meses: ${fraseVariacion(reciente, previo, "", "los 3 meses anteriores")}`}
          subtitulo="Remisiones por mes, últimos 12 meses"
          cifra={reciente}
          delta={<Delta actual={reciente} anterior={previo} etiqueta="vs. los 3 meses anteriores" />}
          comoSeCalcula="estudios remitidos por el doctor en cada mes. La comparación pone los últimos 3 meses junto a los 3 anteriores."
        >
          <GraficaRemisiones datos={d.porMes} />
        </TarjetaGrafica>
        <Card>
          <CardHeader><CardTitle>Convenio y descuentos</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {d.convenio
              ? <p><span className="font-medium">{d.convenio.nombre}</span>{d.convenio.descuento != null && ` · ${d.convenio.descuento}% de descuento general`}</p>
              : <p className="text-muted-foreground">Sin convenio vigente.</p>}
            <p className="text-muted-foreground">{d.tarifasEspeciales ? `${d.tarifasEspeciales} tarifa(s) especial(es) propias del doctor.` : "Sin tarifas especiales propias."}</p>
            <p><Link className="underline-offset-4 hover:underline" href="/convenios">Gestionar convenios</Link></p>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Seguimiento</h2>
        <Card><CardContent>
          {ab ? (
            <div className="flex flex-wrap items-start justify-between gap-4" data-testid="seguimiento-abierto">
              <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div><dt className="text-muted-foreground">Estado</dt><dd className="font-medium">{ETIQUETA_ESTADO_SEG_DOCTOR[ab.estado]}</dd></div>
                <div><dt className="text-muted-foreground">Motivo</dt><dd className="font-medium">{ETIQUETA_MOTIVO_SEG_DOCTOR[ab.motivo]}</dd></div>
                <div><dt className="text-muted-foreground">Responsable</dt><dd className="font-medium">{d.responsable ?? "Sin asignar"}</dd></div>
                <div><dt className="text-muted-foreground">Próximo contacto</dt><dd className="font-medium">{fechaCorta(ab.proximoContacto)}</dd></div>
                {ab.nota && <div className="sm:col-span-2 lg:col-span-4"><dt className="text-muted-foreground">Nota</dt><dd>{ab.nota}</dd></div>}
              </dl>
              <EditarSeguimiento id={ab.id} estado={ab.estado} responsableId={ab.responsableId} proximoContacto={ab.proximoContacto ? fechaIso(ab.proximoContacto) : ""} nota={ab.nota} responsables={listaResp} />
            </div>
          ) : <EstadoVacio titulo="Sin seguimiento abierto" descripcion="Crea una tarea para dar seguimiento a este doctor." />}
        </CardContent></Card>
        {historial.length > 0 && (
          <p className="text-sm text-muted-foreground">Cerrados: {historial.map((h) => `${ETIQUETA_ESTADO_SEG_DOCTOR[h.estado as EstadoSegDoctor]} (${ETIQUETA_MOTIVO_SEG_DOCTOR[h.motivo as MotivoSegDoctor]}, ${fechaCorta(h.cerradoEn)})`).join(" · ")}</p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Bitácora de contactos</h2>
        <Card className="py-0"><CardContent className="px-0">
          {contactos.length === 0 ? <EstadoVacio titulo="Aún no hay contactos registrados" /> : (
            <Table>
              <TableHeader><TableRow><TableHead className="pl-4 md:pl-6">Fecha</TableHead><TableHead>Canal</TableHead><TableHead>Resultado</TableHead><TableHead className="pr-4 md:pr-6">Nota</TableHead><TableHead className="hidden lg:table-cell">Registró</TableHead></TableRow></TableHeader>
              <TableBody>
                {contactos.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="pl-4 md:pl-6">{fechaHoraCompleta(c.fecha)}</TableCell>
                    <TableCell><Badge variant="outline">{ETIQUETA_CANAL_DOCTOR[c.canal as keyof typeof ETIQUETA_CANAL_DOCTOR]}</Badge></TableCell>
                    <TableCell className="whitespace-normal">{c.resultado ?? "—"}</TableCell>
                    <TableCell className="max-w-xs whitespace-normal pr-4 md:pr-6">{c.nota ?? "—"}</TableCell>
                    <TableCell className="hidden lg:table-cell">{(c.registradoPorId && nombreDe.get(c.registradoPorId)) || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent></Card>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Últimas órdenes</h2>
        <Card className="py-0"><CardContent className="px-0">
          {ordenes.length === 0 ? <EstadoVacio titulo="Sin órdenes en este centro" /> : (
            <Table>
              <TableHeader><TableRow><TableHead className="pl-4 md:pl-6">Orden</TableHead><TableHead>Fecha</TableHead><TableHead>Estado</TableHead><TableHead className="pr-4 md:pr-6 text-right">Total</TableHead></TableRow></TableHeader>
              <TableBody>
                {ordenes.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="pl-4 md:pl-6 font-medium">{numeroOrden(o.numero)}</TableCell>
                    <TableCell>{fechaCorta(o.creadoEn)}</TableCell>
                    <TableCell><Badge variant="secondary">{ETIQUETA_ESTADO_ORDEN[o.estado as EstadoOrden]}</Badge></TableCell>
                    <TableCell className="pr-4 md:pr-6 text-right tabular-nums">{cop(o.items.reduce((s, i) => s + i.precio - i.descuento, 0))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent></Card>
      </section>
    </div>
  );
}
