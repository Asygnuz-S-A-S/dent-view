// Página pública de resultados: pide el código del enlace y, validado, muestra informe e imágenes.
import { prisma } from "@dent-view/db";
import { Download, Eye, ShieldCheck } from "lucide-react";
import { CompartirDoctor } from "@/components/entrega/compartir-doctor";
import { FormCodigo } from "@/components/entrega/form-codigo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PREFIJO_ACCESO } from "@/lib/bitacora";
import { hashToken } from "@/lib/entrega";
import { cssMarca } from "@/lib/marca";
import { registrarEvento } from "@/lib/eventos";
import { enlaceDeCookie } from "@/lib/resultados";

export const dynamic = "force-dynamic";
// Con el token en la URL: ni buscadores ni referrers hacia otros orígenes.
export const metadata = { title: "Resultados de su estudio", robots: { index: false, follow: false }, referrer: "same-origin" as const };
const fecha = (d: Date | null) => d?.toLocaleDateString("es-CO", { timeZone: "America/Bogota", dateStyle: "long" }) ?? "—";

export default async function Resultados({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const enlace = await enlaceDeCookie();
  if (!enlace || enlace.tokenHash !== hashToken(token)) {
    return (
      <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-6 p-6">
        <div className="space-y-2 text-center">
          <ShieldCheck className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">Resultados de su estudio</h1>
          <p className="text-sm text-muted-foreground">Escriba el código de 6 dígitos que recibió para ver sus resultados.</p>
        </div>
        <Card><CardContent><FormCodigo token={token} /></CardContent></Card>
      </main>
    );
  }

  const org = enlace.organizationId;
  const [centro, config, pac, informe, estudios] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: org }, select: { name: true } }),
    prisma.configCentro.findUnique({ where: { organizationId: org }, select: { nombre: true, logo: true, colorPrimario: true } }),
    prisma.pacienteTenant.findFirst({ where: { id: enlace.pacienteId, organizationId: org }, select: { nombre: true } }),
    enlace.informeId ? prisma.informe.findFirst({ where: { id: enlace.informeId, organizationId: org, estado: "EMITIDO", vigente: true }, select: { version: true, emitidoEn: true, pdf: true } }) : null,
    prisma.estudio.findMany({ where: { organizationId: org, pacienteId: enlace.pacienteId, studyInstanceUid: { in: enlace.estudioUids } }, select: { studyInstanceUid: true, modalidad: true, descripcion: true, fechaEstudio: true }, orderBy: { fechaEstudio: "desc" } }),
  ]);
  await registrarEvento({ organizationId: org, pacienteId: enlace.pacienteId, tipo: `${PREFIJO_ACCESO}resultados`, detalle: { accion: "ver", enlaceId: enlace.id } });
  const nombreCentro = config?.nombre || centro.name;
  const css = cssMarca(config?.colorPrimario); // solo un hex validado

  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
      <header className="space-y-6">
        <div className="flex items-center gap-3 border-b-2 border-primary pb-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- logo del centro como data URI */}
          {config?.logo && <img src={config.logo} alt={`Logo de ${nombreCentro}`} className="size-11 rounded-lg object-contain" />}
          <p className="text-base font-semibold">{nombreCentro}</p>
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">Resultados de su estudio</h1>
          <p className="text-sm text-muted-foreground">Paciente: <span className="font-medium text-foreground">{pac?.nombre}</span></p>
        </div>
      </header>

      {informe && (
        <Card>
          <CardHeader>
            <CardTitle>Informe radiológico</CardTitle>
            <CardDescription>Versión {informe.version} · emitido el {fecha(informe.emitidoEn)}</CardDescription>
          </CardHeader>
          <CardContent>
            {informe.pdf
              ? <Button asChild><a href={`/api/resultados/${encodeURIComponent(token)}/pdf`}><Download /> Descargar PDF</a></Button>
              : <p className="text-sm text-muted-foreground">El archivo no está disponible. Comuníquese con el centro.</p>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Imágenes</CardTitle>
          <CardDescription>{estudios.length === 1 ? "1 estudio" : `${estudios.length} estudios`}{estudios[0]?.fechaEstudio ? ` · ${fecha(estudios[0].fechaEstudio)}` : ""}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-1 text-sm text-muted-foreground">
            {estudios.map((e) => <li key={e.studyInstanceUid}>{[e.modalidad, e.descripcion, fecha(e.fechaEstudio)].filter(Boolean).join(" · ")}</li>)}
          </ul>
          {estudios.length > 0 && (
            // Enlace normal: /visor lo sirve Caddy, no Next
            <Button asChild><a href={`/visor/viewer?StudyInstanceUIDs=${estudios.map((e) => encodeURIComponent(e.studyInstanceUid)).join(",")}`} target="_blank" rel="noopener"><Eye /> Ver imágenes</a></Button>
          )}
        </CardContent>
      </Card>

      {enlace.destinatarioTipo === "PACIENTE" && (
        <Card>
          <CardHeader>
            <CardTitle>Compartir con mi doctor</CardTitle>
            <CardDescription>Le enviamos a su doctor un enlace propio y un código aparte. Usted puede pedir al centro que lo revoque.</CardDescription>
          </CardHeader>
          <CardContent><CompartirDoctor token={token} /></CardContent>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">Este acceso vence el {fecha(enlace.venceEn)}. No comparta el enlace ni el código.</p>
    </main>
  );
}
