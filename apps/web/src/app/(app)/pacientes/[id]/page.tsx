import { ETIQUETA_ESTADO_ORDEN, numeroOrden, VARIANTE_ESTADO_ORDEN } from "@/lib/ordenes";
import { prisma } from "@dent-view/db";
import { Box, ClipboardList, ClipboardPlus, Eye, History, Mail, Phone, PhoneCall, ScanLine, ShieldCheck, TriangleAlert, Wallet } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { EstadoVacio } from "@/components/comunes/estado-vacio";
import { PanelEntrega } from "@/components/entrega/panel-entrega";
import { AlertasClinicas } from "@/components/pacientes/alertas-clinicas";
import { Consentimientos } from "@/components/pacientes/consentimientos";
import { Antecedentes, ContactoPersona } from "@/components/pacientes/historia-clinica";
import { EquipoTratante } from "@/components/pacientes/equipo-tratante";
import { GaleriaImagenes } from "@/components/estudios/galeria-imagenes";
import { FotoPaciente } from "@/components/pacientes/foto-paciente";
import { HojaDeVida } from "@/components/pacientes/hoja-de-vida";
import { CasoDialog } from "@/components/laboratorio/caso-dialog";
import { TablaCasos } from "@/components/laboratorio/tabla-casos";
import { NotasClinicas } from "@/components/pacientes/notas-clinicas";
import { PlanTratamiento } from "@/components/pacientes/plan-tratamiento";
import { Odontograma } from "@/components/pacientes/odontograma";
import { PacienteDialog } from "@/components/pacientes/paciente-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { registrarAcceso } from "@/lib/bitacora";
import { filtroImagenes } from "@/lib/imagenes";
import { estadoVigente } from "@/lib/consentimientos";
import { calcularAlertas, esMenor } from "@/lib/historia-clinica";
import { calcularEdad } from "@/lib/pacientes";
import { derivarEquipo } from "@/lib/pacientes-equipo";
import { filtroVisibles } from "@/lib/pacientes-filtro";
import { cargarHojaDeVida } from "@/lib/pacientes-hoja-datos";
import { ETIQUETA_ESTADO_FACTURA, numeroFactura, saldo, VARIANTE_ESTADO_FACTURA } from "@/lib/facturacion";
import { ETIQUETA_ESTADO_SEG, ETIQUETA_MOTIVO, type EstadoSeg, type Motivo } from "@/lib/seguimiento";
import { cop, precioFinal } from "@/lib/precios";
import { listarEnlaces } from "@/lib/resultados";
import { CLINICOS, GESTION, MEDICOS } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";
import { fechaCorta, fechaDeEstudio, fechaHoraCompleta } from "@/lib/fechas";

export const dynamic = "force-dynamic";

const ESTUDIO = { POR_ASIGNAR: "Por asignar", ASIGNADO: "Asignado", PUBLICADO: "Publicado" } as const;
const fecha = (d: Date | null) => fechaCorta(d);
const editar = (p: { id: string; nombre: string; fechaNacimiento: Date | null; celular: string | null; correo: string | null; direccion: string | null; alertas: string | null; notas: string | null; persona: { tipoDocumento: string; numeroDocumento: string } }) => ({
  id: p.id,
  tipoDocumento: p.persona.tipoDocumento,
  numeroDocumento: p.persona.numeroDocumento,
  nombre: p.nombre,
  fechaNacimiento: p.fechaNacimiento?.toISOString().slice(0, 10) ?? "",
  celular: p.celular ?? "",
  correo: p.correo ?? "",
  direccion: p.direccion ?? "",
  alertas: p.alertas ?? "",
  notas: p.notas ?? "",
});

type EstudioFila = { id: string; studyInstanceUid: string; modalidad: string | null; descripcion: string | null; fechaEstudio: Date | null; creadoEn: Date; estado: keyof typeof ESTUDIO; superficieKey: string | null };
function TablaEstudios({ estudios }: { estudios: EstudioFila[] }) {
  return (
    <Card className="py-0"><CardContent className="px-0">
      {estudios.length === 0 ? (
        <EstadoVacio icono={ScanLine} titulo="Sin estudios" descripcion="Cuando el equipo envíe un estudio de este paciente y se le asigne, aparecerá aquí." />
      ) : (
        <Table>
          <TableHeader><TableRow>
            <TableHead className="pl-6">Fecha</TableHead><TableHead>Modalidad</TableHead><TableHead className="hidden md:table-cell">Descripción</TableHead><TableHead>Estado</TableHead>
            <TableHead className="pr-6 text-right">Acciones</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {estudios.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="pl-6">{fechaDeEstudio(e)}</TableCell>
                <TableCell><Badge variant="outline">{e.modalidad ?? "—"}</Badge></TableCell>
                <TableCell className="hidden max-w-[16rem] truncate text-muted-foreground md:table-cell">{e.descripcion ?? "—"}</TableCell>
                <TableCell><Badge variant="secondary">{ESTUDIO[e.estado]}</Badge></TableCell>
                <TableCell className="pr-6">
                  <div className="flex flex-wrap justify-end gap-2">
                    {/* Enlace normal en pestaña nueva: /visor lo sirve Caddy, no Next */}
                    <Button asChild size="sm">
                      <a href={`/visor/viewer?StudyInstanceUIDs=${encodeURIComponent(e.studyInstanceUid)}`} target="_blank" rel="noopener noreferrer"><Eye /> Abrir visor<span className="sr-only"> (pestaña nueva)</span></a>
                    </Button>
                    {e.superficieKey && (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/estudios/${e.id}/superficie`}><Box /> Escaneo facial</Link>
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CardContent></Card>
  );
}

type OrdenFila = { id: string; numero: number; creadoEn: Date; estado: keyof typeof ETIQUETA_ESTADO_ORDEN; items: { precio: number; descuento: number }[] };
function TablaOrdenes({ ordenes, pacienteId, puedeGestionar }: { ordenes: OrdenFila[]; pacienteId: string; puedeGestionar: boolean }) {
  return (
    <Card className="py-0"><CardContent className="px-0">
      {ordenes.length === 0 ? (
        <EstadoVacio
          icono={ClipboardList}
          titulo="Sin órdenes"
          descripcion="Crea una orden para agendar y facturar sus estudios."
          accion={puedeGestionar && <Button asChild size="sm"><Link href={`/ordenes/nueva?paciente=${pacienteId}`}><ClipboardPlus /> Crear orden</Link></Button>}
        />
      ) : (
        <Table>
          <TableHeader><TableRow>
            <TableHead className="pl-6">Orden</TableHead><TableHead>Fecha</TableHead><TableHead>Estado</TableHead>
            <TableHead className="pr-6 text-right">Total</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {ordenes.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="pl-6 font-medium"><Link className="underline-offset-4 hover:underline" href={`/ordenes/${o.id}`}>{numeroOrden(o.numero)}</Link></TableCell>
                <TableCell>{fecha(o.creadoEn)}</TableCell>
                <TableCell><Badge variant={VARIANTE_ESTADO_ORDEN[o.estado]}>{ETIQUETA_ESTADO_ORDEN[o.estado]}</Badge></TableCell>
                <TableCell className="pr-6 text-right">{cop(o.items.reduce((s, i) => s + i.precio - i.descuento, 0))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CardContent></Card>
  );
}

export default async function FichaPaciente({ params }: { params: Promise<{ id: string }> }) {
  // El doctor remitente entra solo a sus pacientes y ve únicamente su participación (órdenes y estudios propios).
  const ctx = await exigirContexto([...CLINICOS, "doctor_remitente"]);
  const esDoctor = ctx.rol === "doctor_remitente";
  const { id } = await params;
  const propios = esDoctor ? { doctorRemitenteId: ctx.usuario.id } : {};
  const p = await prisma.pacienteTenant.findFirst({
    where: { id, ...filtroVisibles(ctx.organizationId, ctx.usuario.id, ctx.rol) },
    include: {
      persona: true,
      estudios: { where: propios, orderBy: [{ fechaEstudio: "desc" }, { creadoEn: "desc" }] },
      ordenes: { where: propios, orderBy: { numero: "desc" }, include: { items: true } },
      condiciones: true,
      planItems: { orderBy: [{ posicion: "asc" }, { creadoEn: "asc" }] },
      notasClinicas: { orderBy: { fecha: "desc" } },
      casosLab: { orderBy: { creadoEn: "desc" } },
    },
  });
  if (!p) notFound();
  const org = ctx.organizationId;
  const puedeGestionar = (GESTION as readonly string[]).includes(ctx.rol);
  await registrarAcceso(ctx, p.id, "ficha");
  // Imágenes no DICOM del paciente (el doctor remitente solo ve las de sus órdenes/estudios); suben las clínicas, no el doctor.
  const imagenes = await prisma.imagenEstudio.findMany({ where: { pacienteId: p.id, ...filtroImagenes(ctx.organizationId, ctx.usuario.id, ctx.rol) }, orderBy: { creadoEn: "desc" }, select: { id: true, titulo: true, nombreOriginal: true, mime: true, bytes: true } });
  const galeria = (
    <GaleriaImagenes pacienteId={p.id} imagenes={imagenes} puedeEditar={!esDoctor} ordenes={p.ordenes.map((o) => ({ id: o.id, etiqueta: numeroOrden(o.numero) }))} estudios={p.estudios.map((e) => ({ id: e.id, etiqueta: `${e.modalidad ?? "Estudio"} · ${fechaDeEstudio(e)}` }))} />
  );

  // Equipo tratante: derivado de órdenes y estudios (ya acotados al doctor si es doctor) + lo registrado a mano.
  const [relaciones, miembrosDoctor] = await Promise.all([
    prisma.doctorPaciente.findMany({ where: { pacienteId: p.id, organizationId: org, ...(esDoctor ? { doctorId: ctx.usuario.id } : {}) }, orderBy: { desde: "desc" } }),
    esDoctor ? [] : prisma.member.findMany({ where: { organizationId: org, role: "doctor_remitente" }, select: { user: { select: { id: true, name: true } } }, orderBy: { user: { name: "asc" } } }),
  ]);
  const participaciones = derivarEquipo(p.ordenes, p.estudios);
  const idsDoctores = [...new Set([...participaciones.map((d) => d.doctorId), ...relaciones.map((r) => r.doctorId)])];
  const usuariosDoctor = await prisma.user.findMany({ where: { id: { in: idsDoctores } }, select: { id: true, name: true, perfilDoctor: { select: { especialidad: true } } } });
  const infoDoctor = new Map(usuariosDoctor.map((u) => [u.id, u]));
  const nombreDoctor = (id: string) => infoDoctor.get(id)?.name ?? "Doctor";
  const derivados = participaciones.map((d) => ({
    doctorId: d.doctorId, nombre: nombreDoctor(d.doctorId), especialidad: infoDoctor.get(d.doctorId)?.perfilDoctor?.especialidad ?? null,
    ordenes: d.ordenes, estudios: d.estudios, primera: fecha(d.primera), ultima: fecha(d.ultima), servicios: d.servicios,
  }));
  const manuales = relaciones.map((r) => ({ id: r.id, nombre: nombreDoctor(r.doctorId), especialidad: r.especialidad, desde: fechaCorta(r.desde, true), nota: r.nota }));
  const equipo = (
    <EquipoTratante pacienteId={p.id} derivados={derivados} manuales={manuales} gestionar={puedeGestionar} doctores={miembrosDoctor.map((m) => ({ id: m.user.id, nombre: m.user.name }))} />
  );
  const { persona } = p;
  const edad = p.fechaNacimiento ? calcularEdad(p.fechaNacimiento) : null;
  const doctoresCabecera = [...new Set([...participaciones.map((d) => d.doctorId), ...relaciones.map((r) => r.doctorId)])];

  const cabecera = (
    <div className="flex items-start gap-4">
      <FotoPaciente pacienteId={p.id} nombre={p.nombre} tieneFoto={!!p.fotoKey} editable={puedeGestionar} />
      <div className="min-w-0 flex-1">
        <EncabezadoPagina
          titulo={p.nombre}
          acciones={puedeGestionar && <>
            <PacienteDialog paciente={editar(p)} />
            <Button asChild size="sm"><Link href={`/ordenes/nueva?paciente=${p.id}`}><ClipboardPlus /> Crear orden</Link></Button>
          </>}
        >
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="tabular-nums">{persona.tipoDocumento} {persona.numeroDocumento}</span>
            {edad !== null && <span>{edad} años</span>}
            {p.celular && <a href={`tel:${p.celular}`} className="inline-flex items-center gap-1 underline-offset-4 hover:text-foreground hover:underline"><Phone className="size-3.5" aria-hidden />{p.celular}</a>}
            {p.correo && <a href={`mailto:${p.correo}`} className="inline-flex min-w-0 items-center gap-1 underline-offset-4 hover:text-foreground hover:underline"><Mail className="size-3.5 shrink-0" aria-hidden /><span className="truncate">{p.correo}</span></a>}
          </p>
          {doctoresCabecera.length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              <span>{doctoresCabecera.length === 1 ? "Doctor remitente:" : "Doctores remitentes:"}</span>
              {doctoresCabecera.map((d) => <Badge key={d} variant="secondary">{nombreDoctor(d)}</Badge>)}
            </p>
          )}
        </EncabezadoPagina>
      </div>
    </div>
  );
  const alertaLibre = p.alertas && (
    <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <span><strong>Alertas:</strong> {p.alertas}</span>
    </div>
  );

  if (esDoctor) {
    // Vista acotada del doctor remitente: sus datos de contacto, su equipo y lo que él remitió. Sin historia clínica ni cartera.
    return (
      <div className="space-y-6">
        {cabecera}
        {alertaLibre}
        <Tabs defaultValue="resumen" className="gap-4">
          <TabsList variant="line" className="w-max justify-start">
            <TabsTrigger value="resumen">Resumen</TabsTrigger>
            <TabsTrigger value="estudios">Estudios ({p.estudios.length})</TabsTrigger>
            <TabsTrigger value="ordenes">Órdenes ({p.ordenes.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="resumen"><Card><CardHeader><CardTitle>Tu participación</CardTitle></CardHeader><CardContent>{equipo}</CardContent></Card></TabsContent>
          <TabsContent value="estudios" className="space-y-6"><TablaEstudios estudios={p.estudios} />{galeria}</TabsContent>
          <TabsContent value="ordenes"><TablaOrdenes ordenes={p.ordenes} pacienteId={p.id} puedeGestionar={false} /></TabsContent>
        </Tabs>
      </div>
    );
  }

  const enlacesEntrega = await listarEnlaces(ctx.organizationId, { pacienteId: p.id });
  const verClinica = (MEDICOS as readonly string[]).includes(ctx.rol);
  const [contexto, alergias, medicaciones, enfermedades, contacto, representante, autorizaciones, preferencia] = await Promise.all([
    verClinica ? prisma.contextoMedico.findUnique({ where: { pacienteId: p.id } }) : null,
    verClinica ? prisma.alergiaPaciente.findMany({ where: { pacienteId: p.id, organizationId: org, activo: true }, orderBy: { creadoEn: "asc" } }) : [],
    verClinica ? prisma.medicacionPaciente.findMany({ where: { pacienteId: p.id, organizationId: org, activo: true }, orderBy: { creadoEn: "asc" } }) : [],
    verClinica ? prisma.enfermedadPaciente.findMany({ where: { pacienteId: p.id, organizationId: org, activo: true }, orderBy: { creadoEn: "asc" } }) : [],
    prisma.contactoEmergencia.findFirst({ where: { pacienteId: p.id, organizationId: org, activo: true } }),
    prisma.representanteLegal.findFirst({ where: { pacienteId: p.id, organizationId: org, activo: true } }),
    prisma.autorizacion.findMany({ where: { pacienteId: p.id, organizationId: org }, orderBy: [{ creadoEn: "desc" }, { id: "desc" }] }),
    prisma.preferenciaContacto.findUnique({ where: { pacienteId: p.id } }),
  ]);
  const alertasClinicas = calcularAlertas(contexto, alergias, enfermedades);
  const vigentes = Object.fromEntries([...estadoVigente(autorizaciones).entries()].map(([f, r]) => [f, r.otorgada]));
  const servicios = await prisma.servicio.findMany({ where: { organizationId: ctx.organizationId, activo: true }, orderBy: { nombre: "asc" } });

  const idsActores = p.notasClinicas.flatMap((n) => (n.autorId ? [n.autorId] : []));
  const actores = await prisma.user.findMany({
    where: { id: { in: [...new Set(idsActores)] } },
    select: { id: true, name: true },
  });
  const nombreActor = new Map(actores.map((a) => [a.id, a.name]));
  const ordenesLab = p.ordenes.map((o) => ({ id: o.id, pacienteId: p.id, numero: o.numero }));
  const [facturas, seguimientos, hoja, solicitudesAbiertas] = await Promise.all([
    puedeGestionar ? prisma.factura.findMany({ where: { organizationId: org, pacienteId: p.id }, include: { pagos: { where: { anuladoEn: null } } }, orderBy: { fecha: "desc" }, take: 100 }) : [],
    prisma.seguimiento.findMany({ where: { organizationId: org, pacienteId: p.id }, orderBy: { creadoEn: "desc" }, take: 50 }),
    cargarHojaDeVida(org, p.id),
    puedeGestionar ? prisma.solicitudTitular.count({ where: { organizationId: org, pacienteId: p.id, estado: { in: ["RECIBIDA", "EN_TRAMITE"] } } }) : 0,
  ]);
  const abiertas = facturas.filter((f) => f.estado === "ABIERTA");
  const deuda = abiertas.reduce((t, f) => t + saldo(f.total, f.pagos), 0);
  const nOtorgadas = Object.values(vigentes).filter(Boolean).length;

  return (
    <div className="space-y-6">
      {cabecera}
      <AlertasClinicas alertas={alertasClinicas} />
      {preferencia?.noContactar && <p className="text-sm font-medium text-destructive">Marcado como «no contactar»: no se le envían mensajes.</p>}
      {alertaLibre}

      <Tabs defaultValue="resumen" className="gap-4">
        {/* Una sola fila desplazable: en móvil no se apilan las pestañas. */}
        <div className="-mx-4 overflow-x-auto border-b px-4 md:-mx-8 md:px-8 [scrollbar-width:none]">
        <TabsList variant="line" className="w-max justify-start">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="estudios">Estudios ({p.estudios.length})</TabsTrigger>
          <TabsTrigger value="ordenes">Órdenes ({p.ordenes.length})</TabsTrigger>
          {puedeGestionar && <TabsTrigger value="cartera">Cartera{deuda > 0 ? ` (${cop(deuda)})` : ""}</TabsTrigger>}
          <TabsTrigger value="consentimientos">Consentimientos</TabsTrigger>
          <TabsTrigger value="seguimiento">Seguimiento ({seguimientos.length})</TabsTrigger>
          <TabsTrigger value="hoja">Hoja de vida</TabsTrigger>
          <TabsTrigger value="entrega">Entrega de resultados ({enlacesEntrega.length})</TabsTrigger>
          <TabsTrigger value="historia">Historia clínica</TabsTrigger>
          <TabsTrigger value="laboratorio">Laboratorio ({p.casosLab.length})</TabsTrigger>
          <TabsTrigger value="clinico">Módulo clínico (opcional)</TabsTrigger>
        </TabsList>
        </div>

        <TabsContent value="resumen" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Datos del paciente</CardTitle></CardHeader>
            <CardContent>
            <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["Documento", `${persona.tipoDocumento} ${persona.numeroDocumento}`],
                ["Fecha de nacimiento", p.fechaNacimiento && fechaCorta(p.fechaNacimiento, true)],
                ["Celular", p.celular],
                ["Correo", p.correo],
                ["Dirección", p.direccion],
                ["Registrado en el centro", fecha(p.creadoEn)],
                ["Notas", p.notas],
              ].map(([k, v]) => (
                <div key={k} className="min-w-0 space-y-0.5"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium break-words">{v || "—"}</dd></div>
              ))}
            </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Equipo tratante / Doctores</CardTitle></CardHeader>
            <CardContent>{equipo}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4" aria-hidden /> Consentimientos y protección de datos</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                {autorizaciones.length === 0 ? "Sin autorizaciones registradas." : `${nOtorgadas} ${nOtorgadas === 1 ? "autorización vigente" : "autorizaciones vigentes"} de ${Object.keys(vigentes).length} finalidades registradas.`}
                {solicitudesAbiertas > 0 && ` ${solicitudesAbiertas} solicitud(es) del titular en trámite.`}
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {Object.entries(vigentes).map(([finalidad, otorgada]) => <li key={finalidad}><Badge variant={otorgada ? "secondary" : "outline"}>{otorgada ? "Vigente" : "Revocada"}: {finalidad}</Badge></li>)}
              </ul>
              <p className="flex flex-wrap gap-x-4">
                <span className="text-muted-foreground">Registro y revocación en la pestaña «Consentimientos».</span>
                {puedeGestionar && <Link href="/proteccion-datos" className="underline underline-offset-4">Ir a protección de datos</Link>}
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="estudios" className="space-y-6"><TablaEstudios estudios={p.estudios} />{galeria}</TabsContent>

        <TabsContent value="ordenes"><TablaOrdenes ordenes={p.ordenes} pacienteId={p.id} puedeGestionar={puedeGestionar} /></TabsContent>

        {puedeGestionar && (
          <TabsContent value="cartera">
            <Card className="py-0"><CardContent className="px-0">
              {facturas.length === 0 ? (
                <EstadoVacio icono={Wallet} titulo="Sin cuentas de cobro" descripcion="Las cuentas de cobro de este paciente aparecerán aquí." />
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="pl-6">Cuenta</TableHead><TableHead>Fecha</TableHead><TableHead>Estado</TableHead>
                    <TableHead className="text-right">Total</TableHead><TableHead className="text-right">Pagado</TableHead><TableHead className="pr-6 text-right">Saldo</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {facturas.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="pl-6 font-medium"><Link className="underline-offset-4 hover:underline" href={`/facturacion/${f.id}`}>{numeroFactura(f.numero)}</Link></TableCell>
                        <TableCell>{fecha(f.fecha)}</TableCell>
                        <TableCell><Badge variant={VARIANTE_ESTADO_FACTURA[f.estado]}>{ETIQUETA_ESTADO_FACTURA[f.estado]}</Badge></TableCell>
                        <TableCell className="text-right">{cop(f.total)}</TableCell>
                        <TableCell className="text-right">{cop(f.pagos.reduce((t, x) => t + x.valor, 0))}</TableCell>
                        <TableCell className="pr-6 text-right font-medium">{f.estado === "ANULADA" ? "—" : cop(saldo(f.total, f.pagos))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent></Card>
          </TabsContent>
        )}

        <TabsContent value="consentimientos">
          <Consentimientos
            pacienteId={p.id} vigentes={vigentes} ordenes={p.ordenes.map((o) => ({ id: o.id, numero: o.numero }))}
            registros={autorizaciones.map((a) => ({ id: a.id, tipo: a.tipo, finalidad: a.finalidad, otorgada: a.otorgada, fecha: fechaHoraCompleta(a.creadoEn), texto: a.textoMostrado, version: a.version }))}
          />
        </TabsContent>


        <TabsContent value="seguimiento">
          <Card className="py-0"><CardContent className="px-0">
            {seguimientos.length === 0 ? (
              <EstadoVacio icono={PhoneCall} titulo="Sin seguimientos" descripcion="Los controles, entregas pendientes y repeticiones de este paciente se gestionan en el módulo de seguimiento." accion={<Button asChild size="sm" variant="outline"><Link href="/seguimiento">Ir a seguimiento</Link></Button>} />
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="pl-6">Motivo</TableHead><TableHead>Estado</TableHead><TableHead>Mes objetivo</TableHead><TableHead className="pr-6">Nota</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {seguimientos.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="pl-6 font-medium">{ETIQUETA_MOTIVO[s.motivo as Motivo] ?? s.motivo}</TableCell>
                      <TableCell><Badge variant="secondary">{ETIQUETA_ESTADO_SEG[s.estado as EstadoSeg] ?? s.estado}</Badge></TableCell>
                      <TableCell>{fechaCorta(s.mesObjetivo, true)}</TableCell>
                      <TableCell className="max-w-[22rem] whitespace-normal pr-6 text-muted-foreground">{s.nota ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="hoja">
          <Card><CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">Últimos movimientos. La hoja completa se puede filtrar por tipo, imprimir o guardar como PDF.</p>
              <Button asChild size="sm" variant="outline"><Link href={`/pacientes/${p.id}/hoja-de-vida`}><History /> Ver hoja de vida completa</Link></Button>
            </div>
            <HojaDeVida entradas={hoja.slice(0, 10)} />
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="entrega">
          <Card><CardContent><PanelEntrega enlaces={enlacesEntrega} /></CardContent></Card>
        </TabsContent>

        <TabsContent value="historia" className="space-y-4">
          {verClinica && (
            <Antecedentes
              pacienteId={p.id}
              inicial={{
                contexto: {
                  embarazo: contexto?.embarazo ?? false, semanasEmbarazo: contexto?.semanasEmbarazo?.toString() ?? "", lactancia: contexto?.lactancia ?? false,
                  anticoagulantes: contexto?.anticoagulantes ?? false, anticoagulanteNombre: contexto?.anticoagulanteNombre ?? "", inr: contexto?.inr?.toString() ?? "",
                  inrFecha: contexto?.inrFecha?.toISOString().slice(0, 10) ?? "", reaccionAnestesia: contexto?.reaccionAnestesia ?? false, detalleAnestesia: contexto?.detalleAnestesia ?? "",
                  implantesMetalicos: contexto?.implantesMetalicos ?? false, marcapasos: contexto?.marcapasos ?? false, claustrofobia: contexto?.claustrofobia ?? false,
                  estudiosRecientes: contexto?.estudiosRecientes ?? "",
                },
                alergias: alergias.map((a) => ({ nombre: a.nombre, gravedad: a.gravedad, reaccion: a.reaccion ?? "" })),
                medicaciones: medicaciones.map((m) => ({ nombre: m.nombre, notas: m.notas ?? "" })),
                enfermedades: enfermedades.map((e) => ({ nombre: e.nombre, critica: e.critica, notas: e.notas ?? "" })),
              }}
            />
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <ContactoPersona
              pacienteId={p.id} tipo="contacto"
              inicial={contacto && { nombre: contacto.nombre, parentesco: contacto.parentesco ?? "", telefono: contacto.telefono, correo: contacto.correo ?? "", tipoDocumento: "CC", numeroDocumento: "", direccion: "" }}
            />
            <ContactoPersona
              pacienteId={p.id} tipo="representante" avisoMenor={esMenor(p.fechaNacimiento)}
              inicial={representante && { nombre: representante.nombre, parentesco: representante.parentesco, telefono: representante.telefono, correo: representante.correo ?? "", tipoDocumento: representante.tipoDocumento, numeroDocumento: representante.numeroDocumento ?? "", direccion: representante.direccion ?? "" }}
            />
          </div>
        </TabsContent>

        <TabsContent value="laboratorio" className="space-y-4">
          {puedeGestionar && (
            <div className="flex justify-end"><CasoDialog pacientes={[]} ordenes={ordenesLab} pacienteFijo={p.id} /></div>
          )}
          <TablaCasos
            mostrarPaciente={false} gestionar={puedeGestionar} pacientes={[]} ordenes={ordenesLab}
            casos={p.casosLab.map((c) => ({ ...c, paciente: p.nombre }))}
          />
        </TabsContent>

        <TabsContent value="clinico">
          <Card><CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Módulo secundario y opcional. Este centro toma estudios de imagen por orden de los doctores remitentes: el odontograma,
              el plan de tratamiento y las notas clínicas son apoyo interno y no reemplazan la historia clínica del doctor tratante.
            </p>
            <Tabs defaultValue="odontograma" className="gap-4">
              <TabsList variant="line" className="w-max justify-start">
                <TabsTrigger value="odontograma">Odontograma</TabsTrigger>
                <TabsTrigger value="plan">Plan de tratamiento ({p.planItems.length})</TabsTrigger>
                <TabsTrigger value="notas">Notas clínicas ({p.notasClinicas.length})</TabsTrigger>
              </TabsList>
        <TabsContent value="odontograma">
          <Card><CardContent>
            <Odontograma pacienteId={p.id} condiciones={p.condiciones.map((c) => ({ diente: c.diente, condicion: c.condicion }))} editable={verClinica} />
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="plan">
          <PlanTratamiento
            pacienteId={p.id}
            items={p.planItems}
            servicios={servicios.map((s) => ({ id: s.id, nombre: s.nombre, valor: precioFinal(s, "DIGITAL") ?? 0 }))}
            soloLectura={!verClinica}
          />
        </TabsContent>

        <TabsContent value="notas">
          <NotasClinicas
            pacienteId={p.id}
            soloLectura={!verClinica}
            notas={p.notasClinicas.map((n) => ({
              id: n.id, texto: n.texto, autor: (n.autorId && nombreActor.get(n.autorId)) || "Sin autor",
              fecha: fechaHoraCompleta(n.fecha),
            }))}
          />
        </TabsContent>

            </Tabs>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
