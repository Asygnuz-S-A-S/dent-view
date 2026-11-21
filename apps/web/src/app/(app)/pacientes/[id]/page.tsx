import { numeroOrden } from "@/lib/ordenes";
import { prisma } from "@dent-view/db";
import { Box, ClipboardList, ClipboardPlus, Eye, Mail, Phone, ScanLine, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { EstadoVacio } from "@/components/comunes/estado-vacio";
import { PanelEntrega } from "@/components/entrega/panel-entrega";
import { AlertasClinicas } from "@/components/pacientes/alertas-clinicas";
import { Consentimientos } from "@/components/pacientes/consentimientos";
import { Antecedentes, ContactoPersona } from "@/components/pacientes/historia-clinica";
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
import { estadoVigente } from "@/lib/consentimientos";
import { calcularAlertas, esMenor } from "@/lib/historia-clinica";
import { calcularEdad } from "@/lib/pacientes";
import { puedeEditarNota } from "@/lib/plan";
import { precioFinal } from "@/lib/precios";
import { listarEnlaces } from "@/lib/resultados";
import { CLINICOS, GESTION, MEDICOS } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";
import { fechaCorta, fechaHoraCompleta } from "@/lib/fechas";

export const dynamic = "force-dynamic";

const ESTUDIO = { POR_ASIGNAR: "Por asignar", ASIGNADO: "Asignado", PUBLICADO: "Publicado" } as const;
const ORDEN = { SOLICITADA: "Solicitada", AGENDADA: "Agendada", TOMADA: "Tomada", INFORMADA: "Informada", ENTREGADA: "Entregada", CANCELADA: "Cancelada" } as const;
const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const fecha = (d: Date | null) => fechaCorta(d);

export default async function FichaPaciente({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirContexto(CLINICOS);
  const { id } = await params;
  const p = await prisma.pacienteTenant.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: {
      persona: true,
      estudios: { orderBy: [{ fechaEstudio: "desc" }, { creadoEn: "desc" }] },
      ordenes: { orderBy: { numero: "desc" }, include: { items: true } },
      condiciones: true,
      eventos: { where: { NOT: { tipo: { startsWith: "acceso." } } }, orderBy: { creadoEn: "desc" } },
      planItems: { orderBy: [{ posicion: "asc" }, { creadoEn: "asc" }] },
      notasClinicas: { orderBy: { fecha: "desc" } },
      casosLab: { orderBy: { creadoEn: "desc" } },
    },
  });
  if (!p) notFound();
  const enlacesEntrega = await listarEnlaces(ctx.organizationId, { pacienteId: p.id });
  const verClinica = (MEDICOS as readonly string[]).includes(ctx.rol);
  const org = ctx.organizationId;
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
  await registrarAcceso(ctx, p.id, "ficha");
  const alertasClinicas = calcularAlertas(contexto, alergias, enfermedades);
  const vigentes = Object.fromEntries([...estadoVigente(autorizaciones).entries()].map(([f, r]) => [f, r.otorgada]));
  const servicios = await prisma.servicio.findMany({ where: { organizationId: ctx.organizationId, activo: true }, orderBy: { nombre: "asc" } });

  const idsActores = [...p.eventos.flatMap((e) => (e.actorId ? [e.actorId] : [])), ...p.notasClinicas.flatMap((n) => (n.autorId ? [n.autorId] : []))];
  const actores = await prisma.user.findMany({
    where: { id: { in: [...new Set(idsActores)] } },
    select: { id: true, name: true },
  });
  const nombreActor = new Map(actores.map((a) => [a.id, a.name]));
  const { persona } = p;
  const edad = p.fechaNacimiento ? calcularEdad(p.fechaNacimiento) : null;
  const editar = {
    id: p.id,
    tipoDocumento: persona.tipoDocumento,
    numeroDocumento: persona.numeroDocumento,
    nombre: p.nombre,
    fechaNacimiento: p.fechaNacimiento?.toISOString().slice(0, 10) ?? "",
    celular: p.celular ?? "",
    correo: p.correo ?? "",
    direccion: p.direccion ?? "",
    alertas: p.alertas ?? "",
    notas: p.notas ?? "",
  };
  const puedeGestionar = (GESTION as readonly string[]).includes(ctx.rol);
  const ordenesLab = p.ordenes.map((o) => ({ id: o.id, pacienteId: p.id, numero: o.numero }));

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div aria-hidden className="hidden size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary sm:flex">
          {p.nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join("")}
        </div>
        <div className="min-w-0 flex-1">
          <EncabezadoPagina
            titulo={p.nombre}
            acciones={puedeGestionar && <>
              <PacienteDialog paciente={editar} />
              <Button asChild size="sm"><Link href={`/ordenes/nueva?paciente=${p.id}`}><ClipboardPlus /> Crear orden</Link></Button>
            </>}
          >
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="tabular-nums">{persona.tipoDocumento} {persona.numeroDocumento}</span>
              {edad !== null && <span>{edad} años</span>}
              {p.celular && <a href={`tel:${p.celular}`} className="inline-flex items-center gap-1 underline-offset-4 hover:text-foreground hover:underline"><Phone className="size-3.5" aria-hidden />{p.celular}</a>}
              {p.correo && <a href={`mailto:${p.correo}`} className="inline-flex min-w-0 items-center gap-1 underline-offset-4 hover:text-foreground hover:underline"><Mail className="size-3.5 shrink-0" aria-hidden /><span className="truncate">{p.correo}</span></a>}
            </p>
          </EncabezadoPagina>
        </div>
      </div>

      <AlertasClinicas alertas={alertasClinicas} />
      {preferencia?.noContactar && <p className="text-sm font-medium text-destructive">Marcado como «no contactar»: no se le envían mensajes.</p>}

      {p.alertas && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span><strong>Alertas:</strong> {p.alertas}</span>
        </div>
      )}

      <Tabs defaultValue="resumen" className="gap-4">
        {/* Una sola fila desplazable: en móvil no se apilan 11 pestañas. */}
        <div className="-mx-4 overflow-x-auto border-b px-4 md:-mx-8 md:px-8 [scrollbar-width:none]">
        <TabsList variant="line" className="w-max justify-start">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="estudios">Estudios ({p.estudios.length})</TabsTrigger>
          <TabsTrigger value="ordenes">Órdenes ({p.ordenes.length})</TabsTrigger>
          <TabsTrigger value="odontograma">Odontograma</TabsTrigger>
          <TabsTrigger value="plan">Plan de tratamiento ({p.planItems.length})</TabsTrigger>
          <TabsTrigger value="notas">Notas clínicas ({p.notasClinicas.length})</TabsTrigger>
          <TabsTrigger value="laboratorio">Laboratorio ({p.casosLab.length})</TabsTrigger>
          <TabsTrigger value="historia">Historia clínica</TabsTrigger>
          <TabsTrigger value="consentimientos">Consentimientos</TabsTrigger>
          <TabsTrigger value="entrega">Entrega de resultados ({enlacesEntrega.length})</TabsTrigger>
          <TabsTrigger value="hoja">Hoja de vida</TabsTrigger>
        </TabsList>
        </div>

        <TabsContent value="resumen">
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
        </TabsContent>

        <TabsContent value="estudios">
          <Card className="py-0"><CardContent className="px-0">
            {p.estudios.length === 0 ? (
              <EstadoVacio icono={ScanLine} titulo="Sin estudios" descripcion="Cuando el equipo envíe un estudio de este paciente y se le asigne, aparecerá aquí." />
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="pl-6">Fecha</TableHead><TableHead>Modalidad</TableHead><TableHead>Estado</TableHead>
                  <TableHead className="pr-6 text-right">Acciones</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {p.estudios.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="pl-6">{fecha(e.fechaEstudio ?? e.creadoEn)}</TableCell>
                      <TableCell><Badge variant="outline">{e.modalidad ?? "—"}</Badge></TableCell>
                      <TableCell><Badge variant="secondary">{ESTUDIO[e.estado]}</Badge></TableCell>
                      <TableCell className="pr-6">
                        <div className="flex flex-wrap justify-end gap-2">
                          {/* Enlace normal: /visor lo sirve Caddy, no Next */}
                          <Button asChild size="sm">
                            <a href={`/visor/viewer?StudyInstanceUIDs=${encodeURIComponent(e.studyInstanceUid)}`}><Eye /> Abrir visor</a>
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
        </TabsContent>

        <TabsContent value="ordenes">
          <Card className="py-0"><CardContent className="px-0">
            {p.ordenes.length === 0 ? (
              <EstadoVacio
                icono={ClipboardList}
                titulo="Sin órdenes"
                descripcion="Crea una orden para agendar y facturar sus estudios."
                accion={puedeGestionar && <Button asChild size="sm"><Link href={`/ordenes/nueva?paciente=${p.id}`}><ClipboardPlus /> Crear orden</Link></Button>}
              />
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="pl-6">Orden</TableHead><TableHead>Fecha</TableHead><TableHead>Estado</TableHead>
                  <TableHead className="pr-6 text-right">Total</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {p.ordenes.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="pl-6 font-medium"><Link className="underline-offset-4 hover:underline" href={`/ordenes/${o.id}`}>{numeroOrden(o.numero)}</Link></TableCell>
                      <TableCell>{fecha(o.creadoEn)}</TableCell>
                      <TableCell><Badge variant="secondary">{ORDEN[o.estado]}</Badge></TableCell>
                      <TableCell className="pr-6 text-right">{cop.format(o.items.reduce((s, i) => s + i.precio - i.descuento, 0))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="odontograma">
          <Card><CardContent>
            <Odontograma pacienteId={p.id} condiciones={p.condiciones.map((c) => ({ diente: c.diente, condicion: c.condicion }))} editable />
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="plan">
          <PlanTratamiento
            pacienteId={p.id}
            items={p.planItems}
            servicios={servicios.map((s) => ({ id: s.id, nombre: s.nombre, valor: precioFinal(s, "DIGITAL") ?? 0 }))}
          />
        </TabsContent>

        <TabsContent value="notas">
          <NotasClinicas
            pacienteId={p.id}
            notas={p.notasClinicas.map((n) => ({
              id: n.id, texto: n.texto, autor: (n.autorId && nombreActor.get(n.autorId)) || "Sin autor",
              fecha: fechaHoraCompleta(n.fecha),
              editable: puedeEditarNota({ autorId: n.autorId, creadoEn: n.creadoEn }, ctx.usuario.id),
            }))}
          />
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

        <TabsContent value="consentimientos">
          <Consentimientos
            pacienteId={p.id} vigentes={vigentes} ordenes={p.ordenes.map((o) => ({ id: o.id, numero: o.numero }))}
            registros={autorizaciones.map((a) => ({ id: a.id, tipo: a.tipo, finalidad: a.finalidad, otorgada: a.otorgada, fecha: fechaHoraCompleta(a.creadoEn), texto: a.textoMostrado, version: a.version }))}
          />
        </TabsContent>

        <TabsContent value="entrega">
          <Card><CardContent><PanelEntrega enlaces={enlacesEntrega} /></CardContent></Card>
        </TabsContent>

        <TabsContent value="hoja">
          <Card><CardContent>
            <HojaDeVida eventos={p.eventos.map((e) => ({ id: e.id, tipo: e.tipo, creadoEn: e.creadoEn, actor: (e.actorId && nombreActor.get(e.actorId)) || "Sistema" }))} />
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
