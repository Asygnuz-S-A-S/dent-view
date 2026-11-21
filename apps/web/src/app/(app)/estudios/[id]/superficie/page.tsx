import { prisma } from "@dent-view/db";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Malla3D } from "@/components/Malla3D";
import { Button } from "@/components/ui/button";
import { puedeVerEstudio } from "@/lib/acceso";
import { exigirContexto } from "@/lib/sesion";

export const dynamic = "force-dynamic";

export default async function Superficie({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirContexto();
  const { id } = await params;
  const estudio = await prisma.estudio.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: { paciente: { include: { persona: true } } },
  });
  if (!estudio?.superficieKey || !puedeVerEstudio(ctx.usuario.id, ctx.rol, estudio)) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Escaneo facial</h1>
          <p className="text-sm capitalize text-muted-foreground">
            {estudio.paciente?.nombre.toLowerCase() ?? "Paciente sin asignar"} · arrastra para girar, rueda para acercar
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/estudios"><ArrowLeft /> Volver a estudios</Link>
        </Button>
      </div>
      <Malla3D src={`/api/estudios/${id}/superficie`} />
    </div>
  );
}
