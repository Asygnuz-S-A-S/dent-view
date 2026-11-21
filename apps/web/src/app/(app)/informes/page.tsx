// Implementación independiente (sala limpia) a partir de docs/sala-limpia/01-documentos-e-informes.md
import { prisma } from "@dent-view/db";
import Link from "next/link";
import { CrearInformeBoton } from "@/components/informes/crear-informe-boton";
import { MembreteDialog } from "@/components/informes/membrete-dialog";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ETIQUETA_ESTADO_INFORME, type EstadoInforme } from "@/lib/informes";
import { numeroOrden } from "@/lib/ordenes";
import { ADMIN, MEDICOS } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { EstadoVacio } from "@/components/comunes/estado-vacio";

export const dynamic = "force-dynamic";
const TODOS = ["admin_tenant", "recepcion", "especialista", "doctor_remitente"];

export default async function Informes() {
  const ctx = await exigirContexto(TODOS);
  const org = ctx.organizationId;
  const esDoctor = ctx.rol === "doctor_remitente";
  const ordenesDoctor = esDoctor ? await prisma.orden.findMany({ where: { organizationId: org, doctorRemitenteId: ctx.usuario.id }, select: { id: true } }) : [];
  const informes = await prisma.informe.findMany({
    where: { organizationId: org, ...(esDoctor ? { estado: "EMITIDO", ordenId: { in: ordenesDoctor.map((o) => o.id) } } : {}) },
    orderBy: [{ creadoEn: "desc" }, { id: "desc" }], take: 100,
  });
  const [pacientes, ordenes] = await Promise.all([
    prisma.pacienteTenant.findMany({ where: { id: { in: informes.map((i) => i.pacienteId) } }, include: { persona: true } }),
    prisma.orden.findMany({ where: { id: { in: informes.flatMap((i) => (i.ordenId ? [i.ordenId] : [])) } }, select: { id: true, numero: true } }),
  ]);
  const nombre = new Map(pacientes.map((p) => [p.id, p.nombre]));
  const numero = new Map(ordenes.map((o) => [o.id, o.numero]));

  const puedeRedactar = (MEDICOS as readonly string[]).includes(ctx.rol);
  const conInforme = new Set((await prisma.informe.findMany({ where: { organizationId: org, estado: { not: "ARCHIVADO" } }, select: { ordenId: true } })).flatMap((i) => (i.ordenId ? [i.ordenId] : [])));
  const pendientes = puedeRedactar
    ? (await prisma.orden.findMany({ where: { organizationId: org, estado: "TOMADA" }, include: { paciente: { include: { persona: true } } }, orderBy: { numero: "asc" } })).filter((o) => !conInforme.has(o.id))
    : [];
  const config = (ADMIN as readonly string[]).includes(ctx.rol) ? await prisma.configCentro.findUnique({ where: { organizationId: org } }) : null;

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Informes radiológicos"
        descripcion="Informes por orden, con firma del especialista y versionado."
        acciones={(ADMIN as readonly string[]).includes(ctx.rol) && (<MembreteDialog inicial={{ nombre: config?.nombre ?? "", direccion: config?.direccion ?? "", telefono: config?.telefono ?? "", correo: config?.correo ?? "", registro: config?.registro ?? "" }} />)}
      />

      {pendientes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Por informar</CardTitle>
            <CardDescription>{pendientes.length === 1 ? "1 orden tomada sin informe" : `${pendientes.length} órdenes tomadas sin informe`}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {pendientes.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0"><span className="mr-3 font-medium tabular-nums">{numeroOrden(o.numero)}</span><span className="capitalize">{o.paciente.nombre.toLowerCase()}</span></span>
                  <CrearInformeBoton ordenId={o.id} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card className="py-0"><CardContent className="px-0">
        {informes.length === 0 ? (
          <EstadoVacio icono={FileText} titulo="Aún no hay informes" descripcion="Redacta el primero desde una orden tomada o desde la lista de estudios." />
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead className="pl-6">Orden</TableHead><TableHead>Paciente</TableHead><TableHead className="hidden sm:table-cell">Versión</TableHead><TableHead>Estado</TableHead><TableHead className="pr-6">Fecha</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {informes.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="pl-6 font-medium"><Link className="underline-offset-4 hover:underline" href={`/informes/${i.id}`}>{i.ordenId && numero.has(i.ordenId) ? numeroOrden(numero.get(i.ordenId)!) : "Sin orden"}</Link></TableCell>
                  <TableCell className="max-w-[14rem] truncate capitalize">{nombre.get(i.pacienteId)?.toLowerCase() ?? "—"}</TableCell>
                  <TableCell className="hidden sm:table-cell">v{i.version}{!i.vigente && " (sustituida)"}</TableCell>
                  <TableCell><Badge variant={i.estado === "EMITIDO" ? "default" : "secondary"}>{ETIQUETA_ESTADO_INFORME[i.estado as EstadoInforme]}</Badge></TableCell>
                  <TableCell className="pr-6">{(i.emitidoEn ?? i.creadoEn).toLocaleDateString("es-CO", { timeZone: "America/Bogota" })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>
    </div>
  );
}
