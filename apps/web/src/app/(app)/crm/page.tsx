import { AlertTriangle, Clock, Repeat2, Wallet } from "lucide-react";
import { redirect } from "next/navigation";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { FiltrosUrl } from "@/components/comunes/filtros-url";
import { Kpi } from "@/components/comunes/kpi";
import { Delta, TarjetaGrafica } from "@/components/comunes/tarjeta-grafica";
import { ETIQUETA_ETAPA, etiquetaOrigen, textoDuracion } from "@/lib/crm";
import { esGestion, panelCrm } from "@/lib/crm-datos";
import { cop } from "@/lib/formato";
import { CLINICOS } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

export const dynamic = "force-dynamic";
const PERIODOS = [7, 30, 90];

/** Barra horizontal con etiqueta directa y valor (sin leyendas ni ejes). */
function Barra({ etiqueta, valor, max, texto, sub }: { etiqueta: string; valor: number; max: number; texto: string; sub?: string }) {
  return (
    <li className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[11rem_1fr_auto]">
      <span className="truncate">{etiqueta}</span>
      <span className="h-3 rounded-full bg-muted" aria-hidden><span className="block h-full rounded-full bg-primary" style={{ width: `${max ? Math.max(2, (valor / max) * 100) : 0}%` }} /></span>
      <span className="text-right tabular-nums">{texto}{sub && <span className="ml-1 text-xs text-muted-foreground">{sub}</span>}</span>
    </li>
  );
}

export default async function PanelCrm({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const ctx = await exigirContexto(CLINICOS);
  if (!esGestion(ctx.rol)) redirect("/crm/leads");
  const { dias: d } = await searchParams;
  const dias = PERIODOS.includes(Number(d)) ? Number(d) : 30;
  const p = await panelCrm(ctx.organizationId, dias);
  const total = p.embudo[0]!.llegaron;
  const maxEmbudo = Math.max(1, ...p.embudo.map((e) => e.llegaron));
  const mejor = p.origenes.find((o) => o.total >= 1 && o.convertidos > 0);
  const maxOrigen = Math.max(1, ...p.origenes.map((o) => o.total));
  const sinDatos = total === 0 && p.pipelineLeads === 0;

  return (
    <div className="space-y-6">
      <EncabezadoPagina titulo="CRM" descripcion="Seguimiento de leads, valoraciones y pacientes: qué entra, qué avanza y a quién falta contactar." acciones={
        <FiltrosUrl filtros={[{ tipo: "select", clave: "dias", etiqueta: "Periodo", todos: "Últimos 30 días", opciones: PERIODOS.filter((x) => x !== 30).map((x) => ({ valor: String(x), texto: `Últimos ${x} días` })) }]} />
      } />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi titulo="Valor del pipeline" valor={cop(p.pipelineValor)} nota={`${p.pipelineLeads} leads abiertos`} icono={Wallet} href="/crm/leads" />
        <Kpi titulo="Tareas vencidas" valor={p.tareasVencidas} nota={p.tareasVencidas ? "Hay seguimientos atrasados" : "Todo al día"} tono={p.tareasVencidas ? "warning" : "success"} icono={AlertTriangle} href="/crm/tareas" />
        <Kpi titulo="Secuencias activas" valor={p.secuenciasActivas} nota={`${p.inscripcionesActivas} personas en seguimiento`} icono={Repeat2} href="/crm/secuencias" />
        <Kpi titulo="Primera respuesta" valor={textoDuracion(p.respuestaHoras)} icono={Clock} nota="Tiempo medio hasta el primer contacto" delta={p.respuestaHoras !== null && p.respuestaHorasAnterior !== null ? <Delta actual={p.respuestaHoras} anterior={p.respuestaHorasAnterior} buenoSi="baja" /> : undefined} />
      </div>

      {sinDatos ? (
        <TarjetaGrafica className="relative overflow-hidden" titulo="Aún no hay leads para analizar" vacio="Crea o importa tus primeros leads en la sección Leads: aquí verás el embudo, el tiempo de respuesta y qué orígenes convierten mejor." >{null}</TarjetaGrafica>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <TarjetaGrafica
            className="relative overflow-hidden" /* la tabla sr-only (absoluta) desbordaba el ancho en móvil */
            titulo={total ? `Llegaron ${total} leads en ${dias} días y ${p.convertidos} ya son pacientes` : `No llegaron leads nuevos en ${dias} días`}
            cifra={total} delta={<Delta actual={p.nuevos} anterior={p.nuevosAnterior} />}
            subtitulo="Leads nuevos del periodo y hasta dónde avanzaron"
            vacio={total ? undefined : "No hay leads creados en este periodo. Prueba con un periodo más largo."}
            comoSeCalcula="cuenta los leads creados en el periodo según su etapa actual; cada barra incluye a los que llegaron a esa etapa o más lejos (los perdidos solo cuentan en el total). El porcentaje es el paso de una etapa a la siguiente."
            tabla={{ columnas: ["Etapa", "Leads que llegaron", "Conversión desde la anterior"], filas: p.embudo.map((e) => [ETIQUETA_ETAPA[e.etapa], e.llegaron, e.conversion === null ? "—" : `${e.conversion}%`]) }}
          >
            <ul className="space-y-2.5">
              {p.embudo.map((e) => <Barra key={e.etapa} etiqueta={ETIQUETA_ETAPA[e.etapa]} valor={e.llegaron} max={maxEmbudo} texto={String(e.llegaron)} sub={e.conversion === null ? undefined : `${e.conversion}%`} />)}
            </ul>
          </TarjetaGrafica>

          <TarjetaGrafica
            className="relative overflow-hidden" /* la tabla sr-only (absoluta) desbordaba el ancho en móvil */
            titulo={mejor ? `${etiquetaOrigen(mejor.origen)} es el origen que mejor convierte: ${mejor.tasa}% se volvió paciente` : "Todavía ningún origen ha producido pacientes"}
            cifra={`${p.tasa}%`} delta={<Delta actual={p.tasa} anterior={p.tasaAnterior} />}
            subtitulo="Tasa de conversión de lead a paciente"
            vacio={p.origenes.length ? undefined : "Sin leads en el periodo."}
            comoSeCalcula="de los leads creados en el periodo, los que ya fueron convertidos en paciente, agrupados por origen. Un origen con pocos leads puede variar mucho."
            tabla={{ columnas: ["Origen", "Leads", "Pacientes", "Conversión"], filas: p.origenes.map((o) => [etiquetaOrigen(o.origen), o.total, o.convertidos, `${o.tasa}%`]) }}
          >
            <ul className="space-y-2.5">
              {p.origenes.map((o) => <Barra key={o.origen} etiqueta={etiquetaOrigen(o.origen)} valor={o.total} max={maxOrigen} texto={`${o.convertidos} de ${o.total}`} sub={`${o.tasa}%`} />)}
            </ul>
          </TarjetaGrafica>
        </div>
      )}
      <p className="text-xs text-pretty text-muted-foreground">Los porcentajes comparan contra el mismo número de días justo antes del periodo elegido.</p>
    </div>
  );
}
