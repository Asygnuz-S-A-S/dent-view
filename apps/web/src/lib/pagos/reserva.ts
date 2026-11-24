// Reserva del monto de un link de pago: se calcula lo ya comprometido y se crea el link DENTRO de una transacción con la Factura bloqueada,
// para que dos clics simultáneos no sumen más que el saldo.
import type { prisma as Prisma } from "@dent-view/db";
import { saldo, validarAbono } from "@/lib/facturacion";
import { linkActivo } from "./decision";

type Entrada = { organizationId: string; facturaId: string; pasarelaId: string; abono?: number; referencia: string; expiraEn: Date; creadoPorId: string };

export async function reservarLinkPago(db: typeof Prisma, e: Entrada): Promise<{ error: string } | { id: string; monto: number }> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Factura" WHERE id = ${e.facturaId} AND "organizationId" = ${e.organizationId} FOR UPDATE`;
    const f = await tx.factura.findFirst({ where: { id: e.facturaId, organizationId: e.organizationId }, include: { pagos: true, linksPago: true } });
    if (!f) return { error: "Cuenta de cobro no encontrada" };
    if (f.estado !== "ABIERTA") return { error: "La cuenta no está abierta" };
    const pendiente = saldo(f.total, f.pagos);
    const comprometido = f.linksPago.filter((l) => linkActivo(l)).reduce((t, l) => t + l.monto, 0);
    const monto = e.abono ?? pendiente - comprometido;
    const errorMonto = validarAbono(monto, pendiente - comprometido);
    if (errorMonto) return { error: comprometido > 0 && monto <= 0 ? "Ya hay links activos que cubren el saldo: anúlalos primero" : errorMonto.replace("saldo", "saldo disponible para links") };
    const link = await tx.linkPago.create({ data: { organizationId: e.organizationId, pasarelaId: e.pasarelaId, facturaId: f.id, referencia: e.referencia, monto, expiraEn: e.expiraEn, creadoPorId: e.creadoPorId } });
    return { id: link.id, monto };
  });
}
