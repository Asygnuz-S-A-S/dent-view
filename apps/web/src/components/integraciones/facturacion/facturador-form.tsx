"use client";

import { TriangleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { guardarFacturador } from "@/app/(app)/integraciones/facturacion/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { digitoVerificacionNit } from "@/lib/fe/dian";

export type DatosFacturador = { nit: string; razonSocial: string; nombreComercial: string; codigoPrestador: string; prefijoFactura: string; regimen: string; responsabilidadFiscal: string; modalidadDefecto: string; grupoServiciosDefecto: string; generaRips: boolean; emiteFev: boolean };

const CAMPOS: { k: keyof DatosFacturador; etiqueta: string; max: number; ayuda?: string }[] = [
  { k: "razonSocial", etiqueta: "Razón social", max: 200 },
  { k: "nombreComercial", etiqueta: "Nombre comercial", max: 200 },
  { k: "codigoPrestador", etiqueta: "Código de prestador (REPS, 12 dígitos)", max: 12 },
  { k: "prefijoFactura", etiqueta: "Prefijo de la factura", max: 5, ayuda: "El de tu resolución de numeración DIAN" },
  { k: "regimen", etiqueta: "Régimen", max: 60 },
  { k: "responsabilidadFiscal", etiqueta: "Responsabilidad fiscal", max: 60 },
  { k: "modalidadDefecto", etiqueta: "Modalidad de pago por defecto", max: 60 },
  { k: "grupoServiciosDefecto", etiqueta: "Grupo de servicios por defecto", max: 60 },
];

export function FacturadorForm({ inicial }: { inicial: DatosFacturador }) {
  const [d, setD] = useState(inicial);
  const [pendiente, iniciar] = useTransition();
  const dv = digitoVerificacionNit(d.nit);
  const guardar = () => iniciar(async () => {
    const r = await guardarFacturador(d);
    r.error ? toast.error(r.error) : toast.success(`Datos del facturador guardados (DV ${r.dv})`);
  });
  return (
    <Card data-seccion="facturador">
      <CardHeader>
        <CardTitle>Datos del facturador</CardTitle>
        <CardDescription>Los datos del centro que emite la factura electrónica ante la DIAN.</CardDescription>
        <p className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-pretty">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          Antes de emitir, tu contador o abogado debe validar: NIT, régimen, responsabilidades fiscales, resolución de numeración, tratamiento de IVA de los servicios de salud y los campos del sector salud (Res. 948 de 2026). dent-view no da asesoría tributaria.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="fe-nit">NIT (sin dígito de verificación)</Label>
          <Input id="fe-nit" inputMode="numeric" maxLength={15} value={d.nit} onChange={(e) => setD({ ...d, nit: e.target.value.replace(/\D/g, "") })} />
          <p className="text-xs text-muted-foreground" aria-live="polite">Dígito de verificación: <span className="font-mono font-medium" data-testid="fe-dv">{dv ?? "—"}</span></p>
        </div>
        {CAMPOS.map((c) => (
          <div key={c.k} className="space-y-1.5">
            <Label htmlFor={`fe-${c.k}`}>{c.etiqueta}</Label>
            <Input id={`fe-${c.k}`} maxLength={c.max} value={d[c.k] as string} onChange={(e) => setD({ ...d, [c.k]: e.target.value })} />
            {c.ayuda && <p className="text-xs text-muted-foreground">{c.ayuda}</p>}
          </div>
        ))}
        <div className="flex items-center gap-3 sm:col-span-2">
          <Switch id="fe-rips" checked={d.generaRips} onCheckedChange={(v) => setD({ ...d, generaRips: v })} />
          <Label htmlFor="fe-rips">Generar RIPS</Label>
        </div>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Switch id="fe-emite" checked={d.emiteFev} onCheckedChange={(v) => setD({ ...d, emiteFev: v })} />
          <Label htmlFor="fe-emite">Emitir factura electrónica</Label>
        </div>
      </CardContent>
      <CardFooter><Button type="button" disabled={pendiente || !d.nit || !d.razonSocial} onClick={guardar}>Guardar datos</Button></CardFooter>
    </Card>
  );
}
