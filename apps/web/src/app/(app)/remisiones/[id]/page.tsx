import { prisma } from "@dent-view/db";
import { Download, Eye } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { AccionesRemision } from "@/components/remisiones/acciones-remision";
import { BadgeRemision } from "@/components/remisiones/estado-remision";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fechaCorta, fechaHora } from "@/lib/fechas";
import { ETIQUETA_ALCANCE, ETIQUETA_ESTADO, SELECT_DESTINO, SELECT_ORIGEN, type Alcance, type EstadoRemision } from "@/lib/remisiones";
import { CLINICOS, GESTION } from "@/lib/roles";
import { exigirContexto, exigirModulo } from "@/lib/sesion";

export const dynamic = "force-dynamic";

export default async function DetalleRemision({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirContexto(CLINICOS);
  await exigirModulo(ctx, "remisiones");
  const org = ctx.organizationId;
  const { id } = await params;
  // Un centro solo ve la remisión como origen o como destino, con la proyección de su lado; cualquier otro caso es 404.
  const [comoOrigen, comoDestino] = await Promise.all([
    prisma.remision.findFirst({ where: { id, origenId: org }, select: SELECT_ORIGEN }),
    prisma.remision.findFirst({ where: { id, destinoId: org }, select: SELECT_DESTINO }),
  ]);
  const r = comoOrigen ?? comoDestino;
  if (!r) notFound();
  const esOrigen = !!comoOrigen;
  const eventos = await prisma.remisionEvento.findMany({ where: { remisionId: id }, select: { id: true, tipo: true, creadoEn: true }, orderBy: { creadoEn: "asc" } });
  const estado = r.estado as EstadoRemision;
  const otroCentro = comoOrigen ? comoOrigen.destino.name : comoDestino!.origen.name;
  const gestion = (GESTION as readonly string[]).includes(ctx.rol);
  const datos: [string, string | null][] = [
    ["Paciente", r.nombre],
    ["Documento", `${r.tipoDocumento} ${r.numeroDocumento}`],
    ["Fecha de nacimiento", r.fechaNacimiento ? fechaCorta(r.fechaNacimiento, true) : null],
    ["Celular", r.celular],
    ["Embarazo", r.embarazo === null ? null : r.embarazo ? "Sí" : "No"],
  ];

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo={`Remisión ${esOrigen ? "a" : "de"} ${otroCentro}`}
        insignia={<BadgeRemision estado={estado} />}
        acciones={<>
          {esOrigen && estado === "DEVUELTA" && r.informeId && (
            <Button asChild><a href={`/api/remisiones/${r.id}/informe`} download><Download /> Descargar informe</a></Button>
          )}
          <AccionesRemision
            id={r.id} estado={estado} lado={esOrigen ? "origen" : "destino"} clinico gestion={gestion}
            hrefOrden={comoDestino?.pacienteDestinoId ? `/ordenes/nueva?paciente=${comoDestino.pacienteDestinoId}&remision=${r.id}` : undefined}
            ordenId={comoDestino?.ordenDestinoId}
          />
        </>}
      >
        <p className="text-sm text-muted-foreground">Enviada el {fechaHora(r.creadoEn)} por {r.remitenteNombre}.</p>
      </EncabezadoPagina>

      {r.motivoRechazo && (
        <div role="status" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">Motivo del rechazo: {r.motivoRechazo}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Remisión</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div><p className="text-xs text-muted-foreground">Motivo</p><p className="whitespace-pre-wrap">{r.motivo}</p></div>
            <div><p className="text-xs text-muted-foreground">Estudios solicitados</p><p className="whitespace-pre-wrap">{r.estudiosSolicitados}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Datos compartidos del paciente</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {datos.filter(([, v]) => v !== null).map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="truncate font-medium">{v}</dd></div>)}
            </dl>
          </CardContent>
        </Card>
      </div>

      {esOrigen && estado === "DEVUELTA" && r.estudioUids.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Estudios devueltos</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {r.estudioUids.map((uid, i) => (
              <Button key={uid} asChild variant="outline" size="sm">
                <a href={`/visor/viewer?StudyInstanceUIDs=${encodeURIComponent(uid)}`} target="_blank" rel="noopener noreferrer"><Eye /> Ver en visor {r.estudioUids.length > 1 ? i + 1 : ""}<span className="sr-only"> (pestaña nueva)</span></a>
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      {comoDestino && (comoDestino.pacienteDestinoId || comoDestino.ordenDestinoId) && (
        <Card>
          <CardHeader><CardTitle>En tu centro</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {comoDestino.pacienteDestinoId && <Button asChild variant="outline" size="sm"><Link href={`/pacientes/${comoDestino.pacienteDestinoId}`}>Ver paciente</Link></Button>}
            {comoDestino.ordenDestinoId && <Button asChild variant="outline" size="sm"><Link href={`/ordenes/${comoDestino.ordenDestinoId}`}>Ver orden</Link></Button>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Consentimiento del paciente</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-pretty text-muted-foreground">{r.consentimientoTexto}</p>
          <p>Alcance autorizado: {(r.alcance as Alcance[]).map((a) => ETIQUETA_ALCANCE[a] ?? a).join(", ")}.</p>
          <p className="text-xs text-muted-foreground">Versión {r.consentimientoVersion} · registrado el {fechaHora(r.consentimientoEn)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Historial</CardTitle></CardHeader>
        <CardContent>
          <ol className="space-y-2 text-sm">
            {eventos.map((e) => <li key={e.id} className="flex justify-between gap-4"><span>{ETIQUETA_ESTADO[e.tipo as EstadoRemision] ?? e.tipo}</span><span className="text-muted-foreground">{fechaHora(e.creadoEn)}</span></li>)}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
