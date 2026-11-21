import { numeroOrden } from "@/lib/ordenes";
import { prisma } from "@dent-view/db";
import { Eye } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { QuitarDoctor } from "@/components/doctores/quitar-doctor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GESTION } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";
import { fechaCorta } from "@/lib/fechas";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { EstadoVacio } from "@/components/comunes/estado-vacio";

export const dynamic = "force-dynamic";

const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const fecha = (d: Date | null) => fechaCorta(d);

export default async function DetalleDoctor({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirContexto(GESTION);
  const { id } = await params;
  const org = ctx.organizationId;
  const miembro = await prisma.member.findFirst({
    where: { organizationId: org, userId: id, role: "doctor_remitente" },
    include: { user: { include: { perfilDoctor: true } } },
  });
  if (!miembro) notFound();

  const donde = { organizationId: org, doctorRemitenteId: id };
  const [ordenes, estudios] = await Promise.all([
    prisma.orden.findMany({ where: donde, orderBy: { numero: "desc" }, include: { paciente: { include: { persona: true } }, items: true } }),
    prisma.estudio.findMany({ where: donde, orderBy: [{ fechaEstudio: "desc" }, { creadoEn: "desc" }], include: { paciente: { include: { persona: true } } } }),
  ]);
  const ultima = [ordenes[0]?.creadoEn, ...estudios.map((e) => e.creadoEn)].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const { user } = miembro;
  const pf = user.perfilDoctor;
  const kpis = [["Órdenes", ordenes.length], ["Estudios", estudios.length], ["Última remisión", fecha(ultima)]];

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo={user.name}
        descripcion={user.email}
        acciones={<QuitarDoctor userId={id} nombre={user.name} />}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {kpis.map(([k, v]) => (
          <Card key={k}><CardHeader><CardTitle className="text-sm font-normal text-muted-foreground">{k}</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{v}</CardContent></Card>
        ))}
      </div>

      <Card>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {[["Tarjeta profesional", pf?.tarjetaProfesional], ["Especialidad", pf?.especialidad], ["Teléfono", pf?.telefono], ["Consultorio", pf?.consultorio]].map(([k, v]) => (
              <div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="font-medium">{v || "—"}</dd></div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Órdenes</h2>
        <Card className="py-0"><CardContent className="px-0">
          {ordenes.length === 0 ? <EstadoVacio titulo="Sin órdenes en este centro" /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead className="pl-6">Orden</TableHead><TableHead>Paciente</TableHead><TableHead>Fecha</TableHead><TableHead>Estado</TableHead><TableHead className="pr-6 text-right">Total</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {ordenes.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="pl-6 font-medium"><Link className="underline-offset-4 hover:underline" href={`/ordenes/${o.id}`}>{numeroOrden(o.numero)}</Link></TableCell>
                    <TableCell>{o.paciente.nombre}</TableCell>
                    <TableCell>{fecha(o.creadoEn)}</TableCell>
                    <TableCell><Badge variant="secondary">{o.estado.charAt(0) + o.estado.slice(1).toLowerCase()}</Badge></TableCell>
                    <TableCell className="pr-6 text-right">{cop.format(o.items.reduce((s, i) => s + i.precio - i.descuento, 0))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent></Card>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Estudios</h2>
        <Card className="py-0"><CardContent className="px-0">
          {estudios.length === 0 ? <EstadoVacio titulo="Sin estudios en este centro" /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead className="pl-6">Paciente</TableHead><TableHead>Fecha</TableHead><TableHead>Modalidad</TableHead><TableHead className="pr-6 text-right">Visor</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {estudios.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="pl-6">{e.paciente?.nombre ?? "Sin paciente"}</TableCell>
                    <TableCell>{fecha(e.fechaEstudio ?? e.creadoEn)}</TableCell>
                    <TableCell><Badge variant="outline">{e.modalidad ?? "—"}</Badge></TableCell>
                    <TableCell className="pr-6 text-right">
                      <Button asChild size="sm"><a href={`/visor/viewer?StudyInstanceUIDs=${encodeURIComponent(e.studyInstanceUid)}`}><Eye /> Abrir visor</a></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent></Card>
      </section>
    </div>
  );
}
