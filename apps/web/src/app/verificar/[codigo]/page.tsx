// Implementación independiente (sala limpia) a partir de docs/sala-limpia/01-documentos-e-informes.md
// Página pública: confirma la autenticidad y vigencia de un informe sin revelar datos del paciente.
import { prisma } from "@dent-view/db";
import { CircleAlert, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verificación de informe" };

export default async function Verificar({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const inf = /^[A-Z0-9]{10}$/.test(codigo.toUpperCase())
    ? await prisma.informe.findUnique({ where: { codigo: codigo.toUpperCase() }, select: { estado: true, vigente: true, version: true, emitidoEn: true, firmanteNombre: true, organizationId: true } })
    : null;
  if (!inf) notFound(); // código inexistente: 404 (no confirma ni niega nada más)
  const centro = inf ? await prisma.organization.findUnique({ where: { id: inf.organizationId }, select: { name: true } }) : null;
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-4 p-6">
      {inf && inf.estado !== "BORRADOR" ? (
        <>
          <div className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck className="size-6 text-emerald-600" /> Informe auténtico</div>
          <dl className="space-y-2 rounded-lg border p-4 text-sm">
            <div><dt className="text-muted-foreground">Centro</dt><dd className="font-medium">{centro?.name}</dd></div>
            <div><dt className="text-muted-foreground">Emitido</dt><dd className="font-medium">{inf.emitidoEn?.toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "long", timeStyle: "short" })}</dd></div>
            <div><dt className="text-muted-foreground">Firmado por</dt><dd className="font-medium">{inf.firmanteNombre}</dd></div>
            <div><dt className="text-muted-foreground">Versión</dt><dd className="font-medium">{inf.version} — {inf.vigente && inf.estado === "EMITIDO" ? "vigente" : "sustituida o archivada: solicite la versión vigente"}</dd></div>
          </dl>
        </>
      ) : (
        <div className="flex items-center gap-2 text-lg font-semibold"><CircleAlert className="size-6 text-destructive" /> Código no válido</div>
      )}
    </main>
  );
}
