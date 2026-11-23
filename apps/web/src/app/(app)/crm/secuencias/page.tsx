import { prisma } from "@dent-view/db";
import { Plus } from "lucide-react";
import Link from "next/link";
import { Simular, InstalarPlantilla, ToggleActiva } from "@/components/crm/acciones-secuencia";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { EstadoVacio } from "@/components/comunes/estado-vacio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ETIQUETA_DISPARADOR, PLANTILLAS_SECUENCIA } from "@/lib/crm";
import { estadisticasSecuencias } from "@/lib/crm-datos";
import { GESTION } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

export const dynamic = "force-dynamic";

export default async function Secuencias() {
  const ctx = await exigirContexto(GESTION);
  const [secuencias, stats] = await Promise.all([
    prisma.secuenciaCRM.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { creadoEn: "desc" }, include: { _count: { select: { pasos: true } } } }),
    estadisticasSecuencias(ctx.organizationId),
  ]);
  return (
    <div className="space-y-8">
      <EncabezadoPagina
        titulo="Secuencias automáticas"
        descripcion="Seguimientos que se ejecutan solos: esperan, envían un correo, crean una tarea o mueven al lead de etapa. Solo escriben a quien dio su consentimiento y nunca a quien pidió no ser contactado."
        acciones={<Button asChild><Link href="/crm/secuencias/nueva"><Plus /> Nueva secuencia</Link></Button>}
      />
      {secuencias.length === 0 ? (
        <EstadoVacio titulo="Todavía no tienes secuencias" descripcion="Instala una plantilla predefinida (nace inactiva, la revisas y la activas) o crea la tuya desde cero." />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2" aria-label="Secuencias del centro">
          {secuencias.map((s) => {
            const e = stats.get(s.id) ?? { inscritos: 0, activas: 0, enviados: 0, omitidos: 0, respuestas: 0 };
            return (
              <li key={s.id} className="space-y-3 rounded-lg border bg-card p-4" data-testid="secuencia">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/crm/secuencias/${s.id}`} className="font-semibold hover:underline">{s.nombre}</Link>
                    <p className="text-xs text-muted-foreground">{ETIQUETA_DISPARADOR[s.disparador]}{s.diasInactividad ? ` · ${s.diasInactividad} días` : ""} · {s._count.pasos} {s._count.pasos === 1 ? "paso" : "pasos"}</p>
                  </div>
                  <ToggleActiva id={s.id} activa={s.activa} nombre={s.nombre} />
                </div>
                <dl className="grid grid-cols-4 gap-2 text-center text-xs">
                  {([["Inscritos", e.inscritos], ["Enviados", e.enviados], ["Omitidos", e.omitidos], ["Respuestas", e.respuestas]] as const).map(([k, v]) => <div key={k} className="rounded-md bg-muted/60 p-2"><dd className="text-lg font-semibold tabular-nums">{v}</dd><dt className="text-muted-foreground">{k}</dt></div>)}
                </dl>
                <div className="flex flex-wrap gap-2"><Button asChild size="sm" variant="outline"><Link href={`/crm/secuencias/${s.id}`}>Editar</Link></Button><Simular id={s.id} />{e.activas > 0 && <Badge variant="info">{e.activas} en curso</Badge>}</div>
              </li>
            );
          })}
        </ul>
      )}

      <section aria-labelledby="plantillas" className="space-y-3">
        <div><h2 id="plantillas" className="text-lg font-semibold">Plantillas predefinidas</h2><p className="text-sm text-muted-foreground">Se instalan inactivas con un clic; puedes editarlas antes de activarlas. Los textos no incluyen datos clínicos.</p></div>
        <ul className="grid gap-3 md:grid-cols-2">
          {PLANTILLAS_SECUENCIA.map((p) => (
            <li key={p.clave} className="flex items-start justify-between gap-3 rounded-lg border p-4">
              <div className="min-w-0 space-y-1"><p className="font-medium">{p.nombre}</p><p className="text-sm text-pretty text-muted-foreground">{p.descripcion}</p><p className="text-xs text-muted-foreground">{ETIQUETA_DISPARADOR[p.disparador]} · {p.pasos.length} pasos</p></div>
              <InstalarPlantilla clave={p.clave} nombre={p.nombre} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
