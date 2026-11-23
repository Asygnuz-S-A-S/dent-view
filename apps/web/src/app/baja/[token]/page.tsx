// Página pública de baja de mensajes de seguimiento: valida el enlace firmado y pide confirmación antes de registrar la baja.
import { prisma } from "@dent-view/db";
import { MailX } from "lucide-react";
import { FormBaja } from "@/components/crm/form-baja";
import { secretoCifrado } from "@/lib/cifrado";
import { verificarBaja } from "@/lib/crm-baja";
import { cssMarca } from "@/lib/marca";

export const dynamic = "force-dynamic";
// El token va en la URL: sin buscadores ni referrers hacia otros orígenes.
export const metadata = { title: "Dejar de recibir mensajes", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function Baja({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const secreto = secretoCifrado();
  const sujeto = secreto ? verificarBaja(token, secreto) : null;
  const [org, cfg] = sujeto
    ? await Promise.all([
        prisma.organization.findUnique({ where: { id: sujeto.o }, select: { name: true } }),
        prisma.configCentro.findUnique({ where: { organizationId: sujeto.o }, select: { nombre: true, colorPrimario: true } }),
      ])
    : [null, null];
  const css = cssMarca(cfg?.colorPrimario);
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-6 p-6">
      {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
      <div className="space-y-2 text-center">
        <MailX className="mx-auto size-8 text-muted-foreground" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Dejar de recibir mensajes</h1>
        {org ? (
          <p className="text-sm text-pretty text-muted-foreground">
            Confirma que no quieres recibir más mensajes de seguimiento de <strong>{cfg?.nombre || org.name}</strong>. Seguirás recibiendo avisos indispensables de tu atención, como recordatorios de cita.
          </p>
        ) : (
          <p className="text-sm text-pretty text-muted-foreground">Este enlace no es válido. Si quieres dejar de recibir mensajes, responde al correo que recibiste o escribe al centro.</p>
        )}
      </div>
      {org && <FormBaja token={token} />}
    </main>
  );
}
