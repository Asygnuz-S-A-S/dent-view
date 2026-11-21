"use server";
// Adaptado de OpenDentist (MIT, © 2026 Clawnify) — https://github.com/clawnify/OpenDentist

import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { registrarEvento } from "@/lib/eventos";
import { estadoTrasPago, MEDIOS_PAGO, numeroFactura, saldo, totalItems, validarAbono } from "@/lib/facturacion";
import { conReintentoNumero } from "@/lib/ordenes";
import { GESTION } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

const esquemaFactura = z.object({
  ordenId: z.string().optional(),
  pacienteId: z.string().optional(),
  items: z
    .array(z.object({ descripcion: z.string().trim().min(1, "Falta la descripción"), cantidad: z.number().int().min(1), valorUnitario: z.number().int().min(0) }))
    .default([]),
  responsable: z.enum(["PACIENTE", "DOCTOR", "CONVENIO"]),
  responsableId: z.string().optional(),
  convenio: z.string().trim().max(200).optional(),
  vence: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notas: z.string().trim().max(1000).optional(),
});

export type ResultadoFactura = { error: string } | { id: string };

export async function crearFactura(entrada: z.input<typeof esquemaFactura>): Promise<ResultadoFactura> {
  const ctx = await exigirContexto(GESTION);
  const r = esquemaFactura.safeParse(entrada);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos inválidos" };
  const d = r.data;
  const org = ctx.organizationId;

  if (d.responsable === "CONVENIO" && !d.convenio) return { error: "Indica el convenio" };
  if (d.responsable === "DOCTOR") {
    const m = d.responsableId
      ? await prisma.member.findUnique({ where: { organizationId_userId: { organizationId: org, userId: d.responsableId } } })
      : null;
    if (m?.role !== "doctor_remitente") return { error: "Doctor remitente no válido" };
  }

  let pacienteId = d.pacienteId;
  let items = d.items;
  if (d.ordenId) {
    // Desde una orden: paciente e ítems salen de la orden (precios congelados), no del cliente.
    const orden = await prisma.orden.findFirst({ where: { id: d.ordenId, organizationId: org }, include: { items: true } });
    if (!orden) return { error: "Orden no encontrada" };
    pacienteId = orden.pacienteId;
    items = orden.items.map((i) => ({ descripcion: i.opciones ? `${i.nombre} (${i.opciones})` : i.nombre, cantidad: 1, valorUnitario: i.precio }));
  } else {
    if (!pacienteId) return { error: "Selecciona un paciente" };
    if (items.length === 0) return { error: "Agrega al menos un ítem" };
    const p = await prisma.pacienteTenant.findFirst({ where: { id: pacienteId, organizationId: org } });
    if (!p) return { error: "Paciente no encontrado" };
  }
  const total = totalItems(items);
  if (total <= 0) return { error: "El total debe ser mayor a 0" };

  try {
    const factura = await conReintentoNumero(() =>
      prisma.$transaction(async (tx) => {
        if (d.ordenId && (await tx.factura.count({ where: { organizationId: org, ordenId: d.ordenId, estado: { not: "ANULADA" } } })) > 0) {
          throw new Error("ORDEN_FACTURADA");
        }
        const max = await tx.factura.aggregate({ where: { organizationId: org }, _max: { numero: true } });
        const creada = await tx.factura.create({
          data: {
            organizationId: org,
            numero: (max._max.numero ?? 0) + 1,
            pacienteId,
            ordenId: d.ordenId ?? null,
            responsable: d.responsable,
            responsableId: d.responsable === "DOCTOR" ? d.responsableId : null,
            convenio: d.responsable === "CONVENIO" ? d.convenio : null,
            total,
            vence: d.vence ? new Date(`${d.vence}T23:59:59-05:00`) : null,
            notas: d.notas || null,
            items: { create: items },
          },
        });
        await registrarEvento(
          { organizationId: org, pacienteId, actorId: ctx.usuario.id, tipo: "factura.creada", detalle: { facturaId: creada.id, factura: numeroFactura(creada.numero), total } },
          tx,
        );
        return creada;
      }),
    );
    revalidatePath("/facturacion");
    revalidatePath("/cartera");
    return { id: factura.id };
  } catch (e) {
    if ((e as Error).message === "ORDEN_FACTURADA") return { error: "Esa orden ya tiene una cuenta de cobro vigente" };
    throw e;
  }
}

const esquemaPago = z.object({
  valor: z.number().int(),
  medio: z.enum(MEDIOS_PAGO),
  nota: z.string().trim().max(500).optional(),
});

export async function registrarPago(facturaId: string, entrada: z.input<typeof esquemaPago>): Promise<{ error?: string }> {
  const ctx = await exigirContexto(GESTION);
  const r = esquemaPago.safeParse(entrada);
  if (!r.success) return { error: "Datos inválidos" };
  const org = ctx.organizationId;
  const resultado = await prisma.$transaction(async (tx) => {
    // Bloquea la fila para que dos abonos simultáneos no superen el saldo.
    await tx.$queryRaw`SELECT id FROM "Factura" WHERE id = ${facturaId} AND "organizationId" = ${org} FOR UPDATE`;
    const f = await tx.factura.findFirst({ where: { id: facturaId, organizationId: org }, include: { pagos: true } });
    if (!f) return "Cuenta de cobro no encontrada";
    if (f.estado !== "ABIERTA") return "La cuenta no está abierta";
    const error = validarAbono(r.data.valor, saldo(f.total, f.pagos));
    if (error) return error;
    await tx.pago.create({ data: { facturaId, valor: r.data.valor, medio: r.data.medio, nota: r.data.nota || null, registradoPorId: ctx.usuario.id } });
    const estado = estadoTrasPago(f.total, [...f.pagos, { valor: r.data.valor }]);
    if (estado !== f.estado) await tx.factura.update({ where: { id: facturaId }, data: { estado } });
    await registrarEvento(
      { organizationId: org, pacienteId: f.pacienteId, actorId: ctx.usuario.id, tipo: "factura.pago", detalle: { facturaId, factura: numeroFactura(f.numero), valor: r.data.valor, medio: r.data.medio, estado } },
      tx,
    );
    return null;
  });
  if (resultado) return { error: resultado };
  revalidatePath("/facturacion");
  revalidatePath(`/facturacion/${facturaId}`);
  revalidatePath("/cartera");
  return {};
}

export async function anularFactura(facturaId: string): Promise<{ error?: string }> {
  const ctx = await exigirContexto(GESTION);
  const org = ctx.organizationId;
  const resultado = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Factura" WHERE id = ${facturaId} AND "organizationId" = ${org} FOR UPDATE`;
    const f = await tx.factura.findFirst({ where: { id: facturaId, organizationId: org }, include: { _count: { select: { pagos: true } } } });
    if (!f) return "Cuenta de cobro no encontrada";
    if (f.estado !== "ABIERTA") return "Solo se anulan cuentas abiertas";
    if (f._count.pagos > 0) return "No se puede anular una cuenta con pagos";
    await tx.factura.update({ where: { id: facturaId }, data: { estado: "ANULADA" } });
    await registrarEvento(
      { organizationId: org, pacienteId: f.pacienteId, actorId: ctx.usuario.id, tipo: "factura.anulada", detalle: { facturaId, factura: numeroFactura(f.numero) } },
      tx,
    );
    return null;
  });
  if (resultado) return { error: resultado };
  revalidatePath("/facturacion");
  revalidatePath(`/facturacion/${facturaId}`);
  revalidatePath("/cartera");
  return {};
}
