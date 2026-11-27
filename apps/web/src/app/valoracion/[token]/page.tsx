// Página pública (móvil primero) de la valoración virtual: pide el código del enlace y, validado, deja subir fotos/video guiados o ver el resultado.
import { prisma } from "@dent-view/db";
import { CheckCircle2, Clock, ShieldCheck } from "lucide-react";
import { FormCodigoValoracion } from "@/components/valoraciones/form-codigo-valoracion";
import { FormularioPaciente } from "@/components/valoraciones/formulario-paciente";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PREFIJO_ACCESO } from "@/lib/bitacora";
import { registrarEvento } from "@/lib/eventos";
import { cop } from "@/lib/precios";
import { cssMarca } from "@/lib/marca";
import { fechaHora, fechaLarga } from "@/lib/fechas";
import { angulosDeSolicitud, esquemaCuestionario, ordenarMedios, pacienteEdita, pedidosPendientes, truncarIp, type EstadoVal } from "@/lib/valoraciones";
import { ipCliente, valoracionDelPaciente } from "@/lib/valoraciones-servidor";

export const dynamic = "force-dynamic";
// Con el token en la URL: ni buscadores ni referrers hacia otros orígenes.
export const metadata = { title: "Tu valoración virtual", robots: { index: false, follow: false }, referrer: "same-origin" as const };

export default async function ValoracionPublica({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const v = await valoracionDelPaciente(token);
  if (!v) {
    return (
      <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-6 p-6">
        <div className="space-y-2 text-center">
          <ShieldCheck className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">Tu valoración virtual</h1>
          <p className="text-sm text-muted-foreground">Escribe el código de 6 dígitos que recibiste para continuar.</p>
        </div>
        <Card><CardContent><FormCodigoValoracion token={token} /></CardContent></Card>
      </main>
    );
  }

  const org = v.organizationId;
  const [centro, config, medios, mensajes] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: org }, select: { name: true } }),
    prisma.configCentro.findUnique({ where: { organizationId: org }, select: { nombre: true, logo: true, colorPrimario: true, telefono: true, direccion: true } }),
    prisma.valoracionMedia.findMany({ where: { valoracionId: v.id, organizationId: org }, select: { id: true, angulo: true, tipo: true, duracionSeg: true, creadoEn: true } }),
    prisma.valoracionMensaje.findMany({ where: { valoracionId: v.id, organizationId: org }, orderBy: { creadoEn: "asc" } }),
  ]);
  await registrarEvento({ organizationId: org, pacienteId: v.pacienteId, tipo: `${PREFIJO_ACCESO}valoracion`, detalle: { accion: "ver", valoracionId: v.id, ip: truncarIp(await ipCliente()) } });
  const nombreCentro = config?.nombre || centro.name;
  const css = cssMarca(config?.colorPrimario);
  const estado = v.estado as EstadoVal;
  const edita = pacienteEdita({ estado, expiraEn: v.expiraEn });
  const cuest = esquemaCuestionario.safeParse(v.cuestionario);
  // Fotos pedidas por el profesional que aún no se han subido (repetir una toma ya existente cuenta como pendiente).
  const pedidos = pedidosPendientes(mensajes, medios);

  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
      <header className="space-y-4">
        <div className="flex items-center gap-3 border-b-2 border-primary pb-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- logo del centro como data URI */}
          {config?.logo && <img src={config.logo} alt={`Logo de ${nombreCentro}`} className="size-11 rounded-lg object-contain" />}
          <p className="text-base font-semibold">{nombreCentro}</p>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Tu valoración virtual</h1>
        <p className="text-sm text-muted-foreground">Hola, {v.nombre}.</p>
      </header>

      {estado === "COMPLETADA" ? (
        <Card>
          <CardHeader><CardTitle>Resultado de tu valoración</CardTitle><CardDescription>Entregada el {fechaLarga(v.completadaEn)}. Es una orientación preliminar a distancia.</CardDescription></CardHeader>
          <CardContent className="space-y-4 text-sm">
            <section><h2 className="font-medium">Diagnóstico preliminar</h2><p className="whitespace-pre-wrap text-muted-foreground">{v.diagnosticoPreliminar}</p></section>
            <section><h2 className="font-medium">Recomendaciones</h2><p className="whitespace-pre-wrap text-muted-foreground">{v.recomendaciones}</p></section>
            {v.tratamientoSugerido && <section><h2 className="font-medium">Tratamiento sugerido</h2><p className="whitespace-pre-wrap text-muted-foreground">{v.tratamientoSugerido}</p></section>}
            {v.presupuestoEstimado !== null && <section><h2 className="font-medium">Presupuesto estimado</h2><p className="text-muted-foreground">{cop(v.presupuestoEstimado)} (sujeto a confirmación en la consulta presencial)</p></section>}
            <section>
              <h2 className="font-medium">¿Necesitas ir al consultorio?</h2>
              <p className="text-muted-foreground">{v.requierePresencial ? "Sí, el odontólogo recomienda una valoración presencial." : "Por ahora no es necesaria una visita presencial."}</p>
              {(config?.telefono || config?.direccion) && <p className="mt-1 text-muted-foreground">{[config.direccion, config.telefono && `Tel. ${config.telefono}`].filter(Boolean).join(" · ")}</p>}
            </section>
          </CardContent>
        </Card>
      ) : edita ? (
        <>
          <Card>
            <CardHeader><CardTitle>Cómo funciona</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p>1. Aceptas el tratamiento de tus datos y respondes unas preguntas.</p>
              <p>2. Subes fotos y un video corto, siguiendo la guía de cada ángulo.</p>
              <p>3. Envías la valoración: un odontólogo la revisa y te responde por aquí.</p>
              <p className="pt-1">Este enlace vence el {fechaHora(v.expiraEn)}.</p>
            </CardContent>
          </Card>
          <FormularioPaciente
            token={token} motivoInicial={v.motivo} cuestionario={cuest.success ? cuest.data : null} consentido={!!v.consentimientoEn}
            medios={ordenarMedios(medios).map((m) => ({ id: m.id, angulo: m.angulo, tipo: m.tipo, duracionSeg: m.duracionSeg }))}
            mensajes={mensajes.map((m) => ({ id: m.id, autor: m.autor, texto: m.texto, solicitaMedia: m.solicitaMedia, fecha: fechaHora(m.creadoEn) }))}
            angulos={angulosDeSolicitud(v)} pedidos={pedidos}
          />
        </>
      ) : estado === "RECIBIDA" || estado === "EN_REVISION" ? (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="size-5 text-success-ink" aria-hidden /> Recibimos tu valoración</CardTitle>
            <CardDescription>Un odontólogo revisará tus fotos y tu video. Te avisaremos por correo cuando tengas respuesta; si necesita algo más, te lo pedirá por aquí.</CardDescription></CardHeader>
          <CardContent className="text-sm text-muted-foreground">Enviaste {medios.filter((m) => m.tipo === "FOTO").length} fotos y {medios.filter((m) => m.tipo === "VIDEO").length} video(s).</CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="size-5 text-muted-foreground" aria-hidden /> Este enlace ya no está activo</CardTitle>
            <CardDescription>Comunícate con {nombreCentro}{config?.telefono ? ` (${config.telefono})` : ""} para que te envíen uno nuevo.</CardDescription></CardHeader>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">No compartas este enlace ni el código. Tus datos se tratan conforme a la Ley 1581 de 2012.</p>
    </main>
  );
}
