import { prisma } from "@dent-view/db";
import { Box, Eye, FileText, ScanLine } from "lucide-react";
import Link from "next/link";
import { CrearInformeBoton } from "@/components/informes/crear-informe-boton";
import { AsignarEstudio, PublicarEstudio, VincularOrden } from "@/components/estudios/acciones-estudio";
import { FiltrosEstudios } from "@/components/estudios/filtros-estudios";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { filtroEstudios } from "@/lib/acceso";
import { numeroOrden } from "@/lib/ordenes";
import { CLINICOS, GESTION, MEDICOS } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { EstadoVacio } from "@/components/comunes/estado-vacio";

export const dynamic = "force-dynamic";

const ESTADOS = {
  POR_ASIGNAR: { etiqueta: "Por asignar", variante: "destructive" },
  ASIGNADO: { etiqueta: "Asignado", variante: "secondary" },
  PUBLICADO: { etiqueta: "Publicado", variante: "default" },
} as const;
const fecha = (d: Date | null) => (d ? d.toLocaleDateString("es-CO", { timeZone: "UTC" }) : "—");

export default async function Estudios({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; modalidad?: string }> }) {
  const ctx = await exigirContexto();
  const { tab: tabParam, q = "", modalidad = "" } = await searchParams;
  const tab = tabParam === "por-asignar" ? "por-asignar" : "todos";
  const base = filtroEstudios(ctx.organizationId, ctx.usuario.id, ctx.rol); // siempre acota por centro y rol
  const gestion = (GESTION as readonly string[]).includes(ctx.rol);
  const busqueda = q.trim();
  const [estudios, porAsignar, modalidades, doctores] = await Promise.all([
    prisma.estudio.findMany({
      where: {
        ...base,
        ...(tab === "por-asignar" && { estado: "POR_ASIGNAR" as const }),
        ...(modalidad && { modalidad }),
        ...(busqueda && {
          paciente: {
            OR: [{ nombre: { contains: busqueda, mode: "insensitive" as const } }, { persona: { numeroDocumento: { contains: busqueda } } }],
          },
        }),
      },
      include: { paciente: { include: { persona: true } }, orden: { select: { id: true, numero: true } } },
      orderBy: [{ fechaEstudio: "desc" }, { creadoEn: "desc" }],
    }),
    prisma.estudio.count({ where: { ...base, estado: "POR_ASIGNAR" } }),
    prisma.estudio.findMany({ where: { ...base, modalidad: { not: null } }, select: { modalidad: true }, distinct: ["modalidad"], orderBy: { modalidad: "asc" } }),
    gestion
      ? prisma.member.findMany({ where: { organizationId: ctx.organizationId, role: "doctor_remitente" }, include: { user: true }, orderBy: { user: { name: "asc" } } })
      : [],
  ]);
  // Informes no archivados por estudio (directo o por su orden) para ofrecer "Redactar informe" solo si no existe.
  const informes = estudios.length
    ? await prisma.informe.findMany({
        where: { organizationId: ctx.organizationId, estado: { not: "ARCHIVADO" }, vigente: true, OR: [{ estudioId: { in: estudios.map((e) => e.id) } }, { ordenId: { in: estudios.flatMap((e) => (e.ordenId ? [e.ordenId] : [])) } }] },
        select: { id: true, estudioId: true, ordenId: true, estado: true },
      })
    : [];
  const visibles = ctx.rol === "doctor_remitente" ? informes.filter((i) => i.estado === "EMITIDO" && i.ordenId) : informes; // el doctor solo ve emitidos de sus órdenes
  const clinico = (CLINICOS as readonly string[]).includes(ctx.rol);
  const medico = (MEDICOS as readonly string[]).includes(ctx.rol);
  const doctoresOpciones = doctores.map((d) => ({ id: d.userId, nombre: d.user.name }));

  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo="Estudios" descripcion="Estudios recibidos del equipo y asociados a cada paciente." />

      <FiltrosEstudios
        tab={tab}
        q={busqueda}
        modalidad={modalidad}
        modalidades={modalidades.flatMap((m) => (m.modalidad ? [m.modalidad] : []))}
        porAsignar={porAsignar}
      />

      <Card className="py-0">
        <CardContent className="px-0">
          {estudios.length === 0 ? (
            busqueda || modalidad || tab === "por-asignar" ? (
              <EstadoVacio icono={ScanLine} titulo="Ningún estudio coincide" descripcion="Prueba con otro nombre, documento o modalidad." accion={<Button asChild variant="outline" size="sm"><Link href="/estudios">Quitar filtros</Link></Button>} />
            ) : (
              <EstadoVacio icono={ScanLine} titulo="Aún no hay estudios" descripcion="Los estudios llegan solos desde los equipos del centro y aparecen aquí para asignarlos al paciente." />
            )
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Paciente</TableHead>
                  <TableHead className="hidden lg:table-cell">Documento</TableHead>
                  <TableHead className="hidden lg:table-cell">Fecha</TableHead>
                  <TableHead className="hidden lg:table-cell">Modalidad</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="pr-6 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {estudios.map((e) => {
                  const estado = ESTADOS[e.estado];
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="max-w-[18rem] pl-6">
                        {e.paciente ? <div className="truncate font-medium capitalize">{e.paciente.nombre.toLowerCase()}</div> : <div className="font-medium text-muted-foreground">Sin paciente</div>}
                        {e.descripcion && <div className="truncate text-xs text-muted-foreground">{e.descripcion}</div>}
                        {/* En pantallas angostas los datos secundarios van bajo el paciente. */}
                        <div className="text-xs text-muted-foreground lg:hidden">{[e.modalidad, fecha(e.fechaEstudio)].filter(Boolean).join(" · ")}</div>
                        {e.orden && clinico && <Link href={`/ordenes/${e.orden.id}`} className="text-xs text-muted-foreground underline-offset-4 hover:underline">Orden {numeroOrden(e.orden.numero)}</Link>}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">
                        {e.paciente ? `${e.paciente.persona.tipoDocumento} ${e.paciente.persona.numeroDocumento}` : "—"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">{fecha(e.fechaEstudio)}</TableCell>
                      <TableCell className="hidden lg:table-cell"><Badge variant="outline">{e.modalidad ?? "—"}</Badge></TableCell>
                      <TableCell><Badge variant={estado.variante}>{estado.etiqueta}</Badge></TableCell>
                      <TableCell className="pr-6">
                        <div className="flex flex-wrap justify-end gap-2">
                          {gestion && e.estado !== "PUBLICADO" && <AsignarEstudio estudioId={e.id} doctores={doctoresOpciones} />}
                          {gestion && e.estado === "ASIGNADO" && <PublicarEstudio estudioId={e.id} />}
                          {clinico && e.pacienteId && <VincularOrden estudioId={e.id} pacienteId={e.pacienteId} ordenActualId={e.ordenId} />}
                          {(() => {
                            const inf = visibles.find((i) => i.estudioId === e.id || (i.ordenId && i.ordenId === e.ordenId));
                            if (inf) return <Button asChild size="sm" variant="outline"><Link href={`/informes/${inf.id}`}><FileText /> Ver informe</Link></Button>;
                            return medico && e.estado !== "POR_ASIGNAR" && e.pacienteId ? <CrearInformeBoton estudioId={e.id} variante="outline" etiqueta="Informar este estudio" /> : null;
                          })()}
                          {/* Enlace normal: /visor lo sirve Caddy, no Next */}
                          <Button asChild size="sm">
                            <a href={`/visor/viewer?StudyInstanceUIDs=${encodeURIComponent(e.studyInstanceUid)}`}>
                              <Eye /> Abrir visor
                            </a>
                          </Button>
                          {e.superficieKey && (
                            <Button asChild size="sm" variant="outline">
                              <Link href={`/estudios/${e.id}/superficie`}><Box /> Escaneo facial</Link>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
