import { prisma } from "@dent-view/db";
import { Crown, HeartHandshake, TrendingDown, UserCheck, UserPlus, UserX } from "lucide-react";
import { ConfigFidelizacionForm, ListaSegmento } from "@/components/crm/fidelizacion-ui";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { Kpi } from "@/components/comunes/kpi";
import { AYUDA_SEGMENTO, ETIQUETA_SEGMENTO, SEGMENTOS, type Segmento } from "@/lib/crm";
import { segmentosFidelizacion } from "@/lib/crm-datos";
import { cop } from "@/lib/formato";
import { ADMIN, GESTION } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

export const dynamic = "force-dynamic";
const ICONO = { ACTIVO: UserCheck, EN_RIESGO: TrendingDown, INACTIVO: UserX, NUEVO: UserPlus, VIP: Crown } as const;

export default async function Fidelizacion({ searchParams }: { searchParams: Promise<{ segmento?: string }> }) {
  const ctx = await exigirContexto(GESTION);
  const { segmento: s } = await searchParams;
  const segmento = (SEGMENTOS as readonly string[]).includes(s ?? "") ? (s as Segmento) : "EN_RIESGO";
  const [cfg, seg, secuencias] = await Promise.all([
    prisma.configFidelizacion.findUnique({ where: { organizationId: ctx.organizationId } }),
    segmentosFidelizacion(ctx.organizationId),
    prisma.secuenciaCRM.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
  ]);
  const filas = (seg.porSegmento.get(segmento) ?? []).map((p) => ({ id: p.id, nombre: p.nombre, correo: p.correo, ultimaVisitaEn: p.ultimaVisitaEn?.toISOString() ?? null, proximoControlEn: p.proximoControlEn?.toISOString() ?? null }));
  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo="Fidelización" descripcion="Cuida a tus pacientes: detecta quién se está alejando y haz seguimiento antes de perderlo." />
      <section className="space-y-3 rounded-lg border bg-card p-4" aria-label="Configuración"><h2 className="flex items-center gap-2 text-base font-semibold"><HeartHandshake className="size-4 text-muted-foreground" aria-hidden /> Configuración</h2>
        <ConfigFidelizacionForm inicial={{ activa: cfg?.activa ?? false, diasControl: cfg?.diasControl ?? 180, recordarCumpleanos: cfg?.recordarCumpleanos ?? true }} puedeEditar={(ADMIN as readonly string[]).includes(ctx.rol)} /></section>
      <section aria-labelledby="segmentos" className="space-y-3">
        <h2 id="segmentos" className="text-base font-semibold">Segmentos <span className="font-normal text-muted-foreground">({seg.total} pacientes)</span></h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {SEGMENTOS.map((k) => <Kpi key={k} titulo={ETIQUETA_SEGMENTO[k]} valor={seg.conteos[k]} icono={ICONO[k]} nota={AYUDA_SEGMENTO[k]} href={`/crm/fidelizacion?segmento=${k}`} className={k === segmento ? "border-primary" : undefined} />)}
        </div>
        <p className="text-xs text-muted-foreground">VIP: gasto de {cop(2_000_000)} o más, o 6 o más visitas en 12 meses, según tu facturación y agenda. Un paciente puede estar en varios segmentos.</p>
      </section>
      <section aria-labelledby="lista" className="space-y-3">
        <h2 id="lista" className="text-base font-semibold">{ETIQUETA_SEGMENTO[segmento]}</h2>
        <ListaSegmento filas={filas} secuencias={secuencias} />
        {seg.conteos[segmento] > filas.length && <p className="text-xs text-muted-foreground">Se muestran los primeros {filas.length} de {seg.conteos[segmento]}.</p>}
      </section>
    </div>
  );
}
