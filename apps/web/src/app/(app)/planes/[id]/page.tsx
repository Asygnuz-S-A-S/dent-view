import { prisma } from "@dent-view/db";
import { ClipboardPlus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { Kpi } from "@/components/comunes/kpi";
import { CancelarPlan, FormularioAnticipo } from "@/components/planes/acciones-plan";
import { BadgeItemPlan, BadgePlan } from "@/components/planes/badge-plan";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { numeroOrden } from "@/lib/ordenes";
import { puedeCancelarPlan, resumenPlan, type EstadoItemPlan, type EstadoPlan } from "@/lib/planes";
import { anticiposDelPlan, contextoPlanes, planDelCentro } from "@/lib/planes-servidor";
import { cop } from "@/lib/precios";
import { numeroPresupuesto } from "@/lib/presupuestos";
import { GESTION } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function FichaPlan({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoPlanes();
  const { id } = await params;
  const org = ctx.organizationId;
  const plan = await planDelCentro(org, id);
  if (!plan) notFound();
  const [items, anticipos, paciente, presupuesto] = await Promise.all([
    prisma.planItem.findMany({ where: { planId: id, organizationId: org }, orderBy: [{ fase: "asc" }, { posicion: "asc" }], include: { ordenItems: { select: { orden: { select: { id: true, numero: true, estado: true } } }, orderBy: { id: "desc" } } } }),
    anticiposDelPlan(org, id),
    prisma.pacienteTenant.findFirst({ where: { id: plan.pacienteId, organizationId: org }, select: { id: true, nombre: true } }),
    plan.presupuestoId ? prisma.presupuesto.findFirst({ where: { id: plan.presupuestoId, organizationId: org }, select: { id: true, numero: true } }) : null,
  ]);
  const estados = items as { precio: number; estado: EstadoItemPlan }[];
  const r = resumenPlan(estados, anticipos);
  const fases = [...new Set(items.map((i) => i.fase))];
  const estado = plan.estado as EstadoPlan;
  const puedeAnticipo = estado === "ACTIVO" && (GESTION as readonly string[]).includes(ctx.rol);
  // La orden vigente del ítem: la última que no está cancelada.
  const ordenDe = (i: (typeof items)[number]) => i.ordenItems.map((o) => o.orden).find((o) => o.estado !== "CANCELADA");

  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo={plan.titulo ?? "Plan de tratamiento"} insignia={<BadgePlan estado={estado} />}
        acciones={<>
          {estado === "ACTIVO" && r.pendiente > 0 && <Button asChild><Link href={`/ordenes/nueva?paciente=${plan.pacienteId}&plan=${plan.id}`}><ClipboardPlus /> Crear orden con ítems pendientes</Link></Button>}
          {puedeCancelarPlan(estado, estados) && <CancelarPlan planId={plan.id} />}
        </>}>
        <p className="text-sm text-muted-foreground">
          Para <Link className="underline" href={`/pacientes/${plan.pacienteId}`}>{paciente?.nombre}</Link>
          {presupuesto && <> · desde la <Link className="underline" href={`/presupuestos/${presupuesto.id}`}>cotización {numeroPresupuesto(presupuesto.numero)}</Link></>}
        </p>
      </EncabezadoPagina>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi titulo="Total del plan" valor={cop(r.total)} nota="Precios congelados" />
        <Kpi titulo="Avance" valor={<span data-testid="plan-avance">{r.avancePct} %</span>} nota={`${cop(r.realizado)} realizado`} />
        <Kpi titulo="Saldo por ejecutar" valor={<span data-testid="plan-saldo">{cop(r.saldo)}</span>} nota={r.enOrden > 0 ? `${cop(r.enOrden)} en órdenes abiertas` : undefined} />
        <Kpi titulo="Anticipo disponible" valor={<span data-testid="plan-anticipo">{cop(r.anticipoDisponible)}</span>} nota={r.anticipoTotal > 0 ? `${cop(r.anticipoTotal)} registrado · saldo por pagar ${cop(r.saldoPorPagar)}` : "Sin anticipo registrado"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader><CardTitle>Ítems por fase</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Avance del plan" aria-valuemin={0} aria-valuemax={100} aria-valuenow={r.avancePct}>
              <div className="h-full bg-primary" style={{ width: `${r.avancePct}%` }} />
            </div>
            {fases.map((fase) => (
              <section key={fase} aria-label={`Fase ${fase}`} className="space-y-2">
                {fases.length > 1 && <h2 className="text-sm font-semibold">Fase {fase}</h2>}
                <ul className="divide-y rounded-md border">
                  {items.filter((i) => i.fase === fase).map((i) => {
                    const o = ordenDe(i);
                    return (
                      <li key={i.id} data-testid="plan-item" className="flex items-start justify-between gap-3 p-3 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium break-words">{i.descripcion}{i.diente ? ` · diente ${i.diente}` : ""}</p>
                          <p className="text-xs text-muted-foreground">{o ? <>Orden <Link className="underline" href={`/ordenes/${o.id}`}>{numeroOrden(o.numero)}</Link></> : "Sin orden"}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="font-medium tabular-nums">{cop(i.precio)}</span>
                          <BadgeItemPlan estado={i.estado as EstadoItemPlan} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </CardContent>
        </Card>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Anticipo</CardTitle>
              <CardDescription>Queda como anticipo disponible del paciente y se aplica a la cuenta de cobro de cada orden desde Facturación.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {anticipos.length > 0 && (
                <ul className="divide-y rounded-md border text-sm">
                  {anticipos.map((a) => <li key={a.id} className="flex justify-between gap-2 p-2 tabular-nums"><span>{cop(a.valor)}</span><span className="text-muted-foreground">aplicado {cop(a.valorAplicado)}</span></li>)}
                </ul>
              )}
              {puedeAnticipo ? <FormularioAnticipo planId={plan.id} /> : estado === "ACTIVO" && <p className="text-sm text-muted-foreground">Recepción o administración registran los anticipos.</p>}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
