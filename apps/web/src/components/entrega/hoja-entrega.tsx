"use client";

/* eslint-disable @next/next/no-img-element -- hoja de impresión: data URLs, sin optimizador */

import { Printer } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";

export type CentroHoja = { nombre: string; logo: string | null };

// En pantalla la hoja no existe; al imprimir solo se ve ella (todo lo demás del body se oculta).
const ESTILO = `#hoja-entrega{display:none}
@media print{body>*:not(#hoja-entrega){display:none!important}#hoja-entrega{display:block!important}@page{margin:18mm}}`;

/** Hoja imprimible (o "Guardar como PDF") con enlace, QR y código. El código solo existe en memoria mientras el diálogo muestra el resultado. */
export function HojaEntrega({ centro, paciente, enlace, codigo, venceEn }: { centro?: CentroHoja; paciente: string; enlace: string; codigo: string; venceEn: string }) {
  const [qr, setQr] = useState("");
  useEffect(() => { void QRCode.toDataURL(enlace, { margin: 1, width: 360 }).then(setQr); }, [enlace]);
  const vence = new Date(venceEn).toLocaleDateString("es-CO", { timeZone: "America/Bogota", dateStyle: "long" });

  return (
    <>
      <Button type="button" variant="outline" disabled={!qr} onClick={() => window.print()}><Printer /> Imprimir hoja</Button>
      {createPortal(
        <div id="hoja-entrega" style={{ fontFamily: "system-ui, sans-serif", color: "#000", textAlign: "center" }}>
          <style>{ESTILO}</style>
          {centro?.logo && <img src={centro.logo} alt="" style={{ maxHeight: 80, margin: "0 auto 8px" }} />}
          <h1 style={{ fontSize: 24, margin: 0 }}>{centro?.nombre || "Resultados de su estudio"}</h1>
          <h2 style={{ fontSize: 18, fontWeight: 400, margin: "24px 0 4px" }}>Resultados de su estudio</h2>
          <p style={{ fontSize: 20, fontWeight: 600, textTransform: "capitalize", margin: 0 }}>{paciente.toLowerCase()}</p>
          <p style={{ margin: "28px 0 8px" }}>Escanee este código con la cámara de su celular o abra el enlace:</p>
          {qr && <img src={qr} alt="Código QR del enlace de resultados" width={220} height={220} style={{ margin: "0 auto" }} />}
          <p style={{ wordBreak: "break-all", fontSize: 13, margin: "12px 0 28px" }}>{enlace}</p>
          <p style={{ margin: "0 0 4px" }}>Su código de acceso:</p>
          <p style={{ fontFamily: "monospace", fontSize: 44, letterSpacing: "0.3em", fontWeight: 700, margin: 0 }}>{codigo}</p>
          <p style={{ fontSize: 13, marginTop: 28 }}>El enlace vence el {vence}. No comparta este código con terceros.</p>
        </div>,
        document.body,
      )}
    </>
  );
}
