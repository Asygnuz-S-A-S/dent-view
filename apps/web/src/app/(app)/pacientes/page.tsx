import { prisma } from "@dent-view/db";
import { Eye, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { PacienteDialog } from "@/components/pacientes/paciente-dialog";
import { FiltrosPacientesForm } from "@/components/pacientes/filtros-pacientes";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { idsPacientesPorNombre } from "@/lib/busqueda";
import { iniciales } from "@/lib/pacientes";
import { construirWhere, consultaFiltros, leerFiltros, ordenarPor } from "@/lib/pacientes-filtro";
import { CLINICOS, GESTION } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";
import { fechaDeEstudio } from "@/lib/fechas";
import { calcularPagina } from "@/lib/paginacion";
import { Paginacion } from "@/components/comunes/paginacion";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";

export const dynamic = "force-dynamic";
const PENDIENTES = ["SOLICITADA", "AGENDADA", "TOMADA"];

export default async function Pacientes({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // El doctor remitente entra solo a sus pacientes (filtro en construirWhere).
  const ctx = await exigirContexto([...CLINICOS, "doctor_remitente"]);
  const esDoctor = ctx.rol === "doctor_remitente";
  const sp = await searchParams;
  const f = leerFiltros(sp);
  const where = construirWhere(ctx.organizationId, { id: ctx.usuario.id, rol: ctx.rol }, f, f.q ? await idsPacientesPorNombre(ctx.organizationId, f.q) : undefined);
  const activos = !!(f.q || f.doctor || f.especialidad || f.pendientes || f.cartera || f.desde || f.hasta || f.orden !== "nombre");

  const total = await prisma.pacienteTenant.count({ where });
  const pg = calcularPagina(sp.pagina, total);
  const [pacientes, miembros] = await Promise.all([
    prisma.pacienteTenant.findMany({
      where,
      include: {
        persona: true,
        estudios: { where: esDoctor ? { doctorRemitenteId: ctx.usuario.id } : {}, orderBy: [{ fechaEstudio: "desc" }, { creadoEn: "desc" }], take: 1 },
        // Doctores que lo remitieron (el doctor remitente solo ve su propia participación).
        ordenes: {
          where: esDoctor ? { doctorRemitenteId: ctx.usuario.id } : {},
          select: { estado: true, doctorRemitente: { select: { id: true, name: true, perfilDoctor: { select: { especialidad: true } } } } },
          orderBy: { numero: "desc" },
          take: 30,
        },
      },
      orderBy: [ordenarPor(f.orden), { id: "asc" }],
      skip: pg.skip,
      take: pg.take,
    }),
    esDoctor ? [] : prisma.member.findMany({ where: { organizationId: ctx.organizationId, role: "doctor_remitente" }, select: { user: { select: { id: true, name: true } } }, orderBy: { user: { name: "asc" } } }),
  ]);
  const doctores = esDoctor ? null : miembros.map((m) => ({ id: m.user.id, nombre: m.user.name }));

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Pacientes"
        descripcion={esDoctor ? "Pacientes que has remitido a este centro." : "Busca y filtra por doctor remitente, especialidad, estudios pendientes, cartera o fecha del último estudio."}
        acciones={(GESTION as readonly string[]).includes(ctx.rol) && <PacienteDialog />}
      />

      <FiltrosPacientesForm f={f} doctores={doctores} activos={activos} />

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {total === 0 ? "Sin resultados" : `${total} ${total === 1 ? "paciente" : "pacientes"}`}
      </p>

      <Card className="py-0">
        <CardContent className="px-0">
          {pacientes.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {activos ? "Ningún paciente coincide con los filtros." : "Aún no hay pacientes registrados. Crea el primero con el botón «Nuevo paciente»."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 md:pl-6">Paciente</TableHead>
                  <TableHead className="hidden lg:table-cell">Documento</TableHead>
                  <TableHead className="hidden lg:table-cell">Doctor(es) remitente(s)</TableHead>
                  <TableHead className="hidden lg:table-cell">Alertas</TableHead>
                  <TableHead className="hidden xl:table-cell">Último estudio</TableHead>
                  <TableHead className="pr-4 text-right md:pr-6">Ver</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pacientes.map((p) => {
                  const ultimo = p.estudios[0];
                                    const docs = [...new Map(p.ordenes.flatMap((o) => (o.doctorRemitente ? [[o.doctorRemitente.id, o.doctorRemitente] as const] : []))).values()];
                  const pendiente = p.ordenes.some((o) => PENDIENTES.includes(o.estado));
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="max-w-[18rem] whitespace-normal pl-4 font-medium md:pl-6">
                        <div className="flex items-center gap-3">
                          <Avatar className="size-9">
                            {p.fotoKey && <AvatarImage src={`/pacientes/${p.id}/foto`} alt="" />}
                            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{iniciales(p.nombre)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <span className="block truncate">{p.nombre}</span>
                            {/* En móvil se pliegan aquí las columnas que se ocultan. */}
                            <span className="block text-xs font-normal text-muted-foreground lg:hidden">{p.persona.tipoDocumento} {p.persona.numeroDocumento}{docs.length ? ` · ${docs.map((d) => d.name).join(", ")}` : ""}</span>
                            {pendiente && <Badge variant="outline" className="mt-1">Estudio pendiente</Badge>}
                            {p.alertas && <Badge variant="destructive" className="mt-1 max-w-full lg:hidden"><TriangleAlert /><span className="truncate">{p.alertas}</span></Badge>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">{p.persona.tipoDocumento} {p.persona.numeroDocumento}</TableCell>
                      <TableCell className="hidden max-w-[16rem] whitespace-normal lg:table-cell">
                        {docs.length ? (
                          <ul className="space-y-0.5 text-sm">
                            {docs.map((d) => <li key={d.id}>{d.name}{d.perfilDoctor?.especialidad && <span className="text-xs text-muted-foreground"> · {d.perfilDoctor.especialidad}</span>}</li>)}
                          </ul>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="hidden max-w-[14rem] lg:table-cell">{p.alertas ? <Badge variant="destructive" className="max-w-full"><TriangleAlert /><span className="truncate">{p.alertas}</span></Badge> : "—"}</TableCell>
                      <TableCell className="hidden xl:table-cell">{ultimo ? fechaDeEstudio(ultimo) : "—"}</TableCell>
                      <TableCell className="pr-4 text-right md:pr-6">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/pacientes/${p.id}`} aria-label={`Ver ficha de ${p.nombre}`}><Eye /> Ver</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Paginacion ruta="/pacientes" params={Object.fromEntries(new URLSearchParams(consultaFiltros(f)))} {...pg} total={total} />
    </div>
  );
}
