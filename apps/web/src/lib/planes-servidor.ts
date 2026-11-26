// Plan de tratamiento: acceso del lado servidor. Sin RLS: toda consulta filtra por organizationId.
import { prisma, type Prisma } from "@dent-view/db";
import { estadoItemTrasOrden, estadoPlanTras, ORIGENES_ITEM, ROLES_PLANES, type EstadoItemPlan, type EstadoPlan } from "./planes";
import type { EstadoOrden } from "./ordenes";
import { exigirContexto, exigirModulo } from "./sesion";

type Tx = Prisma.TransactionClient;

/** Personal clínico y de gestión (404 para doctores remitentes y centros sin el módulo). */
export async function contextoPlanes() {
  const ctx = await exigirContexto(ROLES_PLANES);
  await exigirModulo(ctx, "planes");
  return ctx;
}
export type ContextoPlanes = Awaited<ReturnType<typeof contextoPlanes>>;

/** Un id ajeno es indistinguible de uno inexistente. */
export const planDelCentro = (organizationId: string, id: string) => prisma.planTratamiento.findFirst({ where: { id, organizationId } });

/** Anticipos del plan que cuentan (los reembolsados, retenidos o anulados no). */
export const anticiposDelPlan = (organizationId: string, planId: string) =>
  prisma.anticipo.findMany({ where: { organizationId, planId, estado: { in: ["DISPONIBLE", "APLICADO"] } }, orderBy: { creadoEn: "asc" } });

/**
 * Tras un cambio de estado de la orden: los ítems del plan que ella tomó pasan a REALIZADO (tomada en adelante) o vuelven a PENDIENTE (cancelada),
 * y el plan se completa o se reabre. Idempotente (updateMany por estado de origen); se llama dentro de la transacción de la orden.
 */
export async function sincronizarPlanConOrden(tx: Tx, e: { organizationId: string; ordenId: string; estadoOrden: EstadoOrden }) {
  const destino = estadoItemTrasOrden(e.estadoOrden);
  if (!destino) return;
  const lineas = await tx.ordenItem.findMany({ where: { ordenId: e.ordenId, planItemId: { not: null }, orden: { organizationId: e.organizationId } }, select: { planItemId: true } });
  if (!lineas.length) return;
  const ids = lineas.map((l) => l.planItemId!);
  await tx.planItem.updateMany({ where: { id: { in: ids }, organizationId: e.organizationId, estado: { in: [...ORIGENES_ITEM[destino as "PENDIENTE" | "REALIZADO"]] } }, data: { estado: destino } });
  const planes = await tx.planItem.findMany({ where: { id: { in: ids }, organizationId: e.organizationId }, select: { planId: true }, distinct: ["planId"] });
  for (const { planId } of planes) {
    const plan = await tx.planTratamiento.findFirst({ where: { id: planId, organizationId: e.organizationId }, select: { estado: true, items: { select: { estado: true } } } });
    if (!plan) continue;
    const nuevo = estadoPlanTras(plan.estado as EstadoPlan, plan.items as { estado: EstadoItemPlan }[]);
    if (nuevo !== plan.estado) await tx.planTratamiento.updateMany({ where: { id: planId, organizationId: e.organizationId }, data: { estado: nuevo } });
  }
}
