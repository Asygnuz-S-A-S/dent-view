import { prisma } from "@dent-view/db";
import { Eye, ScanLine } from "lucide-react";
import Link from "next/link";
import { MenuAccionesEstudio } from "@/components/estudios/menu-acciones";
import { FiltrosEstudios } from "@/components/estudios/filtros-estudios";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { filtroEstudios, puedeDescargarEstudio } from "@/lib/acceso";
import { filtroListadoEstudios, type ParamsEstudios } from "@/lib/acceso-estudios";
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

export default async function Estudios({ searchParams }: { searchParams: Promise<ParamsEstudios> }) {
  const ctx = await exigirContexto();
  const params = await searchParams;
  const { tab: tabParam, q = "", modalidad = "", estado = "", doctor = "", desde = "", hasta = "" } = params;
  const tab = tabParam === "por-asignar" ? "por-asignar" : "todos";
  const propios = filtroEstudios(ctx.organizationId, ctx.usuario.id, ctx.rol); // siempre acota por centro y rol
  // Notificación en la app: el doctor remitente ve también los estudios que el centro le compartió (enlace DOCTOR activo a su correo).
  const compartidos = ctx.rol === "doctor_remitente"
    ? (await prisma.enlaceEntrega.findMany({
        where: { organizationId: ctx.organizationId, destinatarioTipo: "DOCTOR", revocadoEn: null, venceEn: { gt: new Date() }, destinatarioCorreo: { equals: ctx.usuario.email, mode: "insensitive" } },
        select: { estudioUids: true },
      })).flatMap((e) => e.estudioUids)
    : [];
  const base = compartidos.length
    ? { organizationId: ctx.organizationId, OR: [{ doctorRemitenteId: ctx.usuario.id }, { studyInstanceUid: { in: compartidos }, pacienteId: { not: null } }] }
    : propios;
  const gestion = (GESTION as readonly string[]).includes(ctx.rol);
  const busqueda = q.trim();
  const esDoctor = ctx.rol === "doctor_remitente";
  const clinico = (CLINICOS as readonly string[]).includes(ctx.rol);
  const [estudios, porAsignar, modalidades, doctores] = await Promise.all([
    prisma.estudio.findMany({
      where: filtroListadoEstudios(base, params),
      include: { paciente: { include: { persona: true } }, orden: { select: { id: true, numero: true } } },
      orderBy: [{ fechaEstudio: "desc" }, { creadoEn: "desc" }],
    }),
    prisma.estudio.count({ where: { ...base, estado: "POR_ASIGNAR" } }),
    prisma.estudio.findMany({ where: { ...base, modalidad: { not: null } }, select: { modalidad: true }, distinct: ["modalidad"], orderBy: { modalidad: "asc" } }),
    clinico
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
        estado={estado}
        doctor={doctor}
        desde={desde}
        hasta={hasta}
        doctores={esDoctor ? null : doctoresOpciones}
      />

      <Card className="py-0">
        <CardContent className="px-0">
          {estudios.length === 0 ? (
            busqueda || modalidad || estado || doctor || desde || hasta || tab === "por-asignar" ? (
              <EstadoVacio icono={ScanLine} titulo="Ningún estudio coincide" descripcion="Prueba con otros filtros." accion={<Button asChild variant="outline" size="sm"><Link href="/estudios">Quitar filtros</Link></Button>} />
            ) : (
              <EstadoVacio icono={ScanLine} titulo="Aún no hay estudios" descripcion="Los estudios llegan solos desde los equipos del centro y aparecen aquí para asignarlos al paciente." />
            )
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 sm:pl-6">Paciente</TableHead>
                  <TableHead className="hidden lg:table-cell">Documento</TableHead>
                  <TableHead className="hidden lg:table-cell">Fecha</TableHead>
                  <TableHead className="hidden lg:table-cell">Modalidad</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="pr-4 text-right sm:pr-6">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {estudios.map((e) => {
                  const est = ESTADOS[e.estado];
                  const inf = visibles.find((i) => i.estudioId === e.id || (i.ordenId && i.ordenId === e.ordenId));
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="max-w-[9rem] pl-4 sm:max-w-[18rem] sm:pl-6">
                        {e.paciente ? <div className="truncate font-medium capitalize">{e.paciente.nombre.toLowerCase()}</div> : <div className="font-medium text-muted-foreground">Sin paciente</div>}
                        {compartidos.includes(e.studyInstanceUid) && e.doctorRemitenteId !== ctx.usuario.id && <Badge variant="secondary" className="mb-0.5">Compartido contigo</Badge>}
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
                      <TableCell><Badge variant={est.variante}>{est.etiqueta}</Badge></TableCell>
                      <TableCell className="pr-4 sm:pr-6">
                        <div className="flex items-center justify-end gap-2">
                          {/* Pestaña nueva: la cookie de sesión viaja igual y Caddy autoriza cada petición del visor. /visor lo sirve Caddy, no Next. */}
                          <Button asChild size="sm">
                            <a href={`/visor/viewer?StudyInstanceUIDs=${encodeURIComponent(e.studyInstanceUid)}`} target="_blank" rel="noopener"><Eye /> Abrir visor</a>
                          </Button>
                          <MenuAccionesEstudio
                            estudioId={e.id} estado={e.estado} pacienteId={e.pacienteId} ordenId={e.ordenId} superficie={!!e.superficieKey}
                            informeId={inf?.id ?? null} informeEmitido={inf?.estado === "EMITIDO"}
                            gestion={gestion} clinico={clinico} puedeInformar={medico && e.estado !== "POR_ASIGNAR" && !!e.pacienteId}
                            puedeDescargar={puedeDescargarEstudio(ctx.usuario.id, ctx.rol, e)}
                            doctores={doctoresOpciones} doctoresEnvio={doctoresOpciones}
                          />
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
