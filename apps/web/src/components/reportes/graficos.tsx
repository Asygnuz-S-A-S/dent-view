// Adaptado de OpenDentist (MIT, © 2026 Clawnify) — https://github.com/clawnify/OpenDentist
import { BarrasLista, type FilaBarra } from "@/components/comunes/barras-lista";
import { GraficoBarrasDia } from "@/components/comunes/grafico-barras-dia";
import { Delta, TarjetaGrafica } from "@/components/comunes/tarjeta-grafica";
import { fraseVariacion } from "@/components/comunes/variacion";
import { ETIQUETA_ESTADO_CITA, type EstadoCita } from "@/lib/agenda";
import { ETIQUETA_ESTADO_ORDEN, type EstadoOrden } from "@/lib/ordenes";
import { cop } from "@/lib/precios";

type Serie = { nombre: string; total: number }[];
export type DatosGraficos = {
  ingresosPorDia: { dia: string; valor: number }[];
  ordenesPorEstado: Serie;
  estudiosPorModalidad: Serie;
  topDoctores: { nombre: string; valor: number }[];
  citasPorEstado: Serie;
  cobros: number;
};

const suma = (s: Serie) => s.reduce((t, x) => t + x.total, 0);
const pct = (n: number, t: number) => (t ? Math.round((n / t) * 100) : 0);
const ORDEN_FLUJO: EstadoOrden[] = ["SOLICITADA", "AGENDADA", "TOMADA", "INFORMADA", "ENTREGADA", "CANCELADA"];
const ORDEN_CITA: EstadoCita[] = ["PROGRAMADA", "CONFIRMADA", "LLEGO", "EN_ATENCION", "ATENDIDA", "NO_ASISTIO", "CANCELADA"];
const MALOS_CITA = ["NO_ASISTIO", "CANCELADA"];

function filasPorEstado(s: Serie, orden: string[], etiqueta: Record<string, string>, malos: string[]): FilaBarra[] {
  const total = suma(s);
  return orden.flatMap((e) => {
    const n = s.find((x) => x.nombre === e)?.total ?? 0;
    return n ? [{ nombre: etiqueta[e] ?? e, n, valor: String(n), extra: `${pct(n, total)} %`, malo: malos.includes(e) }] : [];
  });
}

/** `dias` son las fechas YYYY-MM-DD del rango, en el mismo orden que `d.ingresosPorDia`; `p` es el periodo anterior de igual duración. */
export function Graficos({ d, p, dias }: { d: DatosGraficos; p: DatosGraficos; dias: string[] }) {
  const cobrosDia = d.ingresosPorDia.map((x, i) => ({ dia: dias[i]!, valor: x.valor }));
  const ordenes = suma(d.ordenesPorEstado);
  const solicitadas = d.ordenesPorEstado.find((x) => x.nombre === "SOLICITADA")?.total ?? 0;
  const citas = suma(d.citasPorEstado);
  const atendidas = d.citasPorEstado.find((x) => x.nombre === "ATENDIDA")?.total ?? 0;
  const noVino = d.citasPorEstado.find((x) => x.nombre === "NO_ASISTIO")?.total ?? 0;
  const estudios = suma(d.estudiosPorModalidad);
  const modalidades = [...d.estudiosPorModalidad].sort((a, b) => b.total - a.total);
  const empatadas = modalidades.filter((m) => m.total === modalidades[0]?.total);
  const totalDoctores = d.topDoctores.reduce((t, x) => t + x.valor, 0);
  const topDoctor = d.topDoctores[0];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
      <TarjetaGrafica
        className="lg:col-span-2"
        titulo={d.cobros ? `Se cobraron ${cop(d.cobros)} en el periodo` : "No se registraron cobros en el periodo"}
        subtitulo={d.cobros || p.cobros ? fraseVariacion(d.cobros, p.cobros, "", "el periodo anterior", cop) + "." : undefined}
        cifra={cop(d.cobros)}
        delta={<Delta actual={d.cobros} anterior={p.cobros} />}
        vacio={d.cobros === 0 ? "Cuando se registren pagos en estas fechas, verás aquí cuánto entró cada día. Prueba con otro rango." : undefined}
        comoSeCalcula="suma de los pagos recibidos cada día (hora de Bogotá), sin importar de qué cuenta de cobro vienen. Se rotula el día más alto."
        tabla={{ columnas: ["Día", "Cobros"], filas: cobrosDia.filter((x) => x.valor).map((x) => [x.dia, cop(x.valor)]) }}
      >
        <GraficoBarrasDia datos={cobrosDia} moneda />
      </TarjetaGrafica>

      <TarjetaGrafica
        titulo={ordenes === 0 ? "No hay órdenes en el periodo" : solicitadas ? `${solicitadas} de ${ordenes} órdenes siguen esperando cita` : `Las ${ordenes} órdenes del periodo ya tienen cita o avanzaron`}
        cifra={String(ordenes)}
        delta={<Delta actual={ordenes} anterior={suma(p.ordenesPorEstado)} />}
        vacio={ordenes === 0 ? "Crea una orden o amplía el rango de fechas para ver su avance." : undefined}
        comoSeCalcula="órdenes creadas en el rango, agrupadas por su estado actual. Cancelada va en rojo."
      >
        <BarrasLista filas={filasPorEstado(d.ordenesPorEstado, ORDEN_FLUJO, ETIQUETA_ESTADO_ORDEN, ["CANCELADA"])} />
      </TarjetaGrafica>

      <TarjetaGrafica
        titulo={citas === 0 ? "No hay citas en el periodo" : `${atendidas} de ${citas} citas se atendieron${noVino ? `; ${noVino} no asistieron` : ""}`}
        cifra={String(citas)}
        delta={<Delta actual={citas} anterior={suma(p.citasPorEstado)} />}
        vacio={citas === 0 ? "Agenda una cita o amplía el rango de fechas para ver cómo van." : undefined}
        comoSeCalcula="citas cuyo inicio cae en el rango, por su estado actual. No asistió y cancelada van en rojo."
      >
        <BarrasLista filas={filasPorEstado(d.citasPorEstado, ORDEN_CITA, ETIQUETA_ESTADO_CITA, MALOS_CITA)} />
      </TarjetaGrafica>

      <TarjetaGrafica
        titulo={estudios === 0 ? "No hay estudios en el periodo" : (empatadas.length > 1 ? `${empatadas.map((m) => m.nombre).join(" y ")} empatan como los estudios más frecuentes: ${pct(modalidades[0]!.total, estudios)} % del total cada uno` : `${modalidades[0]!.nombre} es el estudio más frecuente: ${pct(modalidades[0]!.total, estudios)} % del total`)}
        cifra={String(estudios)}
        delta={<Delta actual={estudios} anterior={suma(p.estudiosPorModalidad)} />}
        vacio={estudios === 0 ? "Los estudios llegan solos desde los equipos del centro; prueba con otro rango." : undefined}
        comoSeCalcula="estudios recibidos en el rango, por modalidad del equipo (CT, panorámica, etc.)."
      >
        <BarrasLista filas={modalidades.map((m) => ({ nombre: m.nombre, n: m.total, valor: String(m.total), extra: `${pct(m.total, estudios)} %` }))} />
      </TarjetaGrafica>

      <TarjetaGrafica
        titulo={!topDoctor ? "No hay órdenes con doctor remitente en el periodo" : `${topDoctor.nombre} aporta el ${pct(topDoctor.valor, totalDoctores)} % del valor remitido`}
        subtitulo={topDoctor ? "Los 10 doctores con más valor en órdenes" : undefined}
        cifra={topDoctor ? cop(totalDoctores) : undefined}
        vacio={!topDoctor ? "Cuando las órdenes tengan doctor remitente, aquí verás quiénes aportan más." : undefined}
        comoSeCalcula="suma del precio de los ítems de las órdenes no canceladas del rango, por doctor remitente."
      >
        <BarrasLista filas={d.topDoctores.map((x) => ({ nombre: x.nombre, n: x.valor, valor: cop(x.valor), extra: `${pct(x.valor, totalDoctores)} %` }))} />
      </TarjetaGrafica>
    </div>
  );
}
