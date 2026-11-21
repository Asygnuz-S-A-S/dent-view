import { prisma } from "@dent-view/db";
import { KeyRound } from "lucide-react";
import { EstadoVacio } from "@/components/comunes/estado-vacio";
import { CrearToken } from "@/components/integraciones/api/crear-token";
import { DocumentacionApi } from "@/components/integraciones/api/documentacion-api";
import { RevocarToken } from "@/components/integraciones/api/revocar-token";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { estadoToken } from "@/lib/api-token";
import { fechaCorta, fechaHoraCompleta } from "@/lib/fechas";
import { ADMIN } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

export const dynamic = "force-dynamic";

const VARIANTE = { ACTIVO: "success", VENCIDO: "warning", REVOCADO: "danger" } as const;
const ETIQUETA = { ACTIVO: "Activo", VENCIDO: "Vencido", REVOCADO: "Revocado" } as const;

export default async function Pagina() {
  const ctx = await exigirContexto(ADMIN);
  // Solo los tokens de este centro; el hash nunca sale de la base.
  const tokens = await prisma.tokenApi.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { creadoEn: "desc" }, omit: { tokenHash: true } });
  const ahora = new Date();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-muted-foreground">Los tokens permiten que otros sistemas lean o escriban datos de este centro por la API. Trátalos como contraseñas.</p>
        <CrearToken />
      </div>
      <Card className="py-0">
        <CardContent className="px-0">
          {tokens.length === 0 ? (
            <EstadoVacio icono={KeyRound} titulo="Aún no hay tokens" descripcion="Crea uno para conectar otro sistema con la API." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 md:pl-6">Nombre</TableHead>
                  <TableHead>Permisos</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="hidden lg:table-cell">Último uso</TableHead>
                  <TableHead className="hidden lg:table-cell">Vence</TableHead>
                  <TableHead className="pr-4 text-right md:pr-6">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((t) => {
                  const estado = estadoToken(t, ahora);
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="whitespace-normal pl-4 font-medium md:pl-6">
                        {t.nombre}
                        <code className="block text-xs font-normal text-muted-foreground">{t.prefijo}…</code>
                      </TableCell>
                      <TableCell className="max-w-xs whitespace-normal">
                        <div className="flex flex-wrap gap-1">{t.permisos.map((p) => <Badge key={p} variant="outline" className="font-mono text-[11px]">{p}</Badge>)}</div>
                      </TableCell>
                      <TableCell><Badge variant={VARIANTE[estado]}>{ETIQUETA[estado]}</Badge></TableCell>
                      <TableCell className="hidden lg:table-cell">{t.ultimoUso ? fechaHoraCompleta(t.ultimoUso) : "Nunca"}</TableCell>
                      <TableCell className="hidden lg:table-cell">{t.vence ? fechaCorta(t.vence) : "No vence"}</TableCell>
                      <TableCell className="pr-4 text-right md:pr-6">{estado === "REVOCADO" ? null : <RevocarToken id={t.id} nombre={t.nombre} />}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <DocumentacionApi />
    </div>
  );
}
