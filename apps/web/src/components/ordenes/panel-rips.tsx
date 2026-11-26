"use client";

import { CircleAlert, CircleCheck, Download, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { generarRipsOrden, guardarRips } from "@/app/(app)/ordenes/actions";
import { SelectorCodigo } from "@/components/ordenes/selector-codigo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CAUSAS, FINALIDADES, TIPOS_DIAGNOSTICO, TIPOS_RIPS, TIPOS_USUARIO, VIAS_INGRESO, type Opcion } from "@/lib/catalogos/referencias-rips";
import { generarRips, type EntradaRips, type Hallazgo, type TipoRipsServicio } from "@/lib/rips/generar";

const NINGUNO = "__ninguno__";
type Envio = { id: string; creadoEn: string; estado: string; hash: string };
type Item = { id: string; nombre: string; codigoCups: string | null; tipoRips: TipoRipsServicio };

function CampoSelect({ id, etiqueta, valor, onChange, opciones, deshabilitado }: { id: string; etiqueta: string; valor: string | null; onChange: (v: string | null) => void; opciones: Opcion[]; deshabilitado?: boolean }) {
  // Un valor guardado que no está en la lista (las tablas son parciales) se conserva visible.
  const lista = valor && !opciones.some((o) => o.valor === valor) ? [...opciones, { valor, etiqueta: "Valor guardado" }] : opciones;
  return (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={id}>{etiqueta}</Label>
      <Select value={valor ?? NINGUNO} onValueChange={(v) => onChange(v === NINGUNO ? null : v)} disabled={deshabilitado}>
        <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NINGUNO}>Sin definir</SelectItem>
          {lista.map((o) => <SelectItem key={o.valor} value={o.valor}>{o.valor} · {o.etiqueta}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export function PanelRips({
  ordenId, pacienteId, base, items: itemsIniciales, profesionales, profesionalInicial, envios, puedeClinico, soloLectura,
}: {
  ordenId: string; pacienteId: string; base: EntradaRips; items: Item[]; profesionales: { id: string; nombre: string }[]; profesionalInicial: string | null;
  envios: Envio[]; puedeClinico: boolean; soloLectura: boolean;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const o = base.orden;
  const [f, setF] = useState({
    tipoUsuario: o.tipoUsuario, numAutorizacion: o.numAutorizacion ?? "", finalidad: o.finalidad, causa: o.causaMotivoAtencion, via: o.viaIngreso,
    dxPrincipal: o.diagnosticoPrincipal, dxRelacionados: o.diagnosticosRelacionados, tipoDx: o.tipoDiagnostico, profesional: profesionalInicial,
  });
  const [items, setItems] = useState(itemsIniciales);
  const [resultado, setResultado] = useState<{ ok: boolean; errores: Hallazgo[]; advertencias: Hallazgo[] } | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  // Lista de verificación viva: el mismo validador del servidor, sobre lo que hay en pantalla.
  const vivo = useMemo(() => generarRips({
    ...base,
    orden: { ...o, tipoUsuario: f.tipoUsuario, numAutorizacion: f.numAutorizacion || null, finalidad: f.finalidad, causaMotivoAtencion: f.causa, viaIngreso: f.via, diagnosticoPrincipal: f.dxPrincipal, diagnosticosRelacionados: f.dxRelacionados, tipoDiagnostico: f.tipoDx },
    items: base.items.map((b, n) => ({ ...b, codigoCups: items[n]!.codigoCups, tipoRips: items[n]!.tipoRips })),
  }), [base, o, f, items]);
  const lista = vivo.errores.length === 0;

  const carga = () => ({
    tipoUsuario: f.tipoUsuario ?? "", numAutorizacion: f.numAutorizacion, viaIngreso: f.via ?? "", causaMotivoAtencion: f.causa ?? "", profesionalAtiendeId: f.profesional ?? "",
    items: items.map((i) => ({ id: i.id, codigoCups: i.codigoCups ?? "", tipoRips: i.tipoRips })),
    ...(puedeClinico ? { finalidad: f.finalidad ?? "", tipoDiagnostico: f.tipoDx ?? "", diagnosticoPrincipal: f.dxPrincipal ?? "", diagnosticosRelacionados: f.dxRelacionados } : {}),
  });
  const guardar = (despues?: () => void) => iniciar(async () => {
    const r = await guardarRips(ordenId, carga());
    if (r.error) { toast.error(r.error); return; }
    toast.success("Datos RIPS guardados");
    router.refresh();
    despues?.();
  });
  const generar = () => iniciar(async () => {
    const g = await guardarRips(ordenId, carga());
    if (g.error) { toast.error(g.error); return; }
    const r = await generarRipsOrden(ordenId);
    if ("error" in r) { toast.error(r.error); return; }
    setResultado(r);
    router.refresh();
  });

  const destino = (h: Hallazgo) =>
    h.destino === "paciente" ? `/pacientes/${pacienteId}` : h.destino === "centro" ? "/integraciones/facturacion" : h.destino === "catalogo" ? "/catalogo" : `#rips-${h.campo.replace(/\./g, "-")}`;
  const bloqueado = soloLectura || pendiente;

  return (
    <div id="rips-form" className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Datos de la atención</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CampoSelect id="rips-tipoUsuario" etiqueta="Tipo de usuario" valor={f.tipoUsuario} onChange={(v) => set("tipoUsuario", v)} opciones={TIPOS_USUARIO} deshabilitado={bloqueado} />
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="rips-numAutorizacion">Número de autorización</Label>
              <Input id="rips-numAutorizacion" value={f.numAutorizacion} maxLength={30} disabled={bloqueado} onChange={(e) => set("numAutorizacion", e.target.value)} />
            </div>
            <CampoSelect id="rips-finalidad" etiqueta="Finalidad de la atención" valor={f.finalidad} onChange={(v) => set("finalidad", v)} opciones={FINALIDADES} deshabilitado={bloqueado || !puedeClinico} />
            <CampoSelect id="rips-causaMotivoAtencion" etiqueta="Causa o motivo de la atención" valor={f.causa} onChange={(v) => set("causa", v)} opciones={CAUSAS} deshabilitado={bloqueado} />
            <CampoSelect id="rips-viaIngreso" etiqueta="Vía de ingreso" valor={f.via} onChange={(v) => set("via", v)} opciones={VIAS_INGRESO} deshabilitado={bloqueado} />
            <CampoSelect id="rips-profesional" etiqueta="Profesional que atiende" valor={f.profesional} onChange={(v) => set("profesional", v)} opciones={profesionales.map((p) => ({ valor: p.id, etiqueta: p.nombre }))} deshabilitado={bloqueado} />
            {!puedeClinico && <p className="text-xs text-muted-foreground sm:col-span-2">El diagnóstico y la finalidad los registra el personal médico.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Diagnóstico (CIE-10)</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="rips-diagnosticoPrincipal">Diagnóstico principal</Label>
              <SelectorCodigo id="rips-diagnosticoPrincipal" catalogo="cie10" etiqueta="Diagnóstico principal" value={f.dxPrincipal} onChange={(c) => set("dxPrincipal", c)} deshabilitado={bloqueado || !puedeClinico} />
            </div>
            <CampoSelect id="rips-tipoDiagnostico" etiqueta="Tipo de diagnóstico principal" valor={f.tipoDx} onChange={(v) => set("tipoDx", v)} opciones={TIPOS_DIAGNOSTICO} deshabilitado={bloqueado || !puedeClinico} />
            <div id="rips-diagnosticosRelacionados" className="grid gap-2">
              <Label>Diagnósticos relacionados</Label>
              {f.dxRelacionados.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {f.dxRelacionados.map((d) => (
                    <li key={d}>
                      <Badge variant="secondary" className="gap-1">
                        {d}
                        {puedeClinico && !bloqueado && <button type="button" aria-label={`Quitar diagnóstico ${d}`} className="ml-1 rounded px-1 hover:bg-background" onClick={() => set("dxRelacionados", f.dxRelacionados.filter((x) => x !== d))}>×</button>}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
              {puedeClinico && !bloqueado && (
                <SelectorCodigo key={f.dxRelacionados.length} catalogo="cie10" etiqueta="Agregar diagnóstico relacionado" value={null} limpiable={false}
                  onChange={(c) => c && (f.dxRelacionados.includes(c) ? toast.error("Ese diagnóstico ya está agregado") : set("dxRelacionados", [...f.dxRelacionados, c]))} />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Servicios (CUPS)</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {items.map((i, n) => (
              <div key={i.id} className="grid grid-cols-1 gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
                <p className="font-medium sm:col-span-2">{i.nombre}</p>
                <div id={`rips-items-${n}-codigoCups`} className="grid min-w-0 gap-1">
                  <Label className="text-xs text-muted-foreground">Código CUPS</Label>
                  <SelectorCodigo catalogo="cups" etiqueta={`CUPS de ${i.nombre}`} value={i.codigoCups} onChange={(c) => setItems((l) => l.map((x, m) => (m === n ? { ...x, codigoCups: c } : x)))} deshabilitado={bloqueado} />
                </div>
                <div className="grid min-w-0 gap-1">
                  <Label htmlFor={`rips-tipo-${n}`} className="text-xs text-muted-foreground">Tipo RIPS</Label>
                  <Select value={i.tipoRips} onValueChange={(v) => setItems((l) => l.map((x, m) => (m === n ? { ...x, tipoRips: v as TipoRipsServicio } : x)))} disabled={bloqueado}>
                    <SelectTrigger id={`rips-tipo-${n}`} className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{TIPOS_RIPS.map((t) => <SelectItem key={t.valor} value={t.valor}>{t.etiqueta}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => guardar()} disabled={bloqueado}>{pendiente ? "Guardando…" : "Guardar datos RIPS"}</Button>
          <Button type="button" variant="outline" onClick={generar} disabled={bloqueado || !lista}>Generar y validar</Button>
          {lista ? (
            <Button asChild variant="outline"><a href={`/api/rips/${ordenId}`} download><Download /> Descargar JSON</a></Button>
          ) : (
            <Button variant="outline" disabled><Download /> Descargar JSON</Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Validado localmente NO es lo mismo que aprobado por el Ministerio de Salud: el CUV solo lo entrega el validador oficial. Carga el archivo en el sistema oficial o con tu proveedor tecnológico.
        </p>
        {resultado && (
          <div role="status" className="rounded-lg border p-3 text-sm">
            {resultado.ok ? "Validado localmente: el JSON se generó y quedó guardado en el historial. Aún no está aprobado por el Ministerio." : "No se generó el JSON: corrige los pendientes de la lista de verificación."}
          </div>
        )}
      </div>

      <aside className="space-y-4" aria-label="Lista de verificación RIPS">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle>Lista de verificación</CardTitle>
            <Badge variant={lista ? "success" : "warning"}>{lista ? "Lista" : `Incompleta (${vivo.errores.length})`}</Badge>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {lista ? (
              <p className="flex items-center gap-2"><CircleCheck className="size-4 text-success" /> No falta ningún dato obligatorio.</p>
            ) : (
              <ul className="space-y-2">
                {vivo.errores.map((h, n) => (
                  <li key={`${h.campo}-${n}`} className="flex gap-2">
                    <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                    <span>{h.mensaje} {h.destino === "orden" ? <a className="underline underline-offset-4" href={destino(h)}>Ir</a> : <Link className="underline underline-offset-4" href={destino(h)}>Corregir</Link>}</span>
                  </li>
                ))}
              </ul>
            )}
            {vivo.advertencias.length > 0 && (
              <details className="rounded-lg border p-2">
                <summary className="cursor-pointer font-medium">Avisos ({vivo.advertencias.length})</summary>
                <ul className="mt-2 space-y-2 text-muted-foreground">
                  {vivo.advertencias.map((h, n) => <li key={`${h.campo}-${n}`} className="flex gap-2"><TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />{h.mensaje}</li>)}
                </ul>
              </details>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Historial de envíos</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {envios.length === 0 ? <p className="text-muted-foreground">Aún no se ha generado ningún RIPS.</p> : (
              <ul className="divide-y">
                {envios.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>{e.creadoEn}</span>
                    <span className="font-mono text-xs text-muted-foreground" title={e.hash}>{e.hash.slice(0, 8)}</span>
                    <Badge variant="secondary">{e.estado === "VALIDADO_LOCAL" ? "Validado local" : e.estado}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
