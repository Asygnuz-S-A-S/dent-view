import { prisma } from "@dent-view/db";
import { notFound } from "next/navigation";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { AccionesValoracion } from "@/components/valoraciones/acciones-valoracion";
import { BadgeValoracion } from "@/components/valoraciones/estado-valoracion";
import { GaleriaValoracion } from "@/components/valoraciones/galeria-valoracion";
import { FormResultado } from "@/components/valoraciones/form-resultado";
import { MensajesValoracion } from "@/components/valoraciones/mensajes-valoracion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { registrarEvento } from "@/lib/eventos";
import { fechaHora } from "@/lib/fechas";
import { exigirContexto } from "@/lib/sesion";
import { ETIQUETA_SINTOMA, INFO_ANGULO, ROLES_VER_VALORACIONES, esquemaCuestionario, estadoEfectivo, ordenarMedios, type Angulo, type EstadoVal } from "@/lib/valoraciones";
import { contextoValoraciones, odontologosDelCentro, valoracionVisible } from "@/lib/valoraciones-servidor";

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

  const [medios, mensajes, odontologos, doctor] = await Promise.all([
    prisma.valoracionMedia.findMany({ where: { valoracionId: id, organizationId: org } }),
    prisma.valoracionMensaje.findMany({ where: { valoracionId: id, organizationId: org }, orderBy: { creadoEn: "asc" } }),
    ctx.puedeCrear ? odontologosDelCentro(org) : [],
    v.doctorId ? prisma.user.findUnique({ where: { id: v.doctorId }, select: { name: true } }) : null,
  ]);
  const autores = new Map((await prisma.user.findMany({ where: { id: { in: [...new Set(mensajes.flatMap((m) => (m.autorId ? [m.autorId] : [])))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const estado = estadoEfectivo({ estado: v.estado as EstadoVal, expiraEn: v.expiraEn });
  const fotos = ordenarMedios(medios.filter((m) => m.tipo === "FOTO"));
  const videos = ordenarMedios(medios.filter((m) => m.tipo === "VIDEO"));
  const cuest = esquemaCuestionario.safeParse(v.cuestionario);
  const q = cuest.success ? cuest.data : null;
  const editable = ctx.puedeValorar && !["COMPLETADA", "CANCELADA", "EXPIRADA", "BORRADOR"].includes(v.estado);
  const espera = estado === "PENDIENTE_PACIENTE" || estado === "REQUIERE_MAS_INFO" || estado === "EXPIRADA";

  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo={v.nombre} insignia={<BadgeValoracion estado={estado} />} descripcion={[v.ciudad, v.telefono, v.correo].filter(Boolean).join(" · ") || undefined}>
        <p className="text-sm text-muted-foreground">Solicitada el {fechaHora(v.creadoEn)} · {doctor?.name ? `Odontólogo: ${doctor.name}` : "Sin odontólogo asignado"}</p>
      </EncabezadoPagina>
      <AccionesValoracion id={id} doctorId={v.doctorId} odontologos={odontologos.map((o) => ({ id: o.userId, nombre: o.user.name }))}
        puedeAsignar={ctx.puedeCrear && !["COMPLETADA", "CANCELADA"].includes(v.estado)} puedeReenviar={(ctx.puedeCrear || ctx.puedeValorar) && espera}
        puedeCancelar={(ctx.puedeCrear || ctx.puedeValorar) && !["COMPLETADA", "CANCELADA"].includes(v.estado)} />

      <Card>
        <CardHeader><CardTitle>Motivo y cuestionario</CardTitle>
          <CardDescription>{v.consentimientoEn ? `Consentimiento aceptado el ${fechaHora(v.consentimientoEn)} (versión ${v.consentimientoVersion}).` : "El paciente aún no acepta el consentimiento."}</CardDescription></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p><span className="font-medium">Motivo:</span> {v.motivo}</p>
          {q ? (
            <dl className="grid gap-2 sm:grid-cols-2">
              <div><dt className="font-medium">Dolor (0-10)</dt><dd className="text-muted-foreground">{q.dolor}</dd></div>
              <div><dt className="font-medium">Desde cuándo</dt><dd className="text-muted-foreground">{q.desde || "—"}</dd></div>
              <div><dt className="font-medium">Síntomas</dt><dd className="text-muted-foreground">{q.sintomas.length ? q.sintomas.map((s) => ETIQUETA_SINTOMA[s]).join(", ") : "—"}</dd></div>
              <div><dt className="font-medium">Alergias</dt><dd className="text-muted-foreground">{q.alergias || "—"}</dd></div>
              <div><dt className="font-medium">Medicamentos</dt><dd className="text-muted-foreground">{q.medicamentos || "—"}</dd></div>
              {q.embarazo && q.embarazo !== "NA" && <div><dt className="font-medium">Embarazo</dt><dd className="text-muted-foreground">{q.embarazo === "SI" ? "Sí" : "No"}</dd></div>}
            </dl>
          ) : <p className="text-muted-foreground">El paciente aún no responde el cuestionario.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Fotos</CardTitle><CardDescription>{fotos.length} de 12 · se ven copias sin datos de ubicación; el original se baja desde el visor.</CardDescription></CardHeader>
        <CardContent><GaleriaValoracion valoracionId={id} fotos={fotos.map((f) => ({ id: f.id, angulo: f.angulo }))} /></CardContent>
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

      <Card>
        <CardHeader><CardTitle>Mensajes</CardTitle></CardHeader>
        <CardContent>
          <MensajesValoracion valoracionId={id} puedeEscribir={ctx.puedeValorar && ["RECIBIDA", "EN_REVISION", "REQUIERE_MAS_INFO"].includes(v.estado)}
            mensajes={mensajes.map((m) => ({ id: m.id, autor: m.autor, nombre: m.autor === "PACIENTE" ? v.nombre : (m.autorId && autores.get(m.autorId)) || "Odontólogo", texto: m.texto, solicitaMedia: m.solicitaMedia, fecha: fechaHora(m.creadoEn) }))} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Valoración</CardTitle>{!ctx.puedeValorar && <CardDescription>Solo el odontólogo escribe la valoración.</CardDescription>}</CardHeader>
        <CardContent>
          <FormResultado valoracionId={id} completada={v.estado === "COMPLETADA"} puedeEditar={ctx.puedeValorar && (editable || v.estado === "COMPLETADA")}
            inicial={{ diagnosticoPreliminar: v.diagnosticoPreliminar ?? "", recomendaciones: v.recomendaciones ?? "", tratamientoSugerido: v.tratamientoSugerido ?? "", requierePresencial: v.requierePresencial, presupuestoEstimado: v.presupuestoEstimado }} />
        </CardContent>
      </Card>
    </div>
  );
}
