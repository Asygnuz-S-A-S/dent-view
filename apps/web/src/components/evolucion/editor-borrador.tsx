"use client";

import { FilePlus2, PenLine, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { crearBorrador, descartarBorrador, firmarBorrador, guardarBorrador } from "@/app/(app)/evolucion/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BORRADOR_VACIO, CAMPOS_ESTANDAR, esquemaBorrador, esquemaDiagnostico, type ContenidoBorrador } from "@/lib/evolucion";
import type { DatosEditor } from "@/lib/evolucion-servidor";
import { DialogoFirma } from "./dialogo-firma";

const AUTOGUARDADO_MS = 10_000;
const sel = "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30";

export function NuevaEvolucion({ pacienteId, ordenId }: { pacienteId: string; ordenId: string | null }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  return (
    <Button disabled={pendiente} onClick={() => iniciar(async () => {
      const r = await crearBorrador({ pacienteId, ordenId });
      if (r.error) toast.error(r.error); else router.refresh();
    })}><FilePlus2 /> Nueva evolución</Button>
  );
}

export function EditorBorrador({ datos }: { datos: DatosEditor & { borrador: NonNullable<DatosEditor["borrador"]> } }) {
  const router = useRouter();
  const idc = useId();
  const { borrador, plantillas, imagenes } = datos;
  const [plantillaId, setPlantillaId] = useState<string | null>(borrador.plantillaId);
  const [c, setC] = useState<ContenidoBorrador>(() => { const r = esquemaBorrador.safeParse(borrador.contenido); return r.success ? r.data : BORRADOR_VACIO; });
  const [guardado, setGuardado] = useState<string | null>(null);
  const [errorGuardado, setErrorGuardado] = useState(false);
  const [dx, setDx] = useState({ codigo: "", descripcion: "" });
  const [errorDx, setErrorDx] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const vivo = useRef({ c, plantillaId, sucio: false, activo: true });
  useEffect(() => { vivo.current.c = c; vivo.current.plantillaId = plantillaId; });

  const guardar = async () => {
    const v = vivo.current;
    if (!v.sucio || !v.activo) return;
    v.sucio = false;
    const r = await guardarBorrador(borrador.id, v.c, v.plantillaId);
    if (r.error) { v.sucio = true; setErrorGuardado(true); return; }
    setErrorGuardado(false);
    setGuardado(new Date(r.guardadoEn!).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", second: "2-digit" }));
  };
  const cambiar = (f: (x: ContenidoBorrador) => ContenidoBorrador) => { vivo.current.sucio = true; setC(f); };

  useEffect(() => {
    const v = vivo.current;
    v.activo = true;
    const t = setInterval(guardar, AUTOGUARDADO_MS);
    const alOcultar = () => { if (document.visibilityState === "hidden") void guardar(); };
    document.addEventListener("visibilitychange", alOcultar);
    window.addEventListener("pagehide", guardar);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", alOcultar); window.removeEventListener("pagehide", guardar); void guardar(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `guardar` solo lee refs y el id del borrador
  }, [borrador.id]);

  const plantilla = plantillas.find((p) => p.id === plantillaId) ?? null;
  const campos = plantilla?.campos ?? CAMPOS_ESTANDAR;
  const agregarDx = () => {
    const r = esquemaDiagnostico.safeParse(dx);
    if (!r.success) { setErrorDx(r.error.issues[0]?.message ?? "Diagnóstico inválido"); return; }
    if (c.diagnosticos.some((d) => d.codigo === r.data.codigo)) { setErrorDx("Ese código ya está en la lista"); return; }
    setErrorDx(null); setDx({ codigo: "", descripcion: "" });
    cambiar((x) => ({ ...x, diagnosticos: [...x.diagnosticos, r.data] }));
  };
  const cerrar = () => router.refresh();

  return (
    <Card aria-label="Borrador de evolución">
      <CardHeader className="gap-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">Nueva evolución <Badge variant="secondary">Borrador</Badge></CardTitle>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {errorGuardado ? <span className="text-destructive">No se pudo guardar el borrador; se reintentará.</span> : guardado ? `Guardado automáticamente a las ${guardado}` : "Se guarda automáticamente cada 10 segundos."}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-sm space-y-1">
          <Label htmlFor={`${idc}-plantilla`}>Plantilla</Label>
          <select id={`${idc}-plantilla`} className={sel} value={plantillaId ?? ""} onChange={(e) => { vivo.current.sucio = true; setPlantillaId(e.target.value || null); }}>
            <option value="">Sin plantilla (campos estándar)</option>
            {plantillas.map((p) => <option key={p.id} value={p.id}>{p.nombre} (v{p.version})</option>)}
          </select>
        </div>
        {campos.map((f) => (
          <div key={f.clave} className="space-y-1">
            <Label htmlFor={`${idc}-${f.clave}`}>{f.etiqueta}</Label>
            <Textarea id={`${idc}-${f.clave}`} rows={3} maxLength={5000} placeholder={f.ayuda} value={c.valores[f.clave] ?? ""} onChange={(e) => cambiar((x) => ({ ...x, valores: { ...x.valores, [f.clave]: e.target.value } }))} />
          </div>
        ))}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Diagnósticos CIE-10</legend>
          <div className="grid gap-2 sm:grid-cols-[8rem_1fr_auto]">
            <Input aria-label="Código CIE-10" placeholder="K021" maxLength={5} value={dx.codigo} onChange={(e) => setDx({ ...dx, codigo: e.target.value })} />
            <Input aria-label="Descripción del diagnóstico" placeholder="Descripción (opcional)" maxLength={200} value={dx.descripcion} onChange={(e) => setDx({ ...dx, descripcion: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregarDx(); } }} />
            <Button type="button" variant="outline" onClick={agregarDx}><Plus /> Agregar</Button>
          </div>
          {errorDx && <p role="alert" className="text-xs text-destructive">{errorDx}</p>}
          {c.diagnosticos.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {c.diagnosticos.map((d) => (
                <li key={d.codigo}><Badge variant="secondary" className="gap-1">{d.codigo}{d.descripcion ? ` · ${d.descripcion}` : ""}
                  <button type="button" aria-label={`Quitar ${d.codigo}`} onClick={() => cambiar((x) => ({ ...x, diagnosticos: x.diagnosticos.filter((y) => y.codigo !== d.codigo) }))}><X className="size-3" /></button></Badge></li>
              ))}
            </ul>
          )}
        </fieldset>
        <div className="max-w-xs space-y-1">
          <Label htmlFor={`${idc}-proxima`}>Próxima cita sugerida</Label>
          <Input id={`${idc}-proxima`} type="date" value={c.proximaCita} onChange={(e) => cambiar((x) => ({ ...x, proximaCita: e.target.value }))} />
        </div>
        {imagenes.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Imágenes y estudios del paciente a vincular</legend>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {imagenes.map((i) => (
                <li key={i.id} className="flex items-center gap-2 text-sm">
                  <input id={`${idc}-img-${i.id}`} type="checkbox" className="size-4" checked={c.adjuntoIds.includes(i.id)}
                    onChange={(e) => cambiar((x) => ({ ...x, adjuntoIds: e.target.checked ? [...x.adjuntoIds, i.id] : x.adjuntoIds.filter((y) => y !== i.id) }))} />
                  <label htmlFor={`${idc}-img-${i.id}`} className="min-w-0 truncate">{i.nombre}</label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          <Button type="button" variant="ghost" disabled={pendiente} onClick={() => iniciar(async () => {
            vivo.current.sucio = false; vivo.current.activo = false;
            const r = await descartarBorrador(borrador.id);
            if (r.error) { vivo.current.activo = true; toast.error(r.error); return; }
            toast.success("Borrador descartado"); router.refresh();
          })}><Trash2 /> Descartar borrador</Button>
          {datos.puedeFirmar ? (
            <DialogoFirma
              titulo="Firmar evolución" confirmar="Firmar y cerrar folio" exito="Evolución firmada" pideCodigo={datos.pideCodigo}
              descripcion="Al firmar se asigna el folio, se congela el contenido y ya no se podrá editar ni borrar: las correcciones se hacen con adendas. Confirma con tu contraseña."
              ejecutar={async (clave, codigo) => { const r = await firmarBorrador(borrador.id, c, plantillaId, clave, codigo); if (!r.error) { vivo.current.sucio = false; vivo.current.activo = false; } return r; }}
              alExito={cerrar}
            ><Button type="button"><PenLine /> Firmar</Button></DialogoFirma>
          ) : (
            <p className="text-sm text-muted-foreground">Solo el especialista o el odontólogo del centro puede firmar. El borrador queda guardado.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
