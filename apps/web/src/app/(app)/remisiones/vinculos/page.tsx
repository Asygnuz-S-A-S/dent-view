import { prisma } from "@dent-view/db";
import Link from "next/link";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { AccionesVinculo, SolicitarVinculo } from "@/components/remisiones/vinculos-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fechaCorta } from "@/lib/fechas";
import { ADMIN } from "@/lib/roles";
import { exigirContexto, exigirModulo } from "@/lib/sesion";

export const dynamic = "force-dynamic";

export default async function Vinculos() {
  const ctx = await exigirContexto(ADMIN);
  await exigirModulo(ctx, "remisiones");
  const org = ctx.organizationId;
  const [yo, enviados, recibidos] = await Promise.all([
    prisma.organization.findUnique({ where: { id: org }, select: { slug: true } }),
    prisma.vinculoCentro.findMany({ where: { solicitanteId: org, estado: { in: ["PENDIENTE", "ACTIVO"] } }, select: { id: true, estado: true, creadoEn: true, receptor: { select: { name: true } } }, orderBy: { creadoEn: "desc" } }),
    prisma.vinculoCentro.findMany({ where: { receptorId: org, estado: { in: ["PENDIENTE", "ACTIVO"] } }, select: { id: true, estado: true, creadoEn: true, solicitante: { select: { name: true } } }, orderBy: { creadoEn: "desc" } }),
  ]);
  const pendientes = recibidos.filter((v) => v.estado === "PENDIENTE");
  const filas = [
    ...enviados.map((v) => ({ id: v.id, estado: v.estado, creadoEn: v.creadoEn, centro: v.receptor.name, rol: "Puedes remitirle pacientes" })),
    ...recibidos.filter((v) => v.estado === "ACTIVO").map((v) => ({ id: v.id, estado: v.estado, creadoEn: v.creadoEn, centro: v.solicitante.name, rol: "Te puede remitir pacientes" })),
  ];
  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo="Vínculos entre centros" descripcion="Un centro solo puede remitirte pacientes si aceptas su vínculo. Cualquiera de los dos puede revocarlo." acciones={<Button asChild variant="outline"><Link href="/remisiones">Volver a remisiones</Link></Button>} />
      <Card>
        <CardHeader><CardTitle>Tu código</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Comparte este código con el otro centro para que te solicite el vínculo: <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">{yo?.slug}</code></p>
          <SolicitarVinculo />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Solicitudes pendientes</CardTitle></CardHeader>
        <CardContent>
          {pendientes.length === 0 ? <p className="text-sm text-muted-foreground">No tienes solicitudes pendientes.</p> : (
            <ul className="divide-y">
              {pendientes.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div><p className="font-medium">{v.solicitante.name}</p><p className="text-xs text-muted-foreground">Solicitó el {fechaCorta(v.creadoEn)}</p></div>
                  <AccionesVinculo id={v.id} tipo="responder" centro={v.solicitante.name} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Vínculos</CardTitle></CardHeader>
        <CardContent>
          {filas.length === 0 ? <p className="text-sm text-muted-foreground">Aún no tienes vínculos.</p> : (
            <ul className="divide-y">
              {filas.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="flex items-center gap-2 font-medium">{v.centro} <Badge variant={v.estado === "ACTIVO" ? "success" : "warning"}>{v.estado === "ACTIVO" ? "Activo" : "Pendiente"}</Badge></p>
                    <p className="text-xs text-muted-foreground">{v.estado === "ACTIVO" ? v.rol : "Esperando la respuesta del otro centro"} · {fechaCorta(v.creadoEn)}</p>
                  </div>
                  {v.estado === "ACTIVO" && <AccionesVinculo id={v.id} tipo="revocar" centro={v.centro} />}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
