// Adaptado de OpenDentist (MIT, © 2026 Clawnify) — https://github.com/clawnify/OpenDentist
import { prisma, type Prisma } from "@dent-view/db";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { CasoDialog } from "@/components/laboratorio/caso-dialog";
import { TablaCasos } from "@/components/laboratorio/tabla-casos";
import { ESTADOS_LAB, ETIQUETA_LAB } from "@/lib/laboratorio";
import { CLINICOS, GESTION } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { Paginacion } from "@/components/comunes/paginacion";
import { calcularPagina } from "@/lib/paginacion";

export const dynamic = "force-dynamic";

export default async function Laboratorio({ searchParams }: { searchParams: Promise<{ estado?: string; pagina?: string }> }) {
  const ctx = await exigirContexto(CLINICOS);
  const { estado, pagina } = await searchParams;
  const estadoValido = ESTADOS_LAB.find((e) => e === estado);
  const gestionar = (GESTION as readonly string[]).includes(ctx.rol);
  const where: Prisma.CasoLaboratorioWhereInput = { organizationId: ctx.organizationId, ...(estadoValido && { estado: estadoValido }) };

  const total = await prisma.casoLaboratorio.count({ where });
  const pg = calcularPagina(pagina, total);
  const [casos, pacientes, ordenes] = await Promise.all([
    prisma.casoLaboratorio.findMany({ where, include: { paciente: { include: { persona: true } } }, orderBy: { creadoEn: "desc" }, skip: pg.skip, take: pg.take }),
    gestionar ? prisma.pacienteTenant.findMany({ where: { organizationId: ctx.organizationId }, include: { persona: true }, orderBy: { nombre: "asc" } }) : [],
    gestionar ? prisma.orden.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, pacienteId: true, numero: true }, orderBy: { numero: "desc" } }) : [],
  ]);
  const opciones = pacientes.map((p) => ({ id: p.id, nombre: p.nombre, documento: p.persona.numeroDocumento }));
  const enlace = (e?: string) => (e ? `/laboratorio?estado=${e}` : "/laboratorio");

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Laboratorio"
        descripcion="Modelos impresos, guías quirúrgicas y otros trabajos enviados a laboratorio."
        acciones={gestionar && <CasoDialog pacientes={opciones} ordenes={ordenes} />}
      />
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant={estadoValido ? "outline" : "default"}><Link href={enlace()}>Todos</Link></Button>
        {ESTADOS_LAB.map((e) => (
          <Button key={e} asChild size="sm" variant={estadoValido === e ? "default" : "outline"}><Link href={enlace(e)}>{ETIQUETA_LAB[e]}</Link></Button>
        ))}
      </div>
      <TablaCasos
        gestionar={gestionar} pacientes={opciones} ordenes={ordenes}
        casos={casos.map((c) => ({ ...c, paciente: c.paciente.nombre }))}
      />
      <Paginacion ruta="/laboratorio" params={{ estado: estadoValido }} {...pg} total={total} />
    </div>
  );
}
