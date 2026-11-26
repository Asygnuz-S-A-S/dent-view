"use client";

import { Copy, Download } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { emitirFacturaElectronica, emitirNotaCreditoElectronica, reintentarDocumentoElectronico } from "@/app/(app)/facturacion/fe-actions";
import { Button } from "@/components/ui/button";

type R = { error?: string; estado?: string };
const aviso = (r: R): void => void (r.error ? toast.error(r.error) : toast.success(r.estado === "ACEPTADA" ? "Documento aceptado" : r.estado === "ENVIANDO" ? "Documento enviado; esperando confirmación" : r.estado === "RECHAZADA" ? "El documento fue rechazado" : "Hecho"));

export function BotonEmitirFev({ facturaId }: { facturaId: string }) {
  const [p, iniciar] = useTransition();
  return <Button type="button" disabled={p} onClick={() => iniciar(async () => { aviso(await emitirFacturaElectronica(facturaId)); })}>Emitir factura electrónica</Button>;
}
export function BotonReintentarFe({ documentoId, facturaId }: { documentoId: string; facturaId: string }) {
  const [p, iniciar] = useTransition();
  return <Button type="button" variant="outline" disabled={p} onClick={() => iniciar(async () => { aviso(await reintentarDocumentoElectronico(documentoId, facturaId)); })}>Reintentar</Button>;
}
export function BotonEmitirNotaFe({ notaCreditoId, facturaId }: { notaCreditoId: string; facturaId: string }) {
  const [p, iniciar] = useTransition();
  return <Button type="button" size="sm" variant="outline" disabled={p} onClick={() => iniciar(async () => { aviso(await emitirNotaCreditoElectronica(notaCreditoId, facturaId)); })}>Emitir nota crédito electrónica</Button>;
}
export function CopiarCufe({ cufe }: { cufe: string }) {
  return (
    <Button type="button" variant="ghost" size="icon" aria-label="Copiar CUFE" onClick={() => navigator.clipboard.writeText(cufe).then(() => toast.success("CUFE copiado"), () => toast.error("No se pudo copiar"))}><Copy /></Button>
  );
}
export const EnlaceDescarga = ({ documentoId, que, etiqueta }: { documentoId: string; que: "pdf" | "xml"; etiqueta: string }) => (
  <Button asChild variant="outline" size="sm"><a href={`/api/fe/documentos/${documentoId}/${que}`} download><Download /> {etiqueta}</a></Button>
);
