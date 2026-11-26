// Bloque «Factura electrónica» de una cuenta de cobro (FEV DIAN). Componente de servidor reutilizable: `<BloqueFev facturaId={id} />`
// (lo monta el detalle de la cuenta y puede montarlo el bloque de factura de la orden). No pinta nada si el centro no emite FEV ni tiene documentos.
import { prisma } from "@dent-view/db";
import { BotonEmitirFev, BotonEmitirNotaFe, BotonReintentarFe, CopiarCufe, EnlaceDescarga } from "@/components/facturacion/acciones-fev";
import { InsigniaFev } from "@/components/facturacion/insignia-fev";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EstadoDoc } from "@/lib/fe/estados";
import { fechaCorta } from "@/lib/fechas";
import { cop } from "@/lib/precios";
import { GESTION } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

const mensajes = (m: unknown) => (Array.isArray(m) ? m.filter((x): x is string => typeof x === "string").slice(0, 5) : []);

export async function BloqueFev({ facturaId }: { facturaId: string }) {
  const ctx = await exigirContexto(GESTION);
  const org = ctx.organizationId;
  const [cfg, conexion, docs, factura] = await Promise.all([
    prisma.configFacturacion.findUnique({ where: { organizationId: org }, select: { emiteFev: true } }),
    prisma.conexionFE.findFirst({ where: { organizationId: org, activa: true }, select: { id: true } }),
    prisma.documentoElectronico.findMany({ where: { organizationId: org, facturaId }, orderBy: { creadoEn: "asc" } }),
    prisma.factura.findFirst({ where: { id: facturaId, organizationId: org }, select: { estado: true, notasCredito: { orderBy: { consecutivo: "asc" } } } }),
  ]);
  if (!factura || (!cfg?.emiteFev && docs.length === 0)) return null;
  const fev = docs.find((d) => d.tipo === "FACTURA");
  const docNota = new Map(docs.filter((d) => d.notaCreditoId).map((d) => [d.notaCreditoId!, d]));
  const puedeEmitir = !!cfg?.emiteFev && !!conexion && (factura.estado === "ABIERTA" || factura.estado === "PAGADA");
  const fevOk = fev?.estado === "ACEPTADA";
  return (
    <Card className="py-0" data-seccion="fev">
      <CardHeader className="pt-6"><CardTitle>Factura electrónica</CardTitle></CardHeader>
      <CardContent className="space-y-4 px-6 pb-6 text-sm">
        {!fev ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-muted-foreground">{puedeEmitir ? "Aún no se emitió la factura electrónica de esta cuenta." : !conexion ? "No hay un proveedor de facturación electrónica activo (Integraciones)." : "Esta cuenta no se puede facturar electrónicamente en su estado actual."}</span>
            {puedeEmitir && <BotonEmitirFev facturaId={facturaId} />}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <InsigniaFev estado={fev.estado as EstadoDoc} />
              {fev.numeroDian && <span>N.º DIAN <span className="font-mono">{fev.numeroDian}</span></span>}
              {fev.aceptadoEn && <span className="text-muted-foreground">{fechaCorta(fev.aceptadoEn)}</span>}
              {(fev.estado === "RECHAZADA" || fev.estado === "ERROR") && <BotonReintentarFe documentoId={fev.id} facturaId={facturaId} />}
            </div>
            {fev.cufe && <p className="flex items-center gap-1"><span className="text-muted-foreground">CUFE</span> <span className="break-all font-mono text-xs" data-testid="fe-cufe">{fev.cufe}</span><CopiarCufe cufe={fev.cufe} /></p>}
            {fev.estado === "ENVIANDO" && <p className="text-muted-foreground">Enviada; el sistema consulta el resultado automáticamente{fev.intentos > 1 ? ` (intento ${fev.intentos})` : ""}.</p>}
            {mensajes(fev.mensajes).length > 0 && fev.estado !== "ACEPTADA" && (
              <ul className="list-disc space-y-0.5 pl-5 text-destructive" role="alert">{mensajes(fev.mensajes).map((m, i) => <li key={i}>{m}</li>)}</ul>
            )}
            {(fev.estado === "ACEPTADA" || fev.estado === "ANULADA") && <div className="flex flex-wrap gap-2"><EnlaceDescarga documentoId={fev.id} que="pdf" etiqueta="Descargar PDF" /><EnlaceDescarga documentoId={fev.id} que="xml" etiqueta="Descargar XML" /></div>}
          </div>
        )}
        {fevOk && ctx.rol === "admin_tenant" && factura.notasCredito.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <p className="font-medium">Notas crédito electrónicas</p>
            <ul className="space-y-2">
              {factura.notasCredito.map((n) => {
                const d = docNota.get(n.id);
                return (
                  <li key={n.id} className="flex flex-wrap items-center gap-2" data-nota={n.id}>
                    <span>NC-{String(n.consecutivo).padStart(4, "0")} · {cop(n.valor)}</span>
                    {d ? <InsigniaFev estado={d.estado as EstadoDoc} /> : <BotonEmitirNotaFe notaCreditoId={n.id} facturaId={facturaId} />}
                    {d?.numeroDian && <span className="font-mono text-xs">{d.numeroDian}</span>}
                    {d && (d.estado === "RECHAZADA" || d.estado === "ERROR") && <BotonReintentarFe documentoId={d.id} facturaId={facturaId} />}
                    {d?.estado === "ACEPTADA" && <><EnlaceDescarga documentoId={d.id} que="pdf" etiqueta="PDF" /><EnlaceDescarga documentoId={d.id} que="xml" etiqueta="XML" /></>}
                    {d && mensajes(d.mensajes).length > 0 && d.estado !== "ACEPTADA" && <span className="w-full text-xs text-destructive" role="alert">{mensajes(d.mensajes)[0]}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {fevOk && <p className="text-xs text-muted-foreground">Una factura electrónica aceptada no se anula: se corrige con una nota crédito electrónica.</p>}
      </CardContent>
    </Card>
  );
}
