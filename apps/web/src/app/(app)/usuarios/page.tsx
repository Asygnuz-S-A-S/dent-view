import { prisma } from "@dent-view/db";
import { Users } from "lucide-react";
import { ROLES_USUARIO } from "@/components/usuarios/roles";
import { AgregarUsuario } from "@/components/usuarios/agregar-usuario";
import { AccionesUsuario } from "@/components/usuarios/acciones-usuario";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ADMIN } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";
import { fechaCorta } from "@/lib/fechas";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";

export const dynamic = "force-dynamic";

export default async function Usuarios() {
  const ctx = await exigirContexto(ADMIN);
  const miembros = await prisma.member.findMany({
    where: { organizationId: ctx.organizationId, role: { not: "doctor_remitente" } },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Usuarios del centro"
        descripcion="Personal con acceso. Los doctores remitentes se gestionan en Doctores remitentes."
        acciones={<AgregarUsuario />}
      />

      <Card className="py-0">
        <CardContent className="px-0">
          {miembros.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
              <Users className="size-6" /> No hay usuarios todavía.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 md:pl-6">Nombre</TableHead>
                  <TableHead className="hidden lg:table-cell">Correo</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead className="hidden lg:table-cell">Desde</TableHead>
                  <TableHead className="pr-4 md:pr-6 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {miembros.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="max-w-[12rem] whitespace-normal pl-4 md:pl-6 font-medium">
                      {m.user.name}
                      {m.userId === ctx.usuario.id && <span className="ml-2 text-xs text-muted-foreground">(tú)</span>}
                      <span className="block truncate text-xs font-normal text-muted-foreground lg:hidden">{m.user.email}</span>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">{m.user.email}</TableCell>
                    <TableCell><Badge variant="secondary">{ROLES_USUARIO.find((r) => r.valor === m.role)?.etiqueta ?? m.role}</Badge></TableCell>
                    <TableCell className="hidden lg:table-cell">{fechaCorta(m.createdAt)}</TableCell>
                    <TableCell className="pr-4 md:pr-6">
                      <div className="flex justify-end">
                        {m.userId !== ctx.usuario.id && (
                          <AccionesUsuario memberId={m.id} nombre={m.user.name} rol={m.role} />
                        )}
                      </div>
                    </TableCell>
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
