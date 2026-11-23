import { Search } from "lucide-react";
import Link from "next/link";
import { prisma } from "@dent-view/db";
import { AltaLead, ImportarCsv } from "@/components/crm/alta-lead";
import { Tablero, type TarjetaLead } from "@/components/crm/tablero";
import { EncabezadoPagina } from "@/components/comunes/encabezado-pagina";
import { EstadoVacio } from "@/components/comunes/estado-vacio";
import { FiltrosUrl } from "@/components/comunes/filtros-url";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ETAPAS, ETIQUETA_ETAPA, etiquetaOrigen, ORIGENES, type Etapa } from "@/lib/crm";
import { cargarResponsables, dondeLeads, esGestion, SELECT_TARJETA, type FiltrosLeads } from "@/lib/crm-datos";
import { fechaCorta } from "@/lib/fechas";
import { cop } from "@/lib/formato";
import { CLINICOS } from "@/lib/roles";
import { exigirContexto } from "@/lib/sesion";

export const dynamic = "force-dynamic";
const POR_PAGINA = 50;
const TOPE_TABLERO = 400;
const VARIANTE: Record<Etapa, "secondary" | "info" | "violet" | "warning" | "success" | "danger"> = {
  NUEVO: "secondary", CONTACTADO: "info", VALORACION_AGENDADA: "violet", VALORACION_REALIZADA: "violet", PROPUESTA: "warning", GANADO: "success", PERDIDO: "danger",
};

export default async function Leads({ searchParams }: { searchParams: Promise<FiltrosLeads & { vista?: string; pagina?: string }> }) {
  const ctx = await exigirContexto(CLINICOS);
  const gestion = esGestion(ctx.rol);
  const p = await searchParams;
  const vista = p.vista === "lista" ? "lista" : "tablero";
  const donde = dondeLeads(ctx, p);
  const pagina = Math.max(1, Number(p.pagina) || 1);
  const [responsables, intereses, total, leads] = await Promise.all([
    cargarResponsables(ctx.organizationId),
    prisma.lead.findMany({ where: { organizationId: ctx.organizationId, interes: { not: null } }, distinct: ["interes"], select: { interes: true }, orderBy: { interes: "asc" }, take: 40 }),
    prisma.lead.count({ where: donde }),
    prisma.lead.findMany({
      where: donde, select: SELECT_TARJETA, orderBy: { creadoEn: "desc" },
      skip: vista === "lista" ? (pagina - 1) * POR_PAGINA : 0, take: vista === "lista" ? POR_PAGINA : TOPE_TABLERO,
    }),
  ]);
  const tarjetas: TarjetaLead[] = leads.map((l) => ({
    id: l.id, nombre: l.nombre, etapa: l.etapa as Etapa, origen: l.origen, interes: l.interes, valorEstimado: l.valorEstimado,
    proximoContacto: l.proximoContacto?.toISOString() ?? null, noContactar: l.noContactar, responsable: l.responsable?.name ?? null,
  }));
  const enlace = (extra: Record<string, string>) => {
    const q = new URLSearchParams(Object.entries({ ...p, ...extra }).filter(([, v]) => v) as [string, string][]);
    return `/crm/leads?${q}`;
  };

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Leads"
        descripcion={gestion ? "Personas interesadas en tus servicios. Muévelas de etapa, registra cada contacto y deja que las secuencias hagan el seguimiento." : "Los leads que tienes asignados. Puedes consultarlos y agregar notas."}
        acciones={gestion ? <><ImportarCsv /><AltaLead responsables={responsables} /></> : undefined}
      />
      <div className="space-y-3">
        <form className="flex max-w-md gap-2" role="search">
          {(Object.keys(p) as (keyof typeof p)[]).filter((k) => k !== "q" && k !== "pagina" && p[k]).map((k) => <input key={k} type="hidden" name={k} value={p[k]} />)}
          <Input name="q" defaultValue={p.q ?? ""} placeholder="Nombre, correo, teléfono o interés" aria-label="Buscar lead" />
          <Button type="submit" variant="secondary"><Search /> Buscar</Button>
        </form>
        <FiltrosUrl filtros={[
          { tipo: "select", clave: "etapa", etiqueta: "Etapa", todos: "Todas las etapas", opciones: ETAPAS.map((e) => ({ valor: e, texto: ETIQUETA_ETAPA[e] })) },
          ...(gestion ? [{ tipo: "select" as const, clave: "responsable", etiqueta: "Responsable", todos: "Todos los responsables", opciones: [{ valor: "sin", texto: "Sin responsable" }, ...responsables.map((r) => ({ valor: r.id, texto: r.nombre }))], ancho: "w-52" }] : []),
          { tipo: "select", clave: "origen", etiqueta: "Origen", todos: "Todos los orígenes", opciones: ORIGENES.map((o) => ({ valor: o, texto: etiquetaOrigen(o) })) },
          { tipo: "select", clave: "interes", etiqueta: "Interés", todos: "Todos los intereses", opciones: intereses.map((i) => ({ valor: i.interes!, texto: i.interes! })), ancho: "w-52" },
          { tipo: "select", clave: "sinContacto", etiqueta: "Sin contacto", todos: "Sin filtro de contacto", opciones: [3, 7, 14, 30].map((n) => ({ valor: String(n), texto: `Sin contacto hace ${n}+ días` })), ancho: "w-56" },
          { tipo: "fecha", clave: "desde", etiqueta: "Creados desde" },
        ]} />
        <div role="group" aria-label="Tipo de vista" className="inline-flex rounded-lg border p-0.5 text-sm">
          {(["tablero", "lista"] as const).map((v) => (
            <Link key={v} href={enlace({ vista: v, pagina: "" })} aria-current={vista === v ? "true" : undefined} className={`rounded-md px-3 py-1 ${vista === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{v === "tablero" ? "Tablero" : "Lista"}</Link>
          ))}
        </div>
      </div>

      {total === 0 ? (
        <EstadoVacio titulo="No hay leads con estos filtros" descripcion={gestion ? "Crea un lead, importa un CSV o quita los filtros. Los leads de la valoración virtual aparecen aquí solos." : "Cuando te asignen leads aparecerán aquí."} />
      ) : vista === "tablero" ? (
        <>
          {total > TOPE_TABLERO && <p role="status" className="text-sm text-muted-foreground">Mostrando los {TOPE_TABLERO} más recientes de {total}. Afina los filtros o usa la lista.</p>}
          <Tablero leads={tarjetas} puedeMover={gestion} />
        </>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader><TableRow><TableHead>Nombre</TableHead><TableHead>Etapa</TableHead><TableHead>Origen</TableHead><TableHead>Interés</TableHead><TableHead>Responsable</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Último contacto</TableHead><TableHead>Creado</TableHead></TableRow></TableHeader>
              <TableBody>
                {leads.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell><Link href={`/crm/leads/${l.id}`} className="font-medium hover:underline">{l.nombre}</Link>{l.noContactar && <Badge variant="danger" className="ml-2">No contactar</Badge>}</TableCell>
                    <TableCell><Badge variant={VARIANTE[l.etapa as Etapa]}>{ETIQUETA_ETAPA[l.etapa as Etapa]}</Badge></TableCell>
                    <TableCell>{etiquetaOrigen(l.origen)}</TableCell><TableCell>{l.interes ?? "—"}</TableCell><TableCell>{l.responsable?.name ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.valorEstimado ? cop(l.valorEstimado) : "—"}</TableCell>
                    <TableCell>{fechaCorta(l.ultimoContactoEn)}</TableCell><TableCell>{fechaCorta(l.creadoEn)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <nav aria-label="Paginación" className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{total} leads · página {pagina} de {Math.max(1, Math.ceil(total / POR_PAGINA))}</span>
            <span className="flex gap-2">
              {pagina > 1 && <Button asChild variant="outline" size="sm"><Link href={enlace({ vista: "lista", pagina: String(pagina - 1) })}>Anterior</Link></Button>}
              {pagina * POR_PAGINA < total && <Button asChild variant="outline" size="sm"><Link href={enlace({ vista: "lista", pagina: String(pagina + 1) })}>Siguiente</Link></Button>}
            </span>
          </nav>
        </>
      )}
    </div>
  );
}
