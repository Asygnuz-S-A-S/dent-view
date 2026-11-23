import { prisma } from "@dent-view/db";
import { AlertTriangle, CheckCircle2, Clock, Search, TrendingDown } from "lucide-react";
import Link from "next/link";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { EstadoVacio } from "@/components/comunes/estado-vacio";
import { FiltrosUrl } from "@/components/comunes/filtros-url";
import { Kpi } from "@/components/comunes/kpi";
import { CrearSeguimiento, GenerarSeguimientos, UmbralesDialog } from "@/components/seguimiento-doctores/acciones";
import { Sparkline } from "@/components/seguimiento-doctores/sparkline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fechaCorta } from "@/lib/fechas";
import { cop } from "@/lib/formato";
import { GESTION } from "@/lib/roles";
import {
  ETIQUETA_ESTADO_SEG_DOCTOR, ETIQUETA_SEMAFORO, motivoParaSemaforo, ordenarDoctores, ORDENES_LISTA, requiereGestion, SEMAFOROS, VARIANTE_SEMAFORO, type OrdenLista, type Semaforo,
} from "@/lib/seguimiento-doctores";
import { cargarDoctores, cargarUmbrales, sincronizarRecuperados } from "@/lib/seguimiento-doctores-datos";
import { exigirContexto } from "@/lib/sesion";

export const dynamic = "force-dynamic";

type Params = { estado?: string; especialidad?: string; convenio?: string; responsable?: string; q?: string; orden?: string };
const TENDENCIA = { SUBE: "↑ Sube", BAJA: "↓ Baja", ESTABLE: "→ Estable" } as const;
const ETIQUETA_ORDEN: Record<OrdenLista, string> = { riesgo: "Más urgentes", ultima: "Más tiempo sin enviar", ingresos: "Mayores ingresos", nombre: "Nombre" };

export default async function SeguimientoDoctores({ searchParams }: { searchParams: Promise<Params> }) {
  const ctx = await exigirContexto(GESTION);
  const org = ctx.organizationId;
  const p = await searchParams;
  await sincronizarRecuperados(org);
  const [todos, umbrales, responsables, convenios] = await Promise.all([
    cargarDoctores(org),
    cargarUmbrales(org),
    prisma.member.findMany({ where: { organizationId: org, role: { in: [...GESTION] } }, include: { user: { select: { name: true } } } }),
    prisma.convenio.findMany({ where: { organizationId: org, activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }),
  ]);
  const listaResp = responsables.map((m) => ({ id: m.userId, nombre: m.user.name }));

  const q = (p.q ?? "").trim().toLowerCase();
  const orden = ORDENES_LISTA.find((o) => o === p.orden) ?? "riesgo";
  const filtrados = ordenarDoctores(todos.filter((d) =>
    (!p.estado || d.semaforo === p.estado) &&
    (!p.especialidad || d.especialidad === p.especialidad) &&
    (!p.convenio || (p.convenio === "sin" ? !d.convenio : d.convenio?.id === p.convenio)) &&
    (!p.responsable || d.abierto?.responsableId === p.responsable) &&
    (!q || d.nombre.toLowerCase().includes(q) || d.correo.toLowerCase().includes(q))), orden);

  const cuenta = (...s: Semaforo[]) => todos.filter((d) => s.includes(d.semaforo)).length;
  const ingresosRiesgo = todos.filter((d) => requiereGestion(d.semaforo)).reduce((s, d) => s + d.ingresos12m, 0);
  const especialidades = [...new Set(todos.map((d) => d.especialidad).filter((x): x is string => !!x))].sort();
  const hoy = new Date();

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Seguimiento de doctores"
        descripcion={`Doctores remitentes a retener. En riesgo: más de ${umbrales.umbralRiesgoFactor} veces su intervalo habitual sin enviar; inactivo desde ${umbrales.diasInactivo} días y crítico desde ${umbrales.diasInactivoCritico}.`}
        acciones={<>{ctx.rol === "admin_tenant" && <UmbralesDialog umbrales={umbrales} />}<GenerarSeguimientos /></>}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi titulo="Activos" valor={cuenta("ACTIVO")} nota={`${cuenta("NUEVO")} nuevos`} icono={CheckCircle2} tono="success" href="/seguimiento-doctores?estado=ACTIVO" />
        <Kpi titulo="En riesgo" valor={cuenta("EN_RIESGO")} icono={AlertTriangle} tono={cuenta("EN_RIESGO") ? "warning" : "primary"} href="/seguimiento-doctores?estado=EN_RIESGO" />
        <Kpi titulo="Inactivos" valor={cuenta("INACTIVO", "CRITICO")} nota={`${cuenta("CRITICO")} críticos`} icono={Clock} tono={cuenta("INACTIVO", "CRITICO") ? "danger" : "primary"} href="/seguimiento-doctores?estado=INACTIVO" />
        <Kpi titulo="Ingresos en riesgo" valor={cop(ingresosRiesgo)} nota="Facturado en 12 meses por doctores en riesgo o inactivos" icono={TrendingDown} tono="violet" />
      </div>

      <div className="space-y-3">
        <form className="flex max-w-md gap-2" role="search">
          {(["estado", "especialidad", "convenio", "responsable", "orden"] as const).map((k) => p[k] && <input key={k} type="hidden" name={k} value={p[k]} />)}
          <Input name="q" defaultValue={p.q ?? ""} placeholder="Nombre o correo del doctor" aria-label="Buscar doctor" />
          <Button type="submit" variant="secondary"><Search /> Buscar</Button>
        </form>
        <FiltrosUrl filtros={[
          { tipo: "select", clave: "estado", etiqueta: "Estado", todos: "Todos los estados", opciones: SEMAFOROS.map((s) => ({ valor: s, texto: ETIQUETA_SEMAFORO[s] })) },
          { tipo: "select", clave: "especialidad", etiqueta: "Especialidad", todos: "Todas las especialidades", opciones: especialidades.map((e) => ({ valor: e, texto: e })), ancho: "w-52" },
          { tipo: "select", clave: "convenio", etiqueta: "Convenio", todos: "Todos los convenios", opciones: [{ valor: "sin", texto: "Sin convenio" }, ...convenios.map((c) => ({ valor: c.id, texto: c.nombre }))], ancho: "w-52" },
          { tipo: "select", clave: "responsable", etiqueta: "Responsable", todos: "Todos los responsables", opciones: listaResp.map((r) => ({ valor: r.id, texto: r.nombre })), ancho: "w-52" },
          { tipo: "select", clave: "orden", etiqueta: "Ordenar por", todos: ETIQUETA_ORDEN.riesgo, opciones: ORDENES_LISTA.filter((o) => o !== "riesgo").map((o) => ({ valor: o, texto: ETIQUETA_ORDEN[o] })), ancho: "w-52" },
        ]} />
      </div>

      <Card className="py-0"><CardContent className="px-0">
        {filtrados.length === 0 ? (
          <EstadoVacio titulo={todos.length ? "Ningún doctor coincide con los filtros" : "Aún no hay doctores remitentes"} descripcion={todos.length ? "Cambia o limpia los filtros." : "Agrégalos en Doctores remitentes para seguir su actividad."} />
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead className="pl-4 md:pl-6">Doctor</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="hidden lg:table-cell">Última remisión</TableHead>
              <TableHead className="hidden xl:table-cell">Promedio y tendencia</TableHead>
              <TableHead className="hidden lg:table-cell text-right">Ingresos 12 meses</TableHead>
              <TableHead className="hidden xl:table-cell">Responsable y próximo contacto</TableHead>
              <TableHead className="pr-4 md:pr-6 text-right">Acciones</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtrados.map((d) => (
                <TableRow key={d.doctorId} data-semaforo={d.semaforo}>
                  <TableCell className="max-w-[14rem] whitespace-normal pl-4 md:pl-6">
                    <Link className="font-medium underline-offset-4 hover:underline" href={`/seguimiento-doctores/${d.doctorId}`}>{d.nombre}</Link>
                    <span className="block truncate text-xs text-muted-foreground">{d.especialidad ?? d.correo}</span>
                    <span className="block text-xs text-muted-foreground lg:hidden">{d.ultimaRemision ? `Última: ${fechaCorta(d.ultimaRemision)}` : "Sin remisiones"} · {cop(d.ingresos12m)}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={VARIANTE_SEMAFORO[d.semaforo]}>{ETIQUETA_SEMAFORO[d.semaforo]}</Badge>
                    {d.abierto && <span className="mt-1 block text-xs text-muted-foreground">{ETIQUETA_ESTADO_SEG_DOCTOR[d.abierto.estado]}</span>}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {d.ultimaRemision ? <>{fechaCorta(d.ultimaRemision)}<span className="block text-xs text-muted-foreground">hace {d.diasSinEnviar} días</span></> : "—"}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell"><div className="flex items-center gap-2"><Sparkline valores={d.porMes.map((m) => m.n)} /><span className="text-xs text-muted-foreground"><span className="tabular-nums">{d.promedioMensual.toFixed(1)}</span>/mes<br />{TENDENCIA[d.tendencia]}</span></div></TableCell>
                  <TableCell className="hidden lg:table-cell text-right tabular-nums">{cop(d.ingresos12m)}</TableCell>
                  <TableCell className="hidden xl:table-cell">{d.responsable ?? "—"}<span className="block text-xs text-muted-foreground">{d.abierto?.proximoContacto ? `Próx.: ${fechaCorta(d.abierto.proximoContacto)}` : "Sin fecha"}</span></TableCell>
                  <TableCell className="pr-4 md:pr-6 text-right">
                    {d.abierto
                      ? <Button asChild size="sm" variant="outline"><Link href={`/seguimiento-doctores/${d.doctorId}`}>Ver seguimiento</Link></Button>
                      : <CrearSeguimiento doctorId={d.doctorId} nombre={d.nombre} motivo={requiereGestion(d.semaforo) ? motivoParaSemaforo(d.semaforo) : "OTRO"} responsables={listaResp} />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>
      <p className="text-xs text-muted-foreground">Cifras de remisión y facturación; sin datos clínicos. Calculado a {fechaCorta(hoy)} (hora de Bogotá).</p>
    </div>
  );
}
