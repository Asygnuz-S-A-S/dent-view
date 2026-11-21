// Servicio de pagos en línea: aplica eventos de pasarela (webhook o conciliación) a LinkPago, Pago y Factura.
import { prisma } from "@dent-view/db";
import { registrarEvento } from "@/lib/eventos";
import { estadoTrasPago, numeroFactura } from "@/lib/facturacion";
import { decidirEvento, linkActivo } from "./decision";
import { type EventoMapeado, type Llaves } from "./proveedor";
import { obtenerProveedor } from "./registro";

type Pasarela = { id: string; organizationId: string; proveedor: "WOMPI" | "EPAYCO" | "PAYU" | "MERCADOPAGO" | "BOLD"; modo: "SANDBOX" | "PRODUCCION" };
export type ResultadoEvento = "aplicado" | "estado" | "ignorado" | "duplicado" | "sin_link";

/**
 * Procesa un evento autenticado dentro de una transacción. Idempotente: el evento se reclama con la restricción única
 * (proveedor + id del evento, prefijado con la pasarela); el link y la factura se bloquean para que dos eventos simultáneos no dupliquen el pago.
 */
export async function procesarEvento(pasarela: Pasarela, ev: EventoMapeado, actorId?: string | null): Promise<ResultadoEvento> {
  try {
    return await prisma.$transaction(async (tx) => {
      const org = pasarela.organizationId;
      const registro = await tx.eventoPasarela.create({
        data: { organizationId: org, proveedor: pasarela.proveedor, idEventoExterno: `${pasarela.id}:${ev.idEventoExterno}`, payload: { estado: ev.estado, referencia: ev.referencia, monto: ev.monto, moneda: ev.moneda } },
      });
      const condiciones = [...(ev.referencia ? [{ referencia: ev.referencia }] : []), ...(ev.idExterno ? [{ idExterno: ev.idExterno }] : [])];
      const encontrado = condiciones.length ? await tx.linkPago.findFirst({ where: { pasarelaId: pasarela.id, organizationId: org, OR: condiciones }, select: { id: true } }) : null;
      const cerrar = (r: ResultadoEvento) => tx.eventoPasarela.update({ where: { id: registro.id }, data: { procesadoEn: new Date() } }).then(() => r);
      if (!encontrado) {
        await registrarEvento({ organizationId: org, actorId, tipo: "pago.pasarela_sin_link", detalle: { proveedor: pasarela.proveedor, estado: ev.estado } }, tx);
        return cerrar("sin_link");
      }
      await tx.$queryRaw`SELECT id FROM "LinkPago" WHERE id = ${encontrado.id} FOR UPDATE`;
      const link = await tx.linkPago.findUniqueOrThrow({ where: { id: encontrado.id } });
      const d = decidirEvento(link, ev);
      if (d.accion === "IGNORAR") {
        if (d.motivo !== "link_ya_aprobado" && d.motivo !== "sin_cambio" && d.motivo !== "link_cerrado") {
          // Discrepancia (monto o moneda): el dinero pudo llegar sin aplicarse. Queda auditado para que el admin lo revise.
          await registrarEvento({ organizationId: org, actorId, tipo: "pago.pasarela_discrepancia", detalle: { linkPagoId: link.id, motivo: d.motivo, proveedor: pasarela.proveedor, referenciaExterna: ev.idTransaccion } }, tx);
        }
        return cerrar("ignorado");
      }
      if (d.accion === "ESTADO") {
        await tx.linkPago.update({ where: { id: link.id }, data: { estado: d.estado } });
        await registrarEvento({ organizationId: org, actorId, tipo: "pago.link_estado", detalle: { linkPagoId: link.id, estado: d.estado } }, tx);
        return cerrar("estado");
      }
      // APLICAR: crea el Pago y actualiza la cuenta con la misma regla que el abono manual (lib/facturacion.ts).
      let facturaEstado: string | null = null;
      if (link.facturaId) {
        await tx.$queryRaw`SELECT id FROM "Factura" WHERE id = ${link.facturaId} AND "organizationId" = ${org} FOR UPDATE`;
        const f = await tx.factura.findFirst({ where: { id: link.facturaId, organizationId: org }, include: { pagos: true } });
        if (f) {
          await tx.pago.create({ data: { facturaId: f.id, valor: link.monto, medio: "PASARELA", nota: `Pago en línea (${pasarela.proveedor})`, linkPagoId: link.id, referenciaExterna: ev.idTransaccion } });
          facturaEstado = f.estado === "ABIERTA" ? estadoTrasPago(f.total, [...f.pagos, { valor: link.monto }]) : f.estado;
          if (facturaEstado !== f.estado) await tx.factura.update({ where: { id: f.id }, data: { estado: facturaEstado as "ABIERTA" | "PAGADA" } });
          await registrarEvento({ organizationId: org, pacienteId: f.pacienteId, actorId, tipo: "factura.pago", detalle: { facturaId: f.id, factura: numeroFactura(f.numero), valor: link.monto, medio: "PASARELA", estado: facturaEstado } }, tx);
          // La cuenta ya no estaba abierta (se pagó o anuló mientras tanto): el dinero llegó igual y queda para revisión.
          if (f.estado !== "ABIERTA") await registrarEvento({ organizationId: org, pacienteId: f.pacienteId, actorId, tipo: "pago.pasarela_discrepancia", detalle: { linkPagoId: link.id, motivo: "factura_no_abierta", facturaEstado: f.estado } }, tx);
        }
      }
      await tx.linkPago.update({ where: { id: link.id }, data: { estado: "APROBADO", pagadoEn: new Date() } });
      await registrarEvento({ organizationId: org, actorId, tipo: "pago.link_aprobado", detalle: { linkPagoId: link.id, proveedor: pasarela.proveedor, monto: link.monto, referenciaExterna: ev.idTransaccion } }, tx);
      return cerrar("aplicado");
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return "duplicado"; // evento ya recibido (o pago ya registrado para ese link)
    throw e;
  }
}

/**
 * Concilia los links sin resolver con la API del proveedor (por si se perdió un webhook) y marca como EXPIRADOS los vencidos.
 * Solo proveedores que permiten consultar; los demás se omiten (se informa cuántos).
 */
export async function conciliarLinks(organizationId: string, opciones: { facturaId?: string; actorId?: string | null; descifrarLlaves: (c: string) => Llaves }) {
  const links = await prisma.linkPago.findMany({
    where: { organizationId, estado: { in: ["CREADO", "PENDIENTE"] }, idExterno: { not: null }, ...(opciones.facturaId ? { facturaId: opciones.facturaId } : {}) },
    include: { pasarela: true },
    take: 100,
  });
  const r = { revisados: 0, aprobados: 0, expirados: 0, noSoportados: 0, errores: 0 };
  for (const l of links) {
    r.revisados++;
    const p = obtenerProveedor(l.pasarela.proveedor, l.pasarela.modo);
    try {
      const est = await p.consultarEstado(opciones.descifrarLlaves(l.pasarela.llavesCifradas), l.pasarela.modo, { idExterno: l.idExterno!, referencia: l.referencia });
      if (!est) r.noSoportados++;
      else if (est.estado !== "PENDIENTE") {
        const res = await procesarEvento(l.pasarela, { referencia: l.referencia, idExterno: null, estado: est.estado, monto: est.monto, moneda: est.moneda, idEventoExterno: `conciliacion:${l.id}:${est.estado}`, idTransaccion: est.idTransaccion }, opciones.actorId);
        if (res === "aplicado") r.aprobados++;
      }
    } catch {
      r.errores++;
    }
    if (!linkActivo(l)) {
      const u = await prisma.linkPago.updateMany({ where: { id: l.id, estado: { in: ["CREADO", "PENDIENTE"] } }, data: { estado: "EXPIRADO" } });
      r.expirados += u.count;
    }
  }
  return r;
}
