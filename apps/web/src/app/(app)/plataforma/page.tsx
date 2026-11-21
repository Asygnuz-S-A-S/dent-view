import { prisma } from "@dent-view/db";
import { Building2 } from "lucide-react";
import { EntrarCentro } from "@/components/plataforma/entrar-centro";
import { NuevoCentro } from "@/components/plataforma/nuevo-centro";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { diaBogota, inicioDiaBogota } from "@/lib/inicio";
import { exigirSuperadmin } from "@/lib/sesion";
import { fechaCorta } from "@/lib/fechas";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";

export const dynamic = "force-dynamic";

export default async function Plataforma() {
  await exigirSuperadmin();
  const inicioMes = inicioDiaBogota(`${diaBogota(new Date()).slice(0, 7)}-01`);
  const [centros, delMes] = await Promise.all([
    prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { members: true, pacientes: true } } },
    }),
    prisma.estudio.groupBy({ by: ["organizationId"], where: { creadoEn: { gte: inicioMes } }, _count: true }),
  ]);
  const estudiosMes = new Map(delMes.map((g) => [g.organizationId, g._count]));

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Plataforma"
        descripcion="Centros de imágenes registrados en dent-view."
        acciones={<NuevoCentro />}
      />

      <Card className="py-0">
        <CardContent className="px-0">
          {centros.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
              <Building2 className="size-6" />
              Aún no hay centros. Crea el primero con “Nuevo centro”.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 md:pl-6">Centro</TableHead>
                  <TableHead className="text-right">Miembros</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Pacientes</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Estudios del mes</TableHead>
                  <TableHead className="hidden lg:table-cell">Creado</TableHead>
                  <TableHead className="pr-4 md:pr-6 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {centros.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="pl-4 md:pl-6">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.slug}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c._count.members}</TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">{c._count.pacientes}</TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">{estudiosMes.get(c.id) ?? 0}</TableCell>
                    <TableCell className="hidden lg:table-cell">{fechaCorta(c.createdAt)}</TableCell>
                    <TableCell className="pr-4 md:pr-6 text-right"><EntrarCentro organizationId={c.id} nombre={c.name} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
