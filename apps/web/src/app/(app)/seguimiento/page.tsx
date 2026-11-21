// Implementación independiente (sala limpia) a partir de docs/sala-limpia/03-recordatorios-y-seguimiento.md
import { prisma } from "@dent-view/db";
import { AccionesSeguimiento, NuevoSeguimiento } from "@/components/seguimiento/seguimiento-ui";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hoyBogota } from "@/lib/agenda";
import { CLINICOS } from "@/lib/roles";
import { ESTADOS_ACTIVOS, ETIQUETA_ESTADO_SEG, ETIQUETA_MOTIVO, mesTexto, ordenarLista, primerDiaMes, tasaConversion, type EstadoSeg, type Motivo } from "@/lib/seguimiento";
import { exigirContexto } from "@/lib/sesion";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { EstadoVacio } from "@/components/comunes/estado-vacio";

export const dynamic = "force-dynamic";

export default async function Seguimiento() {
  const ctx = await exigirContexto(CLINICOS);
  const org = ctx.organizationId;
  const hoy = hoyBogota();
  const mesActual = primerDiaMes(hoy);
  const sigMes = new Date(Date.UTC(mesActual.getUTCFullYear(), mesActual.getUTCMonth() + 1, 1));

  const [activos, noContactar, completados, cancelados, pacientes] = await Promise.all([
    prisma.seguimiento.findMany({ where: { organizationId: org, estado: { in: ESTADOS_ACTIVOS } } }),
    prisma.preferenciaContacto.findMany({ where: { organizationId: org, noContactar: true }, select: { pacienteId: true } }),
    prisma.seguimiento.count({ where: { organizationId: org, estado: "COMPLETADO", completadoEn: { gte: mesActual, lt: sigMes } } }),
    prisma.seguimiento.count({ where: { organizationId: org, estado: "CANCELADO", creadoEn: { gte: mesActual, lt: sigMes } } }),
    prisma.pacienteTenant.findMany({ where: { organizationId: org }, include: { persona: true }, orderBy: { creadoEn: "desc" }, take: 300 }),
  ]);
  const excluidos = new Set(noContactar.map((n) => n.pacienteId));
  const lista = ordenarLista(activos.filter((s) => !excluidos.has(s.pacienteId)));
  const revision = activos.filter((s) => excluidos.has(s.pacienteId));
  const personas = new Map((await prisma.pacienteTenant.findMany({ where: { id: { in: activos.map((s) => s.pacienteId) } }, select: { id: true, nombre: true, celular: true } })).map((p) => [p.id, p]));
  const vencidos = lista.filter((s) => s.mesObjetivo < mesActual).length;
  const agendados = lista.filter((s) => s.estado === "AGENDADO").length;

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Seguimiento de pacientes"
        descripcion={<>Controles, entregas pendientes y estudios sin tomar. Mes actual: {mesTexto(mesActual)}.</>}
        acciones={<NuevoSeguimiento pacientes={pacientes.map((p) => ({ id: p.id, nombre: p.nombre }))} mesActual={hoy.slice(0, 7)} />}
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[["Activos", lista.length], ["Vencidos", vencidos], ["Agendados", agendados], ["Conversión del mes", `${Math.round(tasaConversion(completados, cancelados) * 100)} %`]].map(([k, v]) => (
          <Card key={k}><CardContent><p className="text-sm text-muted-foreground">{k}</p><p className="text-2xl font-semibold">{v}</p></CardContent></Card>
        ))}
      </div>

      <Card className="py-0"><CardContent className="px-0">
        {lista.length === 0 ? <EstadoVacio titulo="No hay seguimientos activos" descripcion="Crea uno con «Nuevo seguimiento» para recordar controles y entregas pendientes." /> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead className="pl-4 md:pl-6">Paciente</TableHead><TableHead className="hidden lg:table-cell">Motivo</TableHead><TableHead className="hidden lg:table-cell">Mes</TableHead><TableHead className="hidden lg:table-cell">Estado</TableHead><TableHead className="hidden lg:table-cell">Intentos</TableHead><TableHead className="pr-4 md:pr-6 text-right">Acciones</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {lista.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="max-w-[12rem] whitespace-normal pl-4 md:pl-6 font-medium">{personas.get(s.pacienteId)?.nombre}{s.prioridad === "ALTA" && <Badge className="ml-2" variant="danger">Alta</Badge>}
                    <span className="block text-xs font-normal text-muted-foreground lg:hidden">{ETIQUETA_MOTIVO[s.motivo as Motivo]} · {ETIQUETA_ESTADO_SEG[s.estado as EstadoSeg]}</span>
                    <span className={`block text-xs font-normal lg:hidden ${s.mesObjetivo < mesActual ? "text-destructive" : "text-muted-foreground"}`}>{mesTexto(s.mesObjetivo)}</span></TableCell>
                  <TableCell className="hidden lg:table-cell">{ETIQUETA_MOTIVO[s.motivo as Motivo]}</TableCell>
                  <TableCell className={`hidden lg:table-cell ${s.mesObjetivo < mesActual ? "font-medium text-destructive" : ""}`}>{mesTexto(s.mesObjetivo)}</TableCell>
                  <TableCell className="hidden lg:table-cell"><Badge variant="info">{ETIQUETA_ESTADO_SEG[s.estado as EstadoSeg]}</Badge></TableCell>
                  <TableCell className="hidden lg:table-cell">{s.intentos}</TableCell>
                  <TableCell className="whitespace-normal pr-4 md:pr-6"><AccionesSeguimiento id={s.id} telefono={personas.get(s.pacienteId)?.celular ?? null} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>

      {revision.length > 0 && (
        <p className="text-sm text-muted-foreground">{revision.length} seguimiento(s) de pacientes marcados como «no contactar» requieren revisión y no aparecen en la lista.</p>
      )}
    </div>
  );
}
