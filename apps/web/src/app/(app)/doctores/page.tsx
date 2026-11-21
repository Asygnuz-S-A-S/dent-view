import { prisma } from "@dent-view/db";
import { Eye, Search } from "lucide-react";
import Link from "next/link";
import { DoctorDialog } from "@/components/doctores/doctor-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GESTION } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";
import { estaInactivo, inicioMesBogota } from "./inactividad";
import { fechaCorta } from "@/lib/fechas";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";

export const dynamic = "force-dynamic";

export default async function Doctores({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await exigirContexto(GESTION);
  const q = ((await searchParams).q ?? "").trim();
  const org = ctx.organizationId;
  const miembros = await prisma.member.findMany({
    where: { organizationId: org, role: "doctor_remitente", ...(q && { user: { name: { contains: q, mode: "insensitive" } } }) },
    include: { user: { include: { perfilDoctor: true } } },
    orderBy: { user: { name: "asc" } },
  });

  const ids = miembros.map((m) => m.userId);
  const inicioMes = inicioMesBogota();
  const donde = { organizationId: org, doctorRemitenteId: { in: ids } };
  const [ordenes, estudios, delMes] = await Promise.all([
    prisma.orden.groupBy({ by: ["doctorRemitenteId"], where: donde, _max: { creadoEn: true } }),
    prisma.estudio.groupBy({ by: ["doctorRemitenteId"], where: donde, _count: true, _max: { creadoEn: true } }),
    prisma.orden.groupBy({ by: ["doctorRemitenteId"], where: { ...donde, creadoEn: { gte: inicioMes } }, _count: true }),
  ]);
  const por = <T extends { doctorRemitenteId: string | null }>(xs: T[]) => new Map(xs.map((x) => [x.doctorRemitenteId, x]));
  const [pOrd, pEst, pMes] = [por(ordenes), por(estudios), por(delMes)];

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Doctores remitentes"
        descripcion="Doctores que remiten pacientes a este centro."
        acciones={<DoctorDialog />}
      />

      <form className="flex max-w-md gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder="Nombre del doctor" aria-label="Buscar doctor" />
        <Button type="submit" variant="secondary"><Search /> Buscar</Button>
      </form>

      <Card className="py-0">
        <CardContent className="px-0">
          {miembros.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {q ? "Ningún doctor coincide con la búsqueda." : "Aún no hay doctores remitentes en el centro."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 md:pl-6">Doctor</TableHead>
                  <TableHead className="hidden lg:table-cell">Especialidad</TableHead>
                  <TableHead className="hidden lg:table-cell">Órdenes del mes</TableHead>
                  <TableHead className="hidden lg:table-cell">Estudios</TableHead>
                  <TableHead className="hidden lg:table-cell">Última remisión</TableHead>
                  <TableHead className="pr-4 md:pr-6 text-right">Ver</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {miembros.map((m) => {
                  const fechas = [pOrd.get(m.userId)?._max.creadoEn, pEst.get(m.userId)?._max.creadoEn].filter((d): d is Date => !!d);
                  const ultima = fechas.length ? new Date(Math.max(...fechas.map((d) => d.getTime()))) : null;
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="max-w-[14rem] whitespace-normal pl-4 md:pl-6">
                        <div className="flex items-center gap-2 font-medium">
                          {m.user.name}
                          {estaInactivo(ultima, m.createdAt) && <Badge variant="warning">Inactivo</Badge>}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{m.user.email}</div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">{m.user.perfilDoctor?.especialidad ?? "—"}</TableCell>
                      <TableCell className="hidden lg:table-cell">{pMes.get(m.userId)?._count ?? 0}</TableCell>
                      <TableCell className="hidden lg:table-cell">{pEst.get(m.userId)?._count ?? 0}</TableCell>
                      <TableCell className="hidden lg:table-cell">{ultima ? fechaCorta(ultima) : "—"}</TableCell>
                      <TableCell className="pr-4 md:pr-6 text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/doctores/${m.userId}`} aria-label={`Ver a ${m.user.name}`}><Eye /> Ver</Link>
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
    </div>
  );
}
