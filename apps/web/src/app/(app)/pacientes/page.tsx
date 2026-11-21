import { prisma } from "@dent-view/db";
import { Eye, Search, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { PacienteDialog } from "@/components/pacientes/paciente-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { normalizarDocumento } from "@/lib/pacientes";
import { CLINICOS, GESTION } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";
import { fechaCorta } from "@/lib/fechas";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";

export const dynamic = "force-dynamic";

export default async function Pacientes({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await exigirContexto(CLINICOS);
  const q = ((await searchParams).q ?? "").trim();
  const doc = normalizarDocumento(q);
  const pacientes = await prisma.pacienteTenant.findMany({
    where: {
      organizationId: ctx.organizationId,
      ...(q && {
        OR: [
          { nombre: { contains: q, mode: "insensitive" } },
          ...(doc ? [{ persona: { numeroDocumento: { contains: doc } } }] : []),
        ],
      }),
    },
    include: {
      persona: true,
      estudios: { orderBy: [{ fechaEstudio: "desc" }, { creadoEn: "desc" }], take: 1 },
    },
    orderBy: { nombre: "asc" },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Pacientes"
        descripcion="Busca por nombre o número de documento (máximo 50 resultados)."
        acciones={(GESTION as readonly string[]).includes(ctx.rol) && <PacienteDialog />}
      />

      <form className="flex max-w-md gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder="Nombre o documento" aria-label="Buscar paciente" />
        <Button type="submit" variant="secondary"><Search /> Buscar</Button>
      </form>

      <Card className="py-0">
        <CardContent className="px-0">
          {pacientes.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {q ? "Ningún paciente coincide con la búsqueda." : "Aún no hay pacientes registrados. Crea el primero con el botón «Nuevo paciente»."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 md:pl-6">Paciente</TableHead>
                  <TableHead className="hidden lg:table-cell">Documento</TableHead>
                  <TableHead className="hidden lg:table-cell">Celular</TableHead>
                  <TableHead className="hidden lg:table-cell">Alertas</TableHead>
                  <TableHead className="hidden xl:table-cell">Último estudio</TableHead>
                  <TableHead className="pr-4 text-right md:pr-6">Ver</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pacientes.map((p) => {
                  const ultimo = p.estudios[0];
                  const fecha = ultimo && (ultimo.fechaEstudio ?? ultimo.creadoEn);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="max-w-[16rem] whitespace-normal pl-4 font-medium md:pl-6">
                        <span className="block truncate">{p.nombre}</span>
                        {/* En móvil se pliegan aquí las columnas que se ocultan. */}
                        <span className="block text-xs font-normal text-muted-foreground lg:hidden">{p.persona.tipoDocumento} {p.persona.numeroDocumento}{p.celular ? ` · ${p.celular}` : ""}</span>
                        {p.alertas && <Badge variant="destructive" className="mt-1 max-w-full lg:hidden"><TriangleAlert /><span className="truncate">{p.alertas}</span></Badge>}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">{p.persona.tipoDocumento} {p.persona.numeroDocumento}</TableCell>
                      <TableCell className="hidden lg:table-cell">{p.celular ?? "—"}</TableCell>
                      <TableCell className="hidden max-w-[14rem] lg:table-cell">{p.alertas ? <Badge variant="destructive" className="max-w-full"><TriangleAlert /><span className="truncate">{p.alertas}</span></Badge> : "—"}</TableCell>
                      <TableCell className="hidden xl:table-cell">{fecha ? fechaCorta(fecha) : "—"}</TableCell>
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
    </div>
  );
}
