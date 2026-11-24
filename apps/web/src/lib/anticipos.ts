// Aplicación de anticipos a cuentas de cobro: crea un Pago medio ANTICIPO y descuenta del anticipo, todo en la transacción recibida.
import type { prisma } from "@dent-view/db";
import { registrarEvento } from "@/lib/eventos";
import { estadoTrasPago, montoAplicable, numeroFactura, saldo } from "@/lib/facturacion";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Devuelve un mensaje de error, o null si se aplicó. Bloquea cuenta y anticipo para que dos aplicaciones simultáneas no pasen del saldo. */
export async function aplicarAnticipo(tx: Tx, e: { organizationId: string; anticipoId: string; facturaId: string; actorId?: string | null }): Promise<string | null> {
  const org = e.organizationId;
  await tx.$queryRaw`SELECT id FROM "Factura" WHERE id = ${e.facturaId} AND "organizationId" = ${org} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "Anticipo" WHERE id = ${e.anticipoId} AND "organizationId" = ${org} FOR UPDATE`;
  const f = await tx.factura.findFirst({ where: { id: e.facturaId, organizationId: org }, include: { pagos: true } });
  if (!f) return "Cuenta de cobro no encontrada";
  if (f.estado !== "ABIERTA") return "La cuenta no está abierta";
  const a = await tx.anticipo.findFirst({ where: { id: e.anticipoId, organizationId: org } });
  if (!a) return "Anticipo no encontrado";
  if (a.estado !== "DISPONIBLE") return "El anticipo ya no está disponible";
  if (!a.pacienteId || a.pacienteId !== f.pacienteId) return "El anticipo es de otro paciente";
  const monto = montoAplicable(a, saldo(f.total, f.pagos));
  if (monto <= 0) return "La cuenta no tiene saldo para aplicar";
  await tx.pago.create({ data: { facturaId: f.id, valor: monto, medio: "ANTICIPO", nota: "Anticipo aplicado", anticipoId: a.id, registradoPorId: e.actorId ?? null } });
  const valorAplicado = a.valorAplicado + monto;
  await tx.anticipo.update({ where: { id: a.id }, data: { valorAplicado, estado: valorAplicado >= a.valor ? "APLICADO" : "DISPONIBLE" } });
  const estado = estadoTrasPago(f.total, [...f.pagos, { valor: monto }]);
  if (estado !== f.estado) await tx.factura.update({ where: { id: f.id }, data: { estado } });
  await registrarEvento({ organizationId: org, pacienteId: f.pacienteId, actorId: e.actorId, tipo: "anticipo.aplicado", detalle: { anticipoId: a.id, facturaId: f.id, factura: numeroFactura(f.numero), valor: monto, estado } }, tx);
  return null;
}
