import { prisma } from "@dent-view/db";
import { CalendarDays, CalendarPlus, Eye, Receipt, TriangleAlert, Upload } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCita, BadgeOrden } from "@/components/comunes/estado-badge";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { EstadoVacio } from "@/components/comunes/estado-vacio";
import { AlertasClinicas } from "@/components/pacientes/alertas-clinicas";
import { CrearInformeBoton } from "@/components/informes/crear-informe-boton";
import { AdjuntarOrden } from "@/components/estudios/adjuntar-orden";
import { ListaDocumentos } from "@/components/estudios/lista-documentos";
import { cargarArchivos } from "@/lib/imagenes-datos";
import { EstudiosOrden } from "@/components/estudios/estudios-orden";
import { EvolucionOrden } from "@/components/evolucion/evolucion-orden";
import { AccionesOrden } from "@/components/ordenes/acciones-orden";
import { BloqueFactura } from "@/components/ordenes/bloque-factura";
import { BloqueFev } from "@/components/facturacion/bloque-fev";
import { tipoDeCentro } from "@/lib/tipo-centro-servidor";
import { PanelPrecio } from "@/components/ordenes/panel-precio";
import { PanelRips } from "@/components/ordenes/panel-rips";
import { PestanasOrden, type PestanaOrden } from "@/components/ordenes/pestanas-orden";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { utcABogota } from "@/lib/agenda";
import { fechaCorta, fechaHora } from "@/lib/fechas";
import { numeroOrden } from "@/lib/ordenes";
import { cop, hoyBogota, totalOrden } from "@/lib/precios";
import { cargarConvenios, cargarTarifasDoctor } from "@/lib/precios-datos";
import { cargarEntradaRips } from "@/lib/rips/datos";
import { calcularAlertas } from "@/lib/historia-clinica";
import { CLINICOS, GESTION, MEDICOS } from "@/lib/roles";
import { exigirContexto, modulosHabilitadoEnCentro } from "@/lib/sesion";

export const dynamic = "force-dynamic";

export default async function DetalleOrden({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const ctx = await exigirContexto();
  const { id } = await params;
  const { tab } = await searchParams;
  const orden = await prisma.orden.findFirst({
    where: { id, organizationId: ctx.organizationId, ...(ctx.rol === "doctor_remitente" ? { doctorRemitenteId: ctx.usuario.id } : {}) },
    include: {
      paciente: { include: { persona: true } },
      doctorRemitente: true,
      convenio: { select: { nombre: true } },
      items: { orderBy: { nombre: "asc" } },
      estudios: true,
      citas: { include: { sala: true }, orderBy: { inicio: "asc" } },
      facturas: { select: { id: true, numero: true, estado: true, total: true, fecha: true }, orderBy: { numero: "desc" } },
    },
  });
  if (!orden) notFound();
  // Orden creada para una remisión de otro centro (la remisión se busca siempre como destino).
  const remision = ctx.rol === "doctor_remitente" ? null : await prisma.remision.findFirst({ where: { ordenDestinoId: orden.id, destinoId: ctx.organizationId }, select: { id: true, origen: { select: { name: true } } } });
  const puedeGestionar = (CLINICOS as readonly string[]).includes(ctx.rol);
  const { persona } = orden.paciente;
  const verClinica = (MEDICOS as readonly string[]).includes(ctx.rol);
  const esDoctor = ctx.rol === "doctor_remitente";
  const [contexto, alergias, enfermedades] = verClinica
    ? await Promise.all([
        prisma.contextoMedico.findUnique({ where: { pacienteId: orden.pacienteId } }),
        prisma.alergiaPaciente.findMany({ where: { pacienteId: orden.pacienteId, organizationId: ctx.organizationId, activo: true } }),
        prisma.enfermedadPaciente.findMany({ where: { pacienteId: orden.pacienteId, organizationId: ctx.organizationId, activo: true } }),
      ])
    : [null, [], []];
  // El doctor remitente solo ve el informe ya emitido.
  const informe = verClinica || esDoctor
    ? await prisma.informe.findFirst({ where: { organizationId: ctx.organizationId, ordenId: orden.id, vigente: true, estado: esDoctor ? "EMITIDO" : { not: "ARCHIVADO" } }, orderBy: { version: "desc" } })
    : null;
  const gestion = (GESTION as readonly string[]).includes(ctx.rol);
  const disponibles = puedeGestionar && orden.estado !== "CANCELADA"
    ? await prisma.estudio.findMany({ where: { organizationId: ctx.organizationId, pacienteId: orden.pacienteId, ordenId: null }, orderBy: { creadoEn: "desc" } })
    : [];
  const archivos = await cargarArchivos(ctx, { ordenId: orden.id });
  const nombreEstudio = (e: { descripcion: string | null; modalidad: string | null }) => e.descripcion ?? e.modalidad ?? "Estudio";
  const alertas = verClinica
    ? calcularAlertas(contexto, alergias, enfermedades)
    : puedeGestionar && orden.paciente.alertas ? [{ gravedad: "MEDIA" as const, texto: orden.paciente.alertas }] : []; // recepción: nota libre de la ficha

  const facturada = orden.facturas.some((f) => f.estado !== "ANULADA");
  const fecha = hoyBogota(orden.creadoEn);
  const [servicios, convenios, tarifasDoctor, config, conEvolucion] = puedeGestionar
    ? await Promise.all([
        prisma.servicio.findMany({ where: { organizationId: ctx.organizationId, id: { in: orden.items.flatMap((i) => (i.servicioId ? [i.servicioId] : [])) } }, select: { id: true, precioImpreso: true, precioDigital: true, descuento: true } }),
        orden.convenioId ? cargarConvenios(ctx.organizationId, orden.convenioId) : [],
        orden.doctorRemitenteId ? cargarTarifasDoctor(ctx.organizationId, [orden.doctorRemitenteId]) : {},
        prisma.configFacturacion.findUnique({ where: { organizationId: ctx.organizationId }, select: { generaRips: true } }),
        modulosHabilitadoEnCentro(ctx.organizationId, "evolucion"),
      ])
    : [[], [], {}, null, false];
  const conRips = puedeGestionar && !!config?.generaRips;
  const rips = conRips ? await cargarEntradaRips(ctx.organizationId, orden.id) : null;
  const [profesionales, envios] = rips
    ? await Promise.all([
        prisma.member.findMany({ where: { organizationId: ctx.organizationId, role: { in: [...MEDICOS] } }, select: { userId: true, user: { select: { name: true } } }, orderBy: { user: { name: "asc" } } }),
        prisma.envioRips.findMany({ where: { organizationId: ctx.organizationId, ordenId: orden.id }, orderBy: { creadoEn: "desc" }, take: 10, select: { id: true, creadoEn: true, estado: true, hashJson: true } }),
      ])
    : [[], []];

  const resumen = (
    <>
      <Card className="py-0">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Servicio</TableHead>
                <TableHead>Opciones</TableHead>
                <TableHead className="pr-6 text-right">Precio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orden.items.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="pl-6 font-medium">{i.nombre}</TableCell>
                  <TableCell className="text-muted-foreground">{i.opciones ?? "—"}</TableCell>
                  <TableCell className="pr-6 text-right">{cop(i.precio)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2} className="pl-6 font-semibold">Total</TableCell>
                <TableCell className="pr-6 text-right font-semibold">{cop(totalOrden(orden.items))}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      {orden.observaciones && (
        <Card>
          <CardHeader><CardTitle>Observaciones clínicas</CardTitle></CardHeader>
          <CardContent className="whitespace-pre-wrap text-sm">{orden.observaciones}</CardContent>
        </Card>
      )}

        <Card>
          <CardHeader><CardTitle>Citas</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {orden.citas.length === 0 ? (
              <EstadoVacio
                icono={CalendarDays}
                titulo="Sin citas agendadas"
                className="py-4"
                accion={gestion && orden.estado !== "CANCELADA" && <Button asChild size="sm" variant="outline"><Link href={`/agenda?orden=${orden.id}`}><CalendarPlus /> Agendar</Link></Button>}
              />
            ) : (
              <ul className="divide-y">
                {orden.citas.map((c) => {
                  const { fecha } = utcABogota(c.inicio);
                  return (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <Link href={`/agenda?fecha=${fecha}`} className="underline-offset-4 hover:underline">
                        {fechaHora(c.inicio)} · {c.sala.nombre}
                      </Link>
                      <BadgeCita estado={c.estado} />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
    </>
  );
  const estudiosYDocumentos = (
    <>
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Documentos adjuntos ({archivos.todas.length})</CardTitle>
          <div className="flex gap-2">
            {puedeGestionar && orden.estado !== "CANCELADA" && <Button asChild size="sm" variant="outline"><Link href={`/cargar?pacienteId=${orden.pacienteId}&ordenId=${orden.id}`}><Upload /> Cargar archivos</Link></Button>}
            {esDoctor && orden.estado !== "CANCELADA" && <AdjuntarOrden pacienteId={orden.pacienteId} ordenId={orden.id} />}
          </div>
        </CardHeader>
        <CardContent><ListaDocumentos documentos={archivos.todas} puedeEliminar={ctx.rol === "admin_tenant"} vacio="Aún no hay orden médica ni archivos adjuntos a esta orden." /></CardContent>
      </Card>

        <Card>
          <CardHeader><CardTitle>Estudios vinculados</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <EstudiosOrden
              ordenId={orden.id}
              puedeEditar={puedeGestionar && orden.estado !== "CANCELADA"}
              vinculados={orden.estudios.map((e) => ({ id: e.id, nombre: nombreEstudio(e) }))}
              disponibles={disponibles.map((e) => ({ id: e.id, nombre: nombreEstudio(e) }))}
            />
          </CardContent>
        </Card>
    </>
  );
  const pestanas: PestanaOrden[] = [{ valor: "resumen", etiqueta: "Resumen", contenido: resumen }];
  if (puedeGestionar) {
    pestanas.push({
      valor: "precio", etiqueta: "Servicios y precio",
      contenido: <PanelPrecio items={orden.items} servicios={servicios} entrega={orden.entrega} convenio={convenios[0] ?? null} tarifasDoctor={tarifasDoctor} doctorId={orden.doctorRemitenteId} fecha={fecha} ordenId={orden.id} facturada={facturada} puedeFacturar={gestion && orden.estado !== "CANCELADA"} />,
    });
  }
  if (rips) {
    const { entrada } = rips;
    pestanas.push({
      valor: "rips", etiqueta: "RIPS",
      contenido: (
        <PanelRips
          ordenId={orden.id} pacienteId={orden.pacienteId} base={entrada} profesionalInicial={orden.profesionalAtiendeId}
          items={rips.orden.items.map((i, n) => ({ id: i.id, nombre: i.nombre, codigoCups: entrada.items[n]!.codigoCups, tipoRips: entrada.items[n]!.tipoRips }))}
          profesionales={profesionales.map((m) => ({ id: m.userId, nombre: m.user.name }))}
          envios={envios.map((e) => ({ id: e.id, creadoEn: fechaHora(e.creadoEn), estado: e.estado, hash: e.hashJson }))}
          puedeClinico={verClinica} soloLectura={orden.estado === "CANCELADA"}
        />
      ),
    });
  }
  pestanas.push({ valor: "estudios", etiqueta: "Estudios y documentos", contenido: estudiosYDocumentos });
  if (gestion) pestanas.push({ valor: "factura", etiqueta: "Factura", contenido: (
      <BloqueFactura ordenId={orden.id} facturas={orden.facturas} puedeFacturar={orden.estado !== "CANCELADA"}>
        {orden.facturas.filter((f) => f.estado !== "ANULADA").slice(0, 1).map((f) => <BloqueFev key={f.id} facturaId={f.id} />)}
      </BloqueFactura>
    ) });
  // Centro radiológico: no hay evolución odontológica; el mismo componente muestra el registro de toma (RegistroToma).
  const radiologico = puedeGestionar && (await tipoDeCentro(ctx.organizationId)) === "CENTRO_RADIOLOGICO";
  if (puedeGestionar && (conEvolucion || radiologico)) pestanas.push({ valor: "evolucion", etiqueta: radiologico ? "Registro de toma" : "Evolución", contenido: <EvolucionOrden ordenId={orden.id} pacienteId={orden.pacienteId} puedeEscribir={verClinica || radiologico} /> });

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo={`Orden ${numeroOrden(orden.numero)}`}
        insignia={<>
          <BadgeOrden estado={orden.estado} />
          {remision && <Link href={`/remisiones/${remision.id}`}><Badge variant="info">Remisión de {remision.origen.name}</Badge></Link>}
        </>}
        acciones={<>
          {informe && <Button asChild variant="outline"><Link href={`/informes/${informe.id}`}><Eye /> Ver informe (v{informe.version})</Link></Button>}
          {verClinica && !informe && ["TOMADA", "INFORMADA", "ENTREGADA"].includes(orden.estado) && <CrearInformeBoton ordenId={orden.id} />}
          {gestion && orden.estado !== "CANCELADA" && !orden.citas.some((c) => c.estado !== "CANCELADA" && c.estado !== "NO_ASISTIO") && <Button asChild variant="outline"><Link href={`/agenda?orden=${orden.id}`}><CalendarPlus /> Agendar</Link></Button>}
          {gestion && orden.estado !== "CANCELADA" && <Button asChild variant="outline"><Link href={`/facturacion/nueva?orden=${orden.id}`}><Receipt /> Facturar</Link></Button>}
          {puedeGestionar && <AccionesOrden id={orden.id} estado={orden.estado} />}
        </>}
      >
        <p className="text-sm text-muted-foreground">
          {puedeGestionar ? (
            <Link href={`/pacientes/${orden.pacienteId}`} className="font-medium capitalize text-foreground underline-offset-4 hover:underline">
              {orden.paciente.nombre.toLowerCase()}
            </Link>
          ) : (
            <span className="font-medium capitalize text-foreground">{orden.paciente.nombre.toLowerCase()}</span>
          )}
          <span className="ml-2 tabular-nums">{persona.tipoDocumento} {persona.numeroDocumento}</span>
        </p>
      </EncabezadoPagina>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border p-4 text-sm sm:grid-cols-4">
        {[
          ["Doctor remitente", orden.doctorRemitente?.name ?? "—"],
          ["Convenio", orden.convenio?.nombre ?? "Sin convenio"],
          ["Entrega", orden.entrega === "IMPRESA" ? "Impresa" : "Digital"],
          ["Creada", fechaCorta(orden.creadoEn)],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0 space-y-0.5"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="truncate font-medium">{v}</dd></div>
        ))}
      </dl>

      <AlertasClinicas alertas={alertas} />

      {orden.embarazo && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-amber-500 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
          <TriangleAlert className="size-4" /> Paciente embarazada o con posible embarazo: confirmar antes de tomar el estudio.
        </div>
      )}

      {esDoctor ? (
        // El doctor remitente solo tiene dos secciones: se muestran juntas para que adjuntar la orden médica siga a la vista.
        <>{resumen}{estudiosYDocumentos}</>
      ) : (
        <PestanasOrden inicial={tab ?? "resumen"} pestanas={pestanas} />
      )}
    </div>
  );
}
