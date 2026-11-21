// Implementación independiente (sala limpia) a partir de docs/sala-limpia/01-documentos-e-informes.md
import { prisma } from "@dent-view/db";
import { Eye } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { AlertasClinicas } from "@/components/pacientes/alertas-clinicas";
import { PanelEntrega } from "@/components/entrega/panel-entrega";
import { AccionesInforme } from "@/components/informes/acciones-informe";
import { EditorInforme } from "@/components/informes/editor-informe";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { registrarAcceso } from "@/lib/bitacora";
import { calcularAlertas } from "@/lib/historia-clinica";
import { ETIQUETA_ESTADO_INFORME, informeEditable, puedeArchivar, puedeCorregir, type EstadoInforme } from "@/lib/informes";
import { numeroOrden } from "@/lib/ordenes";
import { ADMIN, CLINICOS, MEDICOS } from "@/lib/roles";
import { listarEnlaces } from "@/lib/resultados";
import { exigirContexto } from "@/lib/sesion";

export const dynamic = "force-dynamic";

export default async function DetalleInforme({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ entregar?: string }> }) {
  const ctx = await exigirContexto(["admin_tenant", "recepcion", "especialista", "doctor_remitente"]);
  const { id } = await params;
  const { entregar } = await searchParams;
  const inf = await prisma.informe.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!inf) notFound();
  const orden = inf.ordenId ? await prisma.orden.findFirst({ where: { id: inf.ordenId, organizationId: ctx.organizationId } }) : null;
  const esDoctor = ctx.rol === "doctor_remitente";
  if (esDoctor && (orden?.doctorRemitenteId !== ctx.usuario.id || inf.estado !== "EMITIDO")) notFound();
  const pac = await prisma.pacienteTenant.findUnique({ where: { id: inf.pacienteId }, include: { persona: true } });
  const versiones = await prisma.informe.findMany({ where: { grupoId: inf.grupoId, organizationId: ctx.organizationId }, orderBy: { version: "desc" }, select: { id: true, version: true, estado: true } });
  await registrarAcceso(ctx, inf.pacienteId, "informe", { informeId: inf.id, accion: "lectura" });

  const estudio = inf.estudioId || inf.ordenId
    ? await prisma.estudio.findFirst({ where: { organizationId: ctx.organizationId, ...(inf.estudioId ? { id: inf.estudioId } : { ordenId: inf.ordenId }) }, select: { studyInstanceUid: true } })
    : null;
  const entregable = inf.estado === "EMITIDO" && (CLINICOS as readonly string[]).includes(ctx.rol);
  const [centro, org] = entregable ? await Promise.all([prisma.configCentro.findUnique({ where: { organizationId: ctx.organizationId } }), prisma.organization.findUnique({ where: { id: ctx.organizationId }, select: { name: true } })]) : [null, null];
  const enlaces = entregable ? await listarEnlaces(ctx.organizationId, { informeId: inf.id }) : [];
  const medico = (MEDICOS as readonly string[]).includes(ctx.rol);
  const [contexto, alergias, enfermedades] = medico
    ? await Promise.all([
        prisma.contextoMedico.findUnique({ where: { pacienteId: inf.pacienteId } }),
        prisma.alergiaPaciente.findMany({ where: { pacienteId: inf.pacienteId, organizationId: ctx.organizationId, activo: true } }),
        prisma.enfermedadPaciente.findMany({ where: { pacienteId: inf.pacienteId, organizationId: ctx.organizationId, activo: true } }),
      ])
    : [null, [], []];
  // Recepción no ve la historia clínica: solo la nota de alertas de la ficha.
  const alertas = medico ? calcularAlertas(contexto, alergias, enfermedades) : !esDoctor && pac?.alertas ? [{ gravedad: "MEDIA" as const, texto: pac.alertas }] : [];
  const campos = [["Motivo de la remisión", inf.motivo], ["Técnica", inf.tecnica], ["Hallazgos", inf.hallazgos], ["Impresión diagnóstica", inf.impresion], ["Recomendaciones", inf.recomendaciones]] as const;

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo={`Informe ${orden ? numeroOrden(orden.numero) : ""} · v${inf.version}`}
        insignia={<>
          <Badge variant={inf.estado === "EMITIDO" ? "default" : "secondary"}>{ETIQUETA_ESTADO_INFORME[inf.estado as EstadoInforme]}</Badge>
          {!inf.vigente && <Badge variant="outline">Sustituido por una versión posterior</Badge>}
        </>}
        acciones={<>
          {estudio && (
            <Button asChild variant="outline">
              {/* Enlace normal: /visor lo sirve Caddy, no Next */}
              <a href={`/visor/viewer?StudyInstanceUIDs=${encodeURIComponent(estudio.studyInstanceUid)}`}><Eye /> Abrir visor</a>
            </Button>
          )}
          <AccionesInforme
            id={inf.id} puedeDescargar={inf.estado !== "BORRADOR" && !!inf.pdf}
            puedeCorregir={medico && puedeCorregir(inf)} puedeArchivar={(ADMIN as readonly string[]).includes(ctx.rol) && puedeArchivar(inf.estado)}
          />
        </>}
      >
        <p className="text-sm text-muted-foreground">
          {(CLINICOS as readonly string[]).includes(ctx.rol) ? <Link className="font-medium capitalize text-foreground underline-offset-4 hover:underline" href={`/pacientes/${inf.pacienteId}`}>{pac?.nombre.toLowerCase()}</Link> : <span className="font-medium capitalize text-foreground">{pac?.nombre.toLowerCase()}</span>}
          {inf.emitidoEn && <> · emitido {inf.emitidoEn.toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" })} por {inf.firmanteNombre}</>}
          {inf.codigo && <> · código <span className="font-mono">{inf.codigo}</span></>}
        </p>
        {inf.motivoCorreccion && <p className="text-sm">Motivo de la corrección: {inf.motivoCorreccion}</p>}
      </EncabezadoPagina>

      <AlertasClinicas alertas={alertas} />

      {entregable && inf.vigente && (
        <Card>
          <CardHeader><CardTitle>Entrega de resultados</CardTitle></CardHeader>
          <CardContent>
            <PanelEntrega enlaces={enlaces} origen={{ informeId: inf.id, nombre: pac?.nombre ?? "", correo: pac?.correo ?? "", centro: { nombre: centro?.nombre || org?.name || "", logo: centro?.logo ?? null } }} abrirInicial={entregar === "1" && !!pac?.correo} />
          </CardContent>
        </Card>
      )}

      {medico && informeEditable(inf.estado) ? (
        <div className="rounded-xl border bg-card p-4 sm:p-6">
          <EditorInforme id={inf.id} paciente={pac?.nombre} inicial={{ motivo: inf.motivo ?? "", tecnica: inf.tecnica ?? "", hallazgos: inf.hallazgos, impresion: inf.impresion, recomendaciones: inf.recomendaciones ?? "" }} />
        </div>
      ) : (
        <Card>
          <CardHeader><CardTitle>Contenido</CardTitle></CardHeader>
          <CardContent className="max-w-prose space-y-5 text-sm">
            {campos.map(([k, v]) => v ? <section key={k} className="space-y-1"><h3 className="text-xs font-medium text-muted-foreground">{k}</h3><p className="leading-relaxed whitespace-pre-wrap">{v}</p></section> : null)}
          </CardContent>
        </Card>
      )}

      {versiones.length > 1 && (
        <p className="text-sm text-muted-foreground">
          Versiones: {versiones.map((v) => <Link key={v.id} className="mr-3 underline-offset-4 hover:underline" href={`/informes/${v.id}`}>v{v.version} ({ETIQUETA_ESTADO_INFORME[v.estado as EstadoInforme].toLowerCase()})</Link>)}
        </p>
      )}
    </div>
  );
}
