import { prisma } from "@dent-view/db";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BotonImprimir } from "@/components/pacientes/boton-imprimir";
import { HojaDeVida } from "@/components/pacientes/hoja-de-vida";
import { Button } from "@/components/ui/button";
import { registrarAcceso } from "@/lib/bitacora";
import { fechaHoraCompleta } from "@/lib/fechas";
import { ETIQUETA_TIPO_HOJA, filtrarHoja, leerTiposHoja, TIPOS_HOJA } from "@/lib/pacientes-hoja";
import { cargarHojaDeVida } from "@/lib/pacientes-hoja-datos";
import { CLINICOS } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

export const dynamic = "force-dynamic";

// Al imprimir solo queda la hoja: sin barra lateral ni cabecera de la app.
const CSS_IMPRESION = `@media print{[data-slot="sidebar"],[data-slot="sidebar-gap"],[data-slot="sidebar-container"],header.sticky{display:none!important}[data-slot="sidebar-inset"]{margin:0!important}main{padding:0!important}}`;

export default async function HojaDeVidaPaciente({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tipos?: string }> }) {
  const ctx = await exigirContexto(CLINICOS);
  const { id } = await params;
  const p = await prisma.pacienteTenant.findFirst({ where: { id, organizationId: ctx.organizationId }, include: { persona: true } });
  if (!p) notFound();
  const tipos = leerTiposHoja((await searchParams).tipos);
  const todas = await cargarHojaDeVida(ctx.organizationId, p.id);
  const entradas = filtrarHoja(todas, tipos);
  await registrarAcceso(ctx, p.id, "ficha", { vista: "hoja-de-vida" });
  const enlace = (t: string[]) => `/pacientes/${p.id}/hoja-de-vida${t.length ? `?tipos=${t.join(",")}` : ""}`;

  return (
    <div className="space-y-6">
      <style dangerouslySetInnerHTML={{ __html: CSS_IMPRESION }} />
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button asChild variant="ghost" size="sm"><Link href={`/pacientes/${p.id}`}><ArrowLeft /> Volver a la ficha</Link></Button>
        <BotonImprimir />
      </div>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Hoja de vida: {p.nombre}</h1>
        <p className="text-sm text-muted-foreground">{p.persona.tipoDocumento} {p.persona.numeroDocumento} · generada el {fechaHoraCompleta(new Date())}
          {tipos.length > 0 && ` · filtro: ${tipos.map((t) => ETIQUETA_TIPO_HOJA[t]).join(", ")}`}</p>
        <p className="hidden text-xs text-muted-foreground print:block">Documento con datos personales sensibles (Ley 1581 de 2012): manéjalo con confidencialidad.</p>
      </header>
      <nav aria-label="Filtrar por tipo" className="flex flex-wrap gap-2 print:hidden">
        <Button asChild size="sm" variant={tipos.length ? "outline" : "default"}><Link href={enlace([])}>Todo ({todas.length})</Link></Button>
        {TIPOS_HOJA.map((t) => {
          const activo = tipos.includes(t);
          const nuevos = activo ? tipos.filter((x) => x !== t) : [...tipos, t];
          return <Button key={t} asChild size="sm" variant={activo ? "default" : "outline"}><Link href={enlace(nuevos)} aria-pressed={activo}>{ETIQUETA_TIPO_HOJA[t]} ({todas.filter((x) => x.tipo === t).length})</Link></Button>;
        })}
      </nav>
      <HojaDeVida entradas={entradas} />
    </div>
  );
}
