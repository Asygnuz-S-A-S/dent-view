import { prisma } from "@dent-view/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { AccionesValoracion } from "@/components/valoraciones/acciones-valoracion";
import { BadgeValoracion } from "@/components/valoraciones/estado-valoracion";
import { GaleriaValoracion } from "@/components/valoraciones/galeria-valoracion";
import { FormResultado } from "@/components/valoraciones/form-resultado";
import { MensajesValoracion } from "@/components/valoraciones/mensajes-valoracion";
import { DetalleTabs } from "@/components/valoraciones/detalle-tabs";
import { NotasInternas } from "@/components/valoraciones/notas-internas";
import { PasosValoracion } from "@/components/valoraciones/pasos-valoracion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { registrarEvento } from "@/lib/eventos";
import { fechaHora } from "@/lib/fechas";
import { exigirContexto } from "@/lib/sesion";
import { urlBase } from "@/lib/resultados";
import {
  ETIQUETA_ETAPA, ETIQUETA_SINTOMA, INFO_ANGULO, MAX_FOTOS, ROLES_VER_VALORACIONES, enlaceWhatsapp, esquemaCuestionario, estadoEfectivo, etapaValoracion, ordenarMedios, pasoDeEtapa, siguienteAccion,
  type Angulo, type EstadoVal,
} from "@/lib/valoraciones";
import { contextoValoraciones, odontologosDelCentro, pacienteDeValoracion, valoracionVisible } from "@/lib/valoraciones-servidor";

const ETIQUETA_EVENTO: Record<string, string> = {
  creada: "Solicitud creada", enlace_reenviado: "Enlace reenviado al paciente", consentimiento: "El paciente aceptó el consentimiento", archivo_subido: "El paciente subió un archivo",
  recibida: "El paciente envió la valoración", en_revision: "Pasó a revisión", mensaje: "Mensaje en el hilo", guardada: "Borrador de la valoración guardado", completada: "Valoración completada",
  resultado_enviado: "Resultado enviado al paciente", recordatorio: "Recordatorio enviado al paciente", foto_en_ficha: "Foto guardada en la ficha del paciente", cancelada: "Solicitud cancelada", asignada: "Odontólogo asignado", notas: "Notas internas actualizadas", nota_foto: "Comentario de una foto actualizado",
};

export const dynamic = "force-dynamic";

export default async function DetalleValoracion({ params }: { params: Promise<{ id: string }> }) {
  await exigirContexto(ROLES_VER_VALORACIONES);
  const ctx = await contextoValoraciones();
  const { id } = await params;
  if (!ctx) notFound();
  let v = await valoracionVisible(ctx, id);
  if (!v) notFound();
  const org = ctx.organizationId;
  // Al abrirla, el odontólogo que puede valorar la pasa de RECIBIDA a EN_REVISION (atómico: dos pestañas no duplican el evento).
  if (ctx.puedeValorar && v.estado === "RECIBIDA") {
    const { count } = await prisma.valoracion.updateMany({ where: { id, organizationId: org, estado: "RECIBIDA" }, data: { estado: "EN_REVISION" } });
    if (count === 1) {
      await registrarEvento({ organizationId: org, pacienteId: v.pacienteId, actorId: ctx.usuario.id, tipo: "valoracion.en_revision", detalle: { valoracionId: id } });
      v = { ...v, estado: "EN_REVISION" };
    }
  }
  await registrarEvento({ organizationId: org, pacienteId: v.pacienteId, actorId: ctx.usuario.id, tipo: "acceso.valoracion", detalle: { valoracionId: id, accion: "ver" } });

  // Lo clínico solo se consulta (y se muestra) para quien valora; recepción ve estado, contacto, fechas y asignado.
  const clinico = ctx.puedeValorar;
  const [medios, mensajes, odontologos, doctor, presupuesto, eventos, conteos, pacienteFicha] = await Promise.all([
    clinico ? prisma.valoracionMedia.findMany({ where: { valoracionId: id, organizationId: org } }) : [],
    clinico ? prisma.valoracionMensaje.findMany({ where: { valoracionId: id, organizationId: org }, orderBy: { creadoEn: "asc" } }) : [],
    ctx.puedeAsignar ? odontologosDelCentro(org) : [],
    v.doctorId ? prisma.user.findUnique({ where: { id: v.doctorId }, select: { name: true } }) : null,
    v.estado === "COMPLETADA" ? prisma.presupuesto.findFirst({ where: { organizationId: org, valoracionId: id }, select: { id: true, numero: true }, orderBy: { numero: "asc" } }) : null,
    // Historial: solo metadatos (sin contenido clínico). Las notas internas aparecen solo para quien valora.
    prisma.evento.findMany({ where: { organizationId: org, tipo: { startsWith: "valoracion." }, detalle: { path: ["valoracionId"], equals: id } }, orderBy: { creadoEn: "desc" }, take: 40 }),
    // Recepción ve solo cuántos archivos y mensajes hay.
    clinico ? null : Promise.all([prisma.valoracionMedia.count({ where: { valoracionId: id, organizationId: org, tipo: "FOTO" } }), prisma.valoracionMedia.count({ where: { valoracionId: id, organizationId: org, tipo: "VIDEO" } }), prisma.valoracionMensaje.count({ where: { valoracionId: id, organizationId: org } })]),
    clinico ? pacienteDeValoracion(v) : null,
  ]);
  const usuarios = new Map((await prisma.user.findMany({ where: { id: { in: [...new Set([...mensajes.flatMap((m) => (m.autorId ? [m.autorId] : [])), ...eventos.flatMap((e) => (e.actorId ? [e.actorId] : []))])] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const estado = estadoEfectivo({ estado: v.estado as EstadoVal, expiraEn: v.expiraEn });
  const etapa = etapaValoracion({ estado: v.estado as EstadoVal, expiraEn: v.expiraEn, ultimoAccesoEn: v.ultimoAccesoEn, resultadoEnviadoEn: v.resultadoEnviadoEn });
  const accion = siguienteAccion(etapa, ctx.puedeValorar);
  const fotos = ordenarMedios(medios.filter((m) => m.tipo === "FOTO"));
  const videos = ordenarMedios(medios.filter((m) => m.tipo === "VIDEO"));
  const cuest = esquemaCuestionario.safeParse(v.cuestionario);
  const q = cuest.success ? cuest.data : null;
  const editable = ctx.puedeValorar && !["COMPLETADA", "CANCELADA", "EXPIRADA", "BORRADOR"].includes(v.estado);
  const espera = estado === "PENDIENTE_PACIENTE" || estado === "REQUIERE_MAS_INFO" || estado === "EXPIRADA";
  // Guía de captura por WhatsApp: el tipo de consulta (dato clínico) solo viaja en el enlace si quien lo envía valora.
  const tipoGuia = clinico && v.plantillaCaptura && v.plantillaCaptura !== "PERSONALIZADA" ? `?tipo=${v.plantillaCaptura}` : "";
  const guiaWhatsapp = espera && estado !== "EXPIRADA" ? enlaceWhatsapp(v.telefono, `Hola, antes de tu valoración virtual mira esta guía para tomar buenas fotos y video: ${urlBase()}/valoracion/guia${tipoGuia}`) : null;

  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo={v.nombre} insignia={<BadgeValoracion estado={estado} />} descripcion={[v.ciudad, v.telefono, v.correo].filter(Boolean).join(" · ") || undefined}
        acciones={v.estado === "COMPLETADA" ? (presupuesto
          ? <Button asChild variant="outline"><Link href={`/presupuestos/${presupuesto.id}`}>Ver cotización #{presupuesto.numero}</Link></Button>
          : <Button asChild><Link href={`/presupuestos/nuevo?valoracion=${v.id}`}>Crear cotización</Link></Button>) : undefined}>
        <p className="text-sm text-muted-foreground">Solicitada el {fechaHora(v.creadoEn)} · {doctor?.name ? `Odontólogo: ${doctor.name}` : "Sin odontólogo asignado"}</p>
      </EncabezadoPagina>
      <AccionesValoracion id={id} doctorId={v.doctorId} odontologos={odontologos.map((o) => ({ id: o.userId, nombre: o.user.name }))}
        puedeAsignar={ctx.puedeAsignar && !["COMPLETADA", "CANCELADA"].includes(v.estado)} puedeReenviar={(ctx.puedeCrear || ctx.puedeValorar) && espera}
        puedeCancelar={(ctx.puedeCrear || ctx.puedeValorar) && !["COMPLETADA", "CANCELADA"].includes(v.estado)} guiaWhatsapp={guiaWhatsapp} />
      <PasosValoracion actual={pasoDeEtapa(etapa)} />
      <Card>
        <CardHeader><CardTitle>Siguiente paso</CardTitle><CardDescription>{ETIQUETA_ETAPA[etapa]}</CardDescription></CardHeader>
        <CardContent className="space-y-1 text-sm"><p className="font-medium">{accion.titulo}</p><p className="text-muted-foreground">{accion.detalle}</p></CardContent>
      </Card>

      {!clinico && (
        <Card>
          <CardHeader><CardTitle>Contenido clínico</CardTitle>
            <CardDescription>Motivo, cuestionario, fotos, video y valoración son datos de salud: solo los ve el odontólogo que valora. Aquí puedes dar seguimiento al estado, reenviar el acceso y asignar un odontólogo.</CardDescription></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>{v.consentimientoEn ? `El paciente aceptó el consentimiento el ${fechaHora(v.consentimientoEn)}.` : "El paciente aún no acepta el consentimiento."}</p>
            {conteos && <p className="mt-1">Ha subido {conteos[0]} {conteos[0] === 1 ? "foto" : "fotos"} y {conteos[1]} {conteos[1] === 1 ? "video" : "videos"}; hay {conteos[2]} {conteos[2] === 1 ? "mensaje" : "mensajes"} en el hilo.</p>}
          </CardContent>
        </Card>
      )}

      {clinico && (
        <DetalleTabs
          inicial={accion.destino === "enviar" ? "responder" : "paciente"} // primero las fotos; el resultado listo abre directo en «Responder»
          conteoMensajes={mensajes.length}
          paciente={<>
            <Card>
              <CardHeader><CardTitle>Motivo y cuestionario</CardTitle>
                <CardDescription>{v.consentimientoEn ? `Consentimiento aceptado el ${fechaHora(v.consentimientoEn)} (versión ${v.consentimientoVersion}).` : "El paciente aún no acepta el consentimiento."}</CardDescription></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p><span className="font-medium">Motivo:</span> {v.motivo}</p>
                {q ? (
                  <dl className="grid gap-2 sm:grid-cols-2">
                    <div><dt className="font-medium">Dolor (0-10)</dt><dd className="text-muted-foreground">{q.dolor}</dd></div>
                    <div><dt className="font-medium">Desde cuándo</dt><dd className="text-muted-foreground">{q.desde || "—"}</dd></div>
                    <div><dt className="font-medium">Síntomas</dt><dd className="text-muted-foreground">{q.sintomas.length ? q.sintomas.map((x) => ETIQUETA_SINTOMA[x]).join(", ") : "—"}</dd></div>
                    <div><dt className="font-medium">Alergias</dt><dd className="text-muted-foreground">{q.alergias || "—"}</dd></div>
                    <div><dt className="font-medium">Medicamentos</dt><dd className="text-muted-foreground">{q.medicamentos || "—"}</dd></div>
                    {q.embarazo && q.embarazo !== "NA" && <div><dt className="font-medium">Embarazo</dt><dd className="text-muted-foreground">{q.embarazo === "SI" ? "Sí" : "No"}</dd></div>}
                  </dl>
                ) : <p className="text-muted-foreground">El paciente aún no responde el cuestionario.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Fotos</CardTitle><CardDescription>{fotos.length} de {MAX_FOTOS} · se ven copias sin datos de ubicación; el original se baja desde el visor.</CardDescription></CardHeader>
              <CardContent><GaleriaValoracion valoracionId={id} fotos={fotos.map((f) => ({ id: f.id, angulo: f.angulo, nota: f.nota, enFicha: !!f.imagenEstudioId }))}
                puedePedir={["RECIBIDA", "EN_REVISION", "REQUIERE_MAS_INFO"].includes(v.estado)} puedeFicha={!!pacienteFicha} /></CardContent>
            </Card>
            {videos.length > 0 && (
              <Card>
                <CardHeader><CardTitle>Video</CardTitle></CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  {videos.map((m) => (
                    <figure key={m.id} className="space-y-1">
                      <video controls preload="metadata" playsInline className="w-full rounded-lg bg-black" src={`/api/valoraciones/${id}/medios/${m.id}`} aria-label={INFO_ANGULO[m.angulo as Angulo].etiqueta}>
                        Tu navegador no puede reproducir este video.
                      </video>
                      <figcaption className="text-xs text-muted-foreground">{m.duracionSeg ? `${m.duracionSeg} s · ` : ""}{(m.bytes / 1_048_576).toFixed(1)} MB · {m.mime}</figcaption>
                    </figure>
                  ))}
                </CardContent>
              </Card>
            )}
          </>}
          responder={
            <Card>
              <CardHeader><CardTitle>Valoración</CardTitle></CardHeader>
              <CardContent>
                <FormResultado valoracionId={id} pacienteId={v.pacienteId} completada={v.estado === "COMPLETADA"} enviada={!!v.resultadoEnviadoEn} puedeEditar={ctx.puedeValorar && (editable || v.estado === "COMPLETADA")}
                  inicial={{ diagnosticoPreliminar: v.diagnosticoPreliminar ?? "", recomendaciones: v.recomendaciones ?? "", tratamientoSugerido: v.tratamientoSugerido ?? "", requierePresencial: v.requierePresencial, presupuestoEstimado: v.presupuestoEstimado }} />
              </CardContent>
            </Card>
          }
          mensajes={
            <Card>
              <CardHeader><CardTitle>Mensajes</CardTitle></CardHeader>
              <CardContent>
                <MensajesValoracion valoracionId={id} puedeEscribir={ctx.puedeValorar && ["RECIBIDA", "EN_REVISION", "REQUIERE_MAS_INFO"].includes(v.estado)}
                  mensajes={mensajes.map((m) => ({ id: m.id, autor: m.autor, nombre: m.autor === "PACIENTE" ? v.nombre : (m.autorId && usuarios.get(m.autorId)) || "Odontólogo", texto: m.texto, solicitaMedia: m.solicitaMedia, fecha: fechaHora(m.creadoEn) }))} />
              </CardContent>
            </Card>
          }
          notas={<Card><CardHeader><CardTitle>Notas internas</CardTitle></CardHeader><CardContent><NotasInternas valoracionId={id} inicial={v.notasInternas ?? ""} /></CardContent></Card>}
        />
      )}

      <Card>
        <CardHeader><CardTitle>Historial</CardTitle></CardHeader>
        <CardContent>
          <ul aria-label="Historial de la valoración" className="space-y-2 text-sm">
            {eventos.filter((e) => clinico || !["valoracion.notas", "valoracion.nota_foto"].includes(e.tipo)).map((e) => (
              <li key={e.id} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5">
                <span>{ETIQUETA_EVENTO[e.tipo.slice("valoracion.".length)] ?? e.tipo}{e.actorId && usuarios.get(e.actorId) ? <span className="text-muted-foreground"> · {usuarios.get(e.actorId)}</span> : null}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{fechaHora(e.creadoEn)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
