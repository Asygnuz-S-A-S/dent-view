// Página de pago de la pasarela SIMULADA (solo localhost con PAGOS_SIMULADO=1 y pasarela en SANDBOX); en cualquier otro caso es un 404.
import { prisma } from "@dent-view/db";
import { notFound } from "next/navigation";
import { cop } from "@/lib/formato";
import { simulacionActiva } from "@/lib/pagos/proveedor";
import { BotonPagoSimulado } from "../boton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pago simulado", robots: { index: false, follow: false } };

export default async function PagoSimulado({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!simulacionActiva("SANDBOX") || !/^SIM-[A-Za-z0-9_-]{1,80}$/.test(id)) notFound();
  const link = await prisma.linkPago.findFirst({ where: { idExterno: id, pasarela: { modo: "SANDBOX" } }, select: { referencia: true, monto: true, estado: true, pasarela: { select: { proveedor: true } } } });
  if (!link) notFound();
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold tracking-tight text-balance">Pago simulado</h1>
      <p className="text-sm text-muted-foreground text-pretty">Pasarela de pruebas ({link.pasarela.proveedor}). No se cobra nada: el botón envía el webhook firmado que mandaría la pasarela.</p>
      <dl className="grid grid-cols-2 gap-2 rounded-lg border p-4 text-sm">
        <dt className="text-muted-foreground">Referencia</dt><dd className="break-all font-mono">{link.referencia}</dd>
        <dt className="text-muted-foreground">Monto</dt><dd className="font-medium tabular-nums">{cop(link.monto)}</dd>
        <dt className="text-muted-foreground">Estado</dt><dd>{link.estado}</dd>
      </dl>
      {link.pasarela.proveedor === "WOMPI" ? <BotonPagoSimulado idLink={id} /> : <p className="text-sm text-muted-foreground">La simulación del webhook solo está disponible para Wompi.</p>}
    </main>
  );
}
