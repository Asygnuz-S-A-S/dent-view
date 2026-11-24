"use server";

// Dispara el webhook de Wompi firmado (como lo haría la pasarela) contra esta misma app. Solo localhost con PAGOS_SIMULADO=1 y SANDBOX.
import { createHash } from "node:crypto";
import { prisma } from "@dent-view/db";
import { descifrar, secretoCifrado } from "@/lib/cifrado";
import { simulacionActiva } from "@/lib/pagos/proveedor";

export async function simularPagoAprobado(idLink: string): Promise<{ error?: string }> {
  if (!simulacionActiva("SANDBOX") || typeof idLink !== "string" || !/^SIM-[A-Za-z0-9_-]{1,80}$/.test(idLink)) return { error: "No disponible" };
  const link = await prisma.linkPago.findFirst({ where: { idExterno: idLink, pasarela: { modo: "SANDBOX", proveedor: "WOMPI", activa: true } }, select: { monto: true, pasarela: { select: { id: true, llavesCifradas: true } } } });
  const clave = secretoCifrado();
  if (!link || !clave) return { error: "Link de pago no encontrado" };
  const secreto = (JSON.parse(descifrar(link.pasarela.llavesCifradas, clave)) as { secretoEventos?: string }).secretoEventos;
  if (!secreto) return { error: "La pasarela no tiene secreto de eventos configurado" };
  const timestamp = Math.floor(Date.now() / 1000);
  const idTx = `SIMTX-${Date.now()}`;
  const cents = link.monto * 100;
  const checksum = createHash("sha256").update(`${idTx}APPROVED${cents}${timestamp}${secreto}`).digest("hex");
  const cuerpo = {
    event: "transaction.updated", environment: "test", timestamp, sent_at: new Date().toISOString(),
    data: { transaction: { id: idTx, status: "APPROVED", amount_in_cents: cents, currency: "COP", reference: "sim", payment_link_id: idLink } },
    signature: { properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"], checksum },
  };
  const r = await fetch(`http://127.0.0.1:${process.env.PORT ?? 3000}/api/pagos/wompi/${link.pasarela.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) });
  return r.ok ? {} : { error: `El webhook respondió ${r.status}` };
}
