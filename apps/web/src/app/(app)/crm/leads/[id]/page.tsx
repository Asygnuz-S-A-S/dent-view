import { prisma } from "@dent-view/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BotonWhatsapp, Convertir, EditarLead, CambiarEtapa, InscribirSecuencia, NotaForm, Perdido, Preferencias, RegistrarContacto, TareaCheck, TareaForm, type DatosLead } from "@/components/crm/ficha-lead";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ETIQUETA_ACTIVIDAD, ETIQUETA_ETAPA, etiquetaOrigen, type Etapa, type TipoActividad } from "@/lib/crm";
import { alcanceLeads, cargarResponsables, esGestion } from "@/lib/crm-datos";
import { fechaCorta, fechaHoraCompleta, fechaIso } from "@/lib/fechas";
import { cop } from "@/lib/formato";
import { CLINICOS } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

export const dynamic = "force-dynamic";
const ESTADO_INSC = { ACTIVA: "En curso", COMPLETADA: "Completada", PAUSADA: "Pausada", CANCELADA: "Cancelada" } as const;

export default async function FichaLead({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirContexto(CLINICOS);
  const gestion = esGestion(ctx.rol);
  const { id } = await params;
  const lead = await prisma.lead.findFirst({ where: { id, ...alcanceLeads(ctx) }, include: { responsable: { select: { name: true } } } });
  if (!lead) notFound();
  const org = ctx.organizationId;
  const [actividades, tareas, inscripciones, secuencias, responsables, centro] = await Promise.all([
    prisma.actividadLead.findMany({ where: { organizationId: org, leadId: id }, orderBy: { creadoEn: "desc" }, take: 100 }),
    prisma.tareaCRM.findMany({ where: { organizationId: org, leadId: id }, orderBy: [{ estado: "asc" }, { vence: "asc" }], include: { asignado: { select: { name: true } } }, take: 50 }),
    prisma.inscripcionSecuencia.findMany({ where: { organizationId: org, leadId: id }, orderBy: { creadoEn: "desc" }, include: { secuencia: { select: { nombre: true } } }, take: 20 }),
    gestion ? prisma.secuenciaCRM.findMany({ where: { organizationId: org }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }) : [],
    gestion ? cargarResponsables(org) : [],
    prisma.configCentro.findUnique({ where: { organizationId: org }, select: { nombre: true } }).then(async (c) => c?.nombre || (await prisma.organization.findUnique({ where: { id: org }, select: { name: true } }))?.name || "nuestro centro"),
  ]);
  const autores = new Map((await prisma.user.findMany({ where: { id: { in: [...new Set(actividades.flatMap((a) => (a.autorId ? [a.autorId] : [])))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const datos: DatosLead = {
    id: lead.id, nombre: lead.nombre, telefono: lead.telefono, correo: lead.correo, ciudad: lead.ciudad, interes: lead.interes, etapa: lead.etapa as Etapa,
    valorEstimado: lead.valorEstimado, responsableId: lead.responsableId, proximoContacto: lead.proximoContacto ? fechaIso(lead.proximoContacto) : null,
    noContactar: lead.noContactar, consentimientoMercadeo: lead.consentimientoMercadeo, pacienteId: lead.pacienteId,
  };
  const cerrado = lead.etapa === "GANADO" || lead.etapa === "PERDIDO";

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo={lead.nombre}
        insignia={<Badge variant={lead.etapa === "GANADO" ? "success" : lead.etapa === "PERDIDO" ? "danger" : "info"}>{ETIQUETA_ETAPA[lead.etapa as Etapa]}</Badge>}
        descripcion={`${etiquetaOrigen(lead.origen)}${lead.interes ? ` · ${lead.interes}` : ""} · creado el ${fechaCorta(lead.creadoEn)}`}
        acciones={gestion ? <><EditarLead lead={datos} responsables={responsables} />{!lead.pacienteId && lead.etapa !== "PERDIDO" && <Convertir id={lead.id} />}</> : undefined}
      />
      {lead.pacienteId && <p className="text-sm">Este lead ya es paciente: <Link className="underline" href={`/pacientes/${lead.pacienteId}`}>ver ficha del paciente</Link>.</p>}
      {lead.noContactar && <p role="status" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">Marcado como «no contactar»: no se le envía ningún correo automático.</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card><CardHeader><CardTitle>Datos</CardTitle></CardHeader><CardContent>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              {([["Teléfono", lead.telefono], ["Correo", lead.correo], ["Ciudad", lead.ciudad], ["Valor estimado", lead.valorEstimado ? cop(lead.valorEstimado) : null], ["Responsable", lead.responsable?.name], ["Próximo contacto", lead.proximoContacto ? fechaCorta(lead.proximoContacto) : null], ["Último contacto", lead.ultimoContactoEn ? fechaHoraCompleta(lead.ultimoContactoEn) : null], ["Motivo de pérdida", lead.motivoPerdida]] as const).map(([k, v]) => v ? <div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="font-medium break-words">{v}</dd></div> : null)}
            </dl>
          </CardContent></Card>

          <Card><CardHeader><CardTitle>Línea de tiempo</CardTitle></CardHeader><CardContent>
            {actividades.length === 0 ? <p className="text-sm text-muted-foreground">Aún no hay actividad.</p> : (
              <ol className="space-y-3">
                {actividades.map((a) => (
                  <li key={a.id} className="border-l-2 pl-3 text-sm">
                    <p className="flex flex-wrap items-center gap-2"><Badge variant={a.automatica ? "secondary" : "outline"}>{a.automatica ? "Automática" : ETIQUETA_ACTIVIDAD[a.tipo as TipoActividad]}</Badge><span className="text-xs text-muted-foreground">{fechaHoraCompleta(a.creadoEn)}{a.autorId && autores.get(a.autorId) ? ` · ${autores.get(a.autorId)}` : ""}</span></p>
                    {a.texto && <p className="mt-1 break-words whitespace-pre-line">{a.texto}</p>}
                  </li>
                ))}
              </ol>
            )}
          </CardContent></Card>
        </div>

        <aside className="space-y-6">
          {gestion && <Card><CardContent className="space-y-4 pt-4">
            <CambiarEtapa id={lead.id} etapa={datos.etapa} />
            <RegistrarContacto id={lead.id} />
            <BotonWhatsapp telefono={lead.telefono} nombre={lead.nombre} centro={centro} />
          </CardContent></Card>}
          <Card><CardContent className="pt-4"><NotaForm id={lead.id} /></CardContent></Card>
          <Card><CardHeader><CardTitle>Tareas</CardTitle></CardHeader><CardContent className="space-y-3">
            {tareas.length === 0 && <p className="text-sm text-muted-foreground">Sin tareas.</p>}
            <ul className="space-y-2">{tareas.map((t) => <li key={t.id}>{gestion ? <TareaCheck id={t.id} titulo={t.titulo} hecha={t.estado === "HECHA"} /> : <span className="text-sm">{t.titulo}</span>}<p className="pl-6 text-xs text-muted-foreground">{[t.vence && `vence ${fechaCorta(t.vence)}`, t.asignado?.name, t.automatica && "automática"].filter(Boolean).join(" · ")}</p></li>)}</ul>
            {gestion && <TareaForm id={lead.id} responsables={responsables} />}
          </CardContent></Card>
          {gestion && <Card><CardHeader><CardTitle>Secuencias</CardTitle></CardHeader><CardContent className="space-y-3">
            {inscripciones.length > 0 && <ul className="space-y-1 text-sm">{inscripciones.map((i) => <li key={i.id} className="flex justify-between gap-2"><span className="truncate">{i.secuencia.nombre}</span><span className="shrink-0 text-muted-foreground">{ESTADO_INSC[i.estado]}</span></li>)}</ul>}
            {!lead.noContactar && !cerrado && <InscribirSecuencia ref_={{ leadId: lead.id }} secuencias={secuencias} />}
          </CardContent></Card>}
          {gestion && <Card><CardHeader><CardTitle>Contacto y consentimiento</CardTitle></CardHeader><CardContent><Preferencias id={lead.id} noContactar={lead.noContactar} consentimiento={lead.consentimientoMercadeo} /></CardContent></Card>}
          {gestion && lead.etapa !== "PERDIDO" && !lead.pacienteId && <Card><CardContent className="pt-4"><Perdido id={lead.id} /></CardContent></Card>}
        </aside>
      </div>
    </div>
  );
}
