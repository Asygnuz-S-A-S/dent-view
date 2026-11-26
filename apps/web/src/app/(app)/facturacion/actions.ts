"use server";
// Adaptado de OpenDentist (MIT, © 2026 Clawnify) — https://github.com/clawnify/OpenDentist

import { prisma } from "@dent-view/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { registrarEvento } from "@/lib/eventos";
import { aplicarAnticipo } from "@/lib/anticipos";
import { estadoTrasPago, MEDIOS_PAGO, MOTIVO_MIN, motivoValido, numeroFactura, saldo, totalItems, totalPagado, validarAbono, validarNotaCredito } from "@/lib/facturacion";
import { prepararNotaFe, procesarDocumento } from "@/lib/fe/servicio";
import { conReintentoNumero } from "@/lib/ordenes";
import { ADMIN, GESTION } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

const TOTAL_MAX = 2_000_000_000;

const esquemaFactura = z.object({
  ordenId: z.string().optional(),
  pacienteId: z.string().optional(),
  items: z
    .array(z.object({ descripcion: z.string().trim().min(1, "Falta la descripción"), cantidad: z.number().int().min(1).max(10_000, "La cantidad máxima por ítem es 10.000"), valorUnitario: z.number().int().min(0).max(1_000_000_000, "El valor de un ítem no puede superar $ 1.000.000.000") }))
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
  let items: { descripcion: string; cantidad: number; valorUnitario: number; servicioId?: string | null }[] = d.items;
  let convenioId: string | null = null;
  if (d.ordenId) {
    // Desde una orden: paciente e ítems salen de la orden (precios congelados), no del cliente.
    const orden = await prisma.orden.findFirst({ where: { id: d.ordenId, organizationId: org }, include: { items: true } });
    if (!orden) return { error: "Orden no encontrada" };
    pacienteId = orden.pacienteId;
    // servicioId se conserva (el CUPS sale de la orden/catálogo al facturar electrónicamente); convenioId es el vínculo real con el convenio de la orden.
    items = orden.items.map((i) => ({ descripcion: i.opciones ? `${i.nombre} (${i.opciones})` : i.nombre, cantidad: 1, valorUnitario: i.precio, servicioId: i.servicioId }));
    convenioId = orden.convenioId;
  } else {
    if (!pacienteId) return { error: "Selecciona un paciente" };
    if (items.length === 0) return { error: "Agrega al menos un ítem" };
    const p = await prisma.pacienteTenant.findFirst({ where: { id: pacienteId, organizationId: org } });
    if (!p) return { error: "Paciente no encontrado" };
  }
  if (d.responsable === "CONVENIO") {
    // Convenio real: el de la orden o, si se escribió el nombre, el convenio del centro con ese nombre (sin distinguir mayúsculas).
    const conv = convenioId
      ? await prisma.convenio.findFirst({ where: { id: convenioId, organizationId: org }, select: { id: true } })
      : await prisma.convenio.findFirst({ where: { organizationId: org, nombre: { equals: d.convenio, mode: "insensitive" } }, select: { id: true } });
    convenioId = conv?.id ?? null;
  } else convenioId = null;
  const total = totalItems(items);
  if (total <= 0) return { error: "El total debe ser mayor a 0" };
  if (total > TOTAL_MAX) return { error: "El total de la cuenta no puede superar $ 2.000.000.000" }; // columnas Int4: más allá fallaría en la BD

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
            convenioId,
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

const revalidarCuenta = (facturaId: string) => {
  revalidatePath("/facturacion");
  revalidatePath(`/facturacion/${facturaId}`);
  revalidatePath("/cartera");
};

/** Anula una cuenta abierta sin pagos vigentes (los pagos anulados no cuentan). Exige motivo; queda quién y cuándo. */
export async function anularFactura(facturaId: string, motivo: string): Promise<{ error?: string }> {
  const ctx = await exigirContexto(GESTION);
  const m = motivoValido(motivo);
  if (!m) return { error: `Escribe el motivo (mínimo ${MOTIVO_MIN} caracteres)` };
  const org = ctx.organizationId;
  const resultado = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Factura" WHERE id = ${facturaId} AND "organizationId" = ${org} FOR UPDATE`;
    const f = await tx.factura.findFirst({ where: { id: facturaId, organizationId: org }, include: { pagos: { where: { anuladoEn: null }, select: { id: true } } } });
    if (!f) return "Cuenta de cobro no encontrada";
    if (f.estado !== "ABIERTA") return "Solo se anulan cuentas abiertas";
    if (f.pagos.length > 0) return "No se puede anular una cuenta con pagos: anula primero los pagos (administrador)";
    // Una FEV vigente (enviada o aceptada) no se anula en dent-view: se corrige con una nota crédito electrónica.
    if ((await tx.documentoElectronico.count({ where: { organizationId: org, facturaId, tipo: "FACTURA", estado: { in: ["ENVIANDO", "ACEPTADA"] } } })) > 0) return "La cuenta tiene una factura electrónica vigente: no se anula, se corrige con una nota crédito electrónica";
    await tx.factura.update({ where: { id: facturaId }, data: { estado: "ANULADA", anuladoEn: new Date(), anuladoPorId: ctx.usuario.id, motivoAnulacion: m } });
    await registrarEvento(
      { organizationId: org, pacienteId: f.pacienteId, actorId: ctx.usuario.id, tipo: "factura.anulada", detalle: { facturaId, factura: numeroFactura(f.numero), motivo: m } },
      tx,
    );
    return null;
  });
  if (resultado) return { error: resultado };
  revalidarCuenta(facturaId);
  return {};
}

/** Anula un pago (solo admin): no se borra, queda marcado con motivo. Si la cuenta estaba pagada y vuelve a tener saldo, se reabre; un anticipo aplicado recupera lo aplicado. */
export async function anularPago(pagoId: string, motivo: string): Promise<{ error?: string }> {
  const ctx = await exigirContexto(ADMIN);
  const m = motivoValido(motivo);
  if (!m) return { error: `Escribe el motivo (mínimo ${MOTIVO_MIN} caracteres)` };
  const org = ctx.organizationId;
  const p0 = await prisma.pago.findFirst({ where: { id: pagoId, factura: { organizationId: org } }, select: { facturaId: true } });
  if (!p0) return { error: "Pago no encontrado" };
  const resultado = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Factura" WHERE id = ${p0.facturaId} AND "organizationId" = ${org} FOR UPDATE`;
    const f = await tx.factura.findFirstOrThrow({ where: { id: p0.facturaId, organizationId: org }, include: { pagos: true } });
    const pago = f.pagos.find((x) => x.id === pagoId);
    if (!pago) return "Pago no encontrado";
    if (pago.anuladoEn) return "El pago ya está anulado";
    if (f.estado === "ANULADA") return "La cuenta está anulada";
    await tx.pago.update({ where: { id: pagoId }, data: { anuladoEn: new Date(), anuladoPorId: ctx.usuario.id, motivoAnulacion: m } });
    if (pago.anticipoId) {
      await tx.$queryRaw`SELECT id FROM "Anticipo" WHERE id = ${pago.anticipoId} AND "organizationId" = ${org} FOR UPDATE`;
      const a = await tx.anticipo.findFirst({ where: { id: pago.anticipoId, organizationId: org } });
      if (a) await tx.anticipo.update({ where: { id: a.id }, data: { valorAplicado: Math.max(0, a.valorAplicado - pago.valor), estado: a.estado === "APLICADO" ? "DISPONIBLE" : a.estado } });
    }
    const vigentes = f.pagos.filter((x) => x.id !== pagoId);
    const estado = estadoTrasPago(f.total, vigentes);
    if (estado !== f.estado) await tx.factura.update({ where: { id: f.id }, data: { estado } });
    await registrarEvento(
      { organizationId: org, pacienteId: f.pacienteId, actorId: ctx.usuario.id, tipo: "factura.pago_anulado", detalle: { pagoId, facturaId: f.id, factura: numeroFactura(f.numero), valor: pago.valor, medio: pago.medio, motivo: m, estado } },
      tx,
    );
    return null;
  });
  if (resultado) return { error: resultado };
  revalidarCuenta(p0.facturaId);
  return {};
}

/**
 * Nota crédito sobre una cuenta ya pagada (solo admin). Regla: la nota crédito REDUCE el total de la cuenta (Factura.total) en su valor,
 * así todas las sumas de saldo quedan correctas sin tocar a los consumidores; lo pagado que excede el nuevo total es saldo a favor (reembolso manual).
 * Valor <= min(lo pagado, total vigente): varias notas no acumulan más que lo pagado ni dejan el total negativo. Consecutivo por centro; la nota solo se inserta.
 */
export async function crearNotaCredito(facturaId: string, entrada: { valor: number; motivo: string }): Promise<{ error?: string }> {
  const ctx = await exigirContexto(ADMIN);
  const m = motivoValido(entrada.motivo);
  if (!m) return { error: `Escribe el motivo (mínimo ${MOTIVO_MIN} caracteres)` };
  const org = ctx.organizationId;
  let documentoFeId: string | null = null;
  const resultado = await conReintentoNumero(() =>
    prisma.$transaction(async (tx) => {
      documentoFeId = null;
      await tx.$queryRaw`SELECT id FROM "Factura" WHERE id = ${facturaId} AND "organizationId" = ${org} FOR UPDATE`;
      const f = await tx.factura.findFirst({ where: { id: facturaId, organizationId: org }, include: { pagos: true } });
      if (!f) return "Cuenta de cobro no encontrada";
      if (f.estado !== "PAGADA") return "La nota crédito solo aplica a cuentas pagadas";
      const error = validarNotaCredito(entrada.valor, totalPagado(f.pagos), f.total);
      if (error) return error;
      const max = await tx.notaCredito.aggregate({ where: { organizationId: org }, _max: { consecutivo: true } });
      const consecutivo = (max._max.consecutivo ?? 0) + 1;
      const nota = await tx.notaCredito.create({ data: { organizationId: org, consecutivo, facturaId, valor: entrada.valor, motivo: m, creadaPorId: ctx.usuario.id } });
      // Con FEV aceptada, la nota interna queda acompañada de su nota crédito electrónica (pendiente de envío); la interna no depende de la respuesta del proveedor.
      documentoFeId = await prepararNotaFe(tx, { organizationId: org, facturaId, notaCreditoId: nota.id, userId: ctx.usuario.id });
      await tx.factura.update({ where: { id: facturaId }, data: { total: f.total - entrada.valor } });
      await registrarEvento(
        { organizationId: org, pacienteId: f.pacienteId, actorId: ctx.usuario.id, tipo: "factura.nota_credito", detalle: { facturaId, factura: numeroFactura(f.numero), consecutivo, valor: entrada.valor, totalAnterior: f.total, motivo: m } },
        tx,
      );
      return null;
    }),
  );
  if (resultado) return { error: resultado };
  // Fuera de la transacción: si el proveedor falla, el documento queda ENVIANDO y el cron lo reintenta.
  if (documentoFeId) await procesarDocumento(documentoFeId).catch((e) => console.error("fe: nota crédito electrónica pendiente", e instanceof Error ? e.message : "error"));
  revalidarCuenta(facturaId);
  return {};
}

/** Aplica un anticipo disponible del paciente a la cuenta (crea un Pago con medio ANTICIPO por lo que alcance). */
export async function aplicarAnticipoACuenta(facturaId: string, anticipoId: string): Promise<{ error?: string }> {
  const ctx = await exigirContexto(GESTION);
  const error = await prisma.$transaction((tx) => aplicarAnticipo(tx, { organizationId: ctx.organizationId, anticipoId, facturaId, actorId: ctx.usuario.id }));
  if (error) return { error };
  revalidarCuenta(facturaId);
  return {};
}
