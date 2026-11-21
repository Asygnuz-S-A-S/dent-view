// Implementación independiente (sala limpia) a partir de docs/sala-limpia/02-consentimientos-y-proteccion-de-datos.md
import { prisma } from "@dent-view/db";
import { AvanzarSolicitud, NuevaSolicitud } from "@/components/seguimiento/proteccion-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { diasRestantes, ETIQUETA_ESTADO_SOLICITUD, ETIQUETA_TIPO_SOLICITUD, type EstadoSolicitud, type TipoSolicitud } from "@/lib/consentimientos";
import { GESTION, ADMIN } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";
import { fechaHoraCompleta } from "@/lib/fechas";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { EstadoVacio } from "@/components/comunes/estado-vacio";

export const dynamic = "force-dynamic";
const fmt = fechaHoraCompleta;

export default async function ProteccionDatos({ searchParams }: { searchParams: Promise<{ tipo?: string; desde?: string; hasta?: string }> }) {
  const ctx = await exigirContexto(GESTION);
  const org = ctx.organizationId;
  const q = await searchParams;
  const esAdmin = (ADMIN as readonly string[]).includes(ctx.rol);
  const solicitudes = await prisma.solicitudTitular.findMany({ where: { organizationId: org }, orderBy: [{ venceEn: "asc" }, { id: "asc" }], take: 200 });
  const pacientes = await prisma.pacienteTenant.findMany({ where: { organizationId: org }, include: { persona: true }, orderBy: { creadoEn: "desc" }, take: 300 });

  const dia = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00-05:00`) : undefined);
  const desde = dia(q.desde), hasta = dia(q.hasta);
  const bitacora = esAdmin
    ? await prisma.evento.findMany({
        where: {
          organizationId: org, ...(q.tipo ? { tipo: { startsWith: q.tipo } } : {}),
          ...(desde || hasta ? { creadoEn: { ...(desde ? { gte: desde } : {}), ...(hasta ? { lt: new Date(hasta.getTime() + 86_400_000) } : {}) } } : {}),
        },
        orderBy: [{ creadoEn: "desc" }, { id: "desc" }], take: 100,
      })
    : [];
  const ids = [...new Set(bitacora.flatMap((e) => [e.actorId, e.pacienteId]).filter((x): x is string => !!x))];
  const [usuarios, pacs] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    prisma.pacienteTenant.findMany({ where: { id: { in: ids }, organizationId: org }, include: { persona: true } }),
  ]);
  const nombre = new Map([...usuarios.map((u) => [u.id, u.name] as const), ...pacs.map((p) => [p.id, p.nombre] as const)]);
  const nombrePac = new Map(pacientes.map((p) => [p.id, p.nombre]));

  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo="Protección de datos" descripcion="Solicitudes de los titulares y bitácora de accesos. Las autorizaciones se registran en la ficha de cada paciente." />
      <Tabs defaultValue="solicitudes">
        <TabsList>
          <TabsTrigger value="solicitudes">Solicitudes ({solicitudes.length})</TabsTrigger>
          {esAdmin && <TabsTrigger value="bitacora">Bitácora de accesos</TabsTrigger>}
        </TabsList>
        <TabsContent value="solicitudes" className="space-y-4">
          <div className="flex justify-end"><NuevaSolicitud pacientes={pacientes.map((p) => ({ id: p.id, nombre: p.nombre }))} /></div>
          <Card className="py-0"><CardContent className="px-0">
            {solicitudes.length === 0 ? <EstadoVacio titulo="No hay solicitudes de titulares" descripcion="Regístralas con «Nueva solicitud»." /> : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="pl-4 md:pl-6">Solicitante</TableHead><TableHead className="hidden lg:table-cell">Tipo</TableHead><TableHead className="hidden lg:table-cell">Paciente</TableHead><TableHead className="hidden lg:table-cell">Estado</TableHead><TableHead className="hidden lg:table-cell">Plazo</TableHead><TableHead className="pr-4 md:pr-6 text-right">Acciones</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {solicitudes.map((s) => {
                    const dias = diasRestantes(s.venceEn);
                    const abierta = s.estado === "RECIBIDA" || s.estado === "EN_TRAMITE";
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="max-w-[12rem] whitespace-normal pl-4 md:pl-6"><p className="font-medium">{s.solicitanteNombre}</p><p className="truncate text-xs text-muted-foreground">{s.solicitanteCorreo}</p><p className="text-xs text-muted-foreground lg:hidden">{ETIQUETA_ESTADO_SOLICITUD[s.estado as EstadoSolicitud]} · {ETIQUETA_TIPO_SOLICITUD[s.tipo as TipoSolicitud]}{abierta ? ` · ${dias < 0 ? `vencida hace ${-dias} d` : `${dias} d`}` : ""}</p></TableCell>
                        <TableCell className="hidden lg:table-cell">{ETIQUETA_TIPO_SOLICITUD[s.tipo as TipoSolicitud]}</TableCell>
                        <TableCell className="hidden lg:table-cell">{(s.pacienteId && nombrePac.get(s.pacienteId)) || "—"}</TableCell>
                        <TableCell className="hidden lg:table-cell"><Badge variant="secondary">{ETIQUETA_ESTADO_SOLICITUD[s.estado as EstadoSolicitud]}</Badge></TableCell>
                        <TableCell className={`hidden lg:table-cell ${abierta && dias < 0 ? "font-medium text-destructive" : ""}`}>{abierta ? (dias < 0 ? `Vencida hace ${-dias} d` : `${dias} d`) : s.resueltaEn ? fmt(s.resueltaEn) : "—"}</TableCell>
                        <TableCell className="whitespace-normal pr-4 md:pr-6"><AvanzarSolicitud id={s.id} estado={s.estado} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>
        {esAdmin && (
          <TabsContent value="bitacora" className="space-y-4">
            <form className="flex flex-wrap items-end gap-2" method="get">
              <label className="grid gap-1 text-sm">Tipo (prefijo)<Input name="tipo" defaultValue={q.tipo} placeholder="acceso." className="w-40" /></label>
              <label className="grid gap-1 text-sm">Desde<Input name="desde" type="date" defaultValue={q.desde} /></label>
              <label className="grid gap-1 text-sm">Hasta<Input name="hasta" type="date" defaultValue={q.hasta} /></label>
              <Button type="submit" variant="outline">Filtrar</Button>
            </form>
            <Card className="py-0"><CardContent className="px-0">
              <Table>
                <TableHeader><TableRow><TableHead className="pl-4 md:pl-6">Fecha</TableHead><TableHead>Evento</TableHead><TableHead className="hidden lg:table-cell">Usuario</TableHead><TableHead className="pr-4 md:pr-6">Paciente</TableHead></TableRow></TableHeader>
                <TableBody>
                  {bitacora.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="pl-4 md:pl-6">{fmt(e.creadoEn)}</TableCell><TableCell className="font-mono text-xs">{e.tipo}</TableCell>
                      <TableCell className="hidden lg:table-cell">{(e.actorId && nombre.get(e.actorId)) || "Sistema"}</TableCell><TableCell className="pr-4 md:pr-6">{(e.pacienteId && nombre.get(e.pacienteId)) || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
            <p className="text-xs text-muted-foreground">Registro de solo lectura: no existe ninguna operación para modificar o borrar eventos. Últimos 100 resultados.</p>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
