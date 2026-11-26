"use client";

import { FileSignature, ShieldAlert, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { agregarAdenda } from "@/app/(app)/evolucion/actions";
import { EstadoVacio } from "@/components/comunes/estado-vacio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MOTIVO_ADENDA_MIN } from "@/lib/evolucion";
import { numeroOrden } from "@/lib/ordenes";
import type { EvolucionVista } from "@/lib/evolucion-servidor";
import { DialogoFirma } from "./dialogo-firma";

const Bloque = ({ titulo, texto }: { titulo: string; texto: string | null }) =>
  texto ? <div className="space-y-0.5"><dt className="text-xs text-muted-foreground">{titulo}</dt><dd className="text-sm whitespace-pre-wrap break-words">{texto}</dd></div> : null;

export function Integridad({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400"><ShieldCheck className="size-3.5" aria-hidden /> Integridad verificada</span>
  ) : (
    <span role="alert" className="inline-flex items-center gap-1 text-xs font-medium text-destructive"><ShieldAlert className="size-3.5" aria-hidden /> Integridad NO verificada: el contenido no coincide con su firma</span>
  );
}

function Adenda({ ev, puedeFirmar, pideCodigo }: { ev: EvolucionVista; puedeFirmar: boolean; pideCodigo: boolean }) {
  const [motivo, setMotivo] = useState("");
  const [texto, setTexto] = useState("");
  return (
    <div className="space-y-2 border-t pt-3">
      {ev.adendas.length > 0 && (
        <ul className="space-y-2" aria-label={`Adendas del folio ${ev.folio}`}>
          {ev.adendas.map((a) => (
            <li key={a.id} className="space-y-1 rounded-md border border-dashed bg-muted/40 p-3 text-sm">
              <p className="text-xs font-medium">Adenda · {a.firmante}{a.tarjeta ? ` · T.P. ${a.tarjeta}` : ""} · {a.fecha}</p>
              <p className="whitespace-pre-wrap break-words">{a.texto}</p>
              <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground"><span>Hash {a.hashCorto}</span><Integridad ok={a.integra} /></p>
            </li>
          ))}
        </ul>
      )}
      {puedeFirmar && (
        <DialogoFirma
          titulo={`Adenda al folio ${ev.folio}`} confirmar="Firmar adenda" exito="Adenda firmada" pideCodigo={pideCodigo}
          descripcion="La evolución original no se modifica: la corrección queda como una adenda firmada, con fecha, hora y su propio hash."
          ejecutar={(clave, codigo) => agregarAdenda(ev.id, { motivo, texto }, clave, codigo)}
          alExito={() => { setMotivo(""); setTexto(""); }}
          extra={
            <div className="space-y-3">
              <div className="space-y-2"><Label htmlFor={`ad-motivo-${ev.id}`}>Motivo de la adenda</Label><Input id={`ad-motivo-${ev.id}`} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} /></div>
              <div className="space-y-2"><Label htmlFor={`ad-texto-${ev.id}`}>Aclaración o corrección</Label><Textarea id={`ad-texto-${ev.id}`} rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={5000} /></div>
              {motivo.length > 0 && motivo.trim().length < MOTIVO_ADENDA_MIN && <p className="text-xs text-destructive">El motivo necesita al menos {MOTIVO_ADENDA_MIN} caracteres</p>}
            </div>
          }
        >
          <Button size="sm" variant="outline"><FileSignature /> Agregar adenda</Button>
        </DialogoFirma>
      )}
    </div>
  );
}

export function ListaEvoluciones({ evoluciones, puedeFirmar, pideCodigo, filtros = false }: { evoluciones: EvolucionVista[]; puedeFirmar: boolean; pideCodigo: boolean; filtros?: boolean }) {
  const [profesional, setProfesional] = useState("");
  const [orden, setOrden] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const profesionales = useMemo(() => [...new Map(evoluciones.map((e) => [e.profesionalId, e.profesional])).entries()], [evoluciones]);
  const ordenes = useMemo(() => [...new Map(evoluciones.flatMap((e) => (e.ordenId && e.ordenNumero ? [[e.ordenId, e.ordenNumero] as const] : []))).entries()], [evoluciones]);
  const visibles = evoluciones.filter((e) => (!profesional || e.profesionalId === profesional) && (!orden || e.ordenId === orden)
    && (!desde || e.firmadaIso.slice(0, 10) >= desde) && (!hasta || e.firmadaIso.slice(0, 10) <= hasta));
  const sel = "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30";
  return (
    <div className="space-y-3">
      {filtros && evoluciones.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="search" aria-label="Filtrar evoluciones">
          <div className="space-y-1"><Label htmlFor="ev-f-prof">Profesional</Label><select id="ev-f-prof" className={sel} value={profesional} onChange={(e) => setProfesional(e.target.value)}><option value="">Todos</option>{profesionales.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></div>
          <div className="space-y-1"><Label htmlFor="ev-f-orden">Orden</Label><select id="ev-f-orden" className={sel} value={orden} onChange={(e) => setOrden(e.target.value)}><option value="">Todas</option>{ordenes.map(([id, n]) => <option key={id} value={id}>{numeroOrden(n)}</option>)}</select></div>
          <div className="space-y-1"><Label htmlFor="ev-f-desde">Desde</Label><Input id="ev-f-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="ev-f-hasta">Hasta</Label><Input id="ev-f-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
        </div>
      )}
      {visibles.length === 0 ? (
        <Card><CardContent className="px-0"><EstadoVacio icono={FileSignature} titulo={evoluciones.length ? "Sin resultados" : "Sin evoluciones firmadas"} descripcion={evoluciones.length ? "Ninguna evolución coincide con los filtros." : "Las evoluciones firmadas aparecerán aquí, en orden por folio."} /></CardContent></Card>
      ) : (
        <ol className="space-y-3" aria-label="Evoluciones clínicas">
          {visibles.map((e) => (
            <li key={e.id}>
              <Card>
                <CardHeader className="gap-1">
                  <CardTitle className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base">
                    <span>Folio {e.folio}</span>
                    {e.ordenNumero && <Badge variant="outline">{numeroOrden(e.ordenNumero)}</Badge>}
                    {e.plantilla && <Badge variant="secondary">{e.plantilla}</Badge>}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">{e.fecha} · {e.profesional}{e.especialidad ? ` · ${e.especialidad}` : ""}{e.tarjeta ? ` · T.P. ${e.tarjeta}` : ""}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <dl className="space-y-3">
                    <Bloque titulo="Motivo de consulta" texto={e.motivoConsulta} />
                    <Bloque titulo="Hallazgos" texto={e.hallazgos} />
                    <Bloque titulo="Procedimiento" texto={e.procedimiento} />
                    {e.diagnosticos.length > 0 && <div className="space-y-1"><dt className="text-xs text-muted-foreground">Diagnósticos CIE-10</dt><dd><ul className="flex flex-wrap gap-1.5">{e.diagnosticos.map((d) => <li key={d.codigo}><Badge variant="secondary">{d.codigo}{d.descripcion ? ` · ${d.descripcion}` : ""}</Badge></li>)}</ul></dd></div>}
                    <Bloque titulo="Plan" texto={e.plan} />
                    <Bloque titulo="Indicaciones" texto={e.indicaciones} />
                    <Bloque titulo="Próxima cita sugerida" texto={e.proximaCita} />
                    {e.adjuntos.length > 0 && <Bloque titulo="Imágenes y estudios vinculados" texto={e.adjuntos.map((a) => a.nombre).join(", ")} />}
                  </dl>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>Firmada con {e.metodoFirma === "CLAVE_TOTP" ? "contraseña y código de verificación" : "contraseña"} · Hash {e.hashCorto}</span><Integridad ok={e.integra} /></p>
                  <Adenda ev={e} puedeFirmar={puedeFirmar} pideCodigo={pideCodigo} />
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
