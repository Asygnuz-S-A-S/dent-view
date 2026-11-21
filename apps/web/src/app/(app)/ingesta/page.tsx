import { prisma } from "@dent-view/db";
import { EstacionesAdmin } from "@/components/ingesta/estaciones-admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { estadoEstacion } from "@/lib/ingesta";
import { ADMIN } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

export const dynamic = "force-dynamic";

export default async function Ingesta() {
  const ctx = await exigirContexto(ADMIN);
  const estaciones = await prisma.estacionIngesta.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { creadoEn: "desc" },
    select: { id: true, nombre: true, activa: true, ultimoContacto: true, creadoEn: true },
  });
  const servidor = process.env.BETTER_AUTH_URL ?? "https://<dominio-del-servidor>";
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Estaciones de ingesta</h1>
        <p className="text-sm text-muted-foreground">
          Cada PC del centro que exporta estudios (tomógrafo, panorámico) se registra como estación y sube los DICOM automáticamente.
        </p>
      </div>
      <EstacionesAdmin servidor={servidor} estaciones={estaciones.map((e) => ({ ...e, estado: estadoEstacion(e) }))} />
      <Card>
        <CardHeader><CardTitle>Instalación en el PC del centro</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ol className="list-decimal space-y-2 pl-5">
            <li>Crea una estación para el PC y copia el token (solo se muestra una vez).</li>
            <li>Copia <code className="rounded bg-muted px-1">agente-ingesta.exe</code> y su archivo <code className="rounded bg-muted px-1">agente-ingesta.json</code> en una carpeta del PC, por ejemplo <code className="rounded bg-muted px-1">C:\RadiaAgente</code>.</li>
            <li>En el JSON pon la URL del servidor, el token y la carpeta donde el software del equipo exporta los estudios.</li>
            <li>Ejecuta el agente (o instálalo como servicio de Windows). Al arrancar verifica el token; la estación aparece aquí como <strong>En línea</strong>.</li>
            <li>Lo que se sube pasa a la carpeta de enviados; lo rechazado, a la de errores. Escribe la cédula del paciente en el ID del paciente del equipo para que el estudio se asigne solo.</li>
          </ol>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(
            { servidor, token: "<token de la estación>", carpetas: ["C:\\Exportaciones"], enviados: "C:\\RadiaAgente\\enviados", errores: "C:\\RadiaAgente\\errores" },
            null,
            2,
          )}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
